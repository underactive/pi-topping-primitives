// Unit tests for the hygiene scanner, plus a scan of the shipped source trees.
// The snippets are the specification: each rule has at least one case that must
// fire and one look-alike that must not, because most of the scanner's value is
// in what it deliberately leaves alone.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Finding, HygieneRule } from "../tools/hygiene.js";
import { scanSource, scanTree } from "../tools/hygiene.js";

/** Repo root, resolved from this module so the tree scans do not depend on the cwd. */
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** A path outside the pi-free subpaths, where pi imports are allowed. */
const MENU = "packages/primitives/src/menu/index.ts";
/** A path where pi must never be imported at runtime. */
const CONTRACTS = "packages/primitives/src/contracts/index.ts";
/** The other pi-free paths. `activity-tui` and `text` are deliberately not covered. */
const ACTIVITY = "packages/primitives/src/activity/index.ts";
const ACTIVITY_TUI = "packages/primitives/src/activity-tui/index.ts";
const COLOR = "packages/primitives/src/color/rgb.ts";
const GLYPHS = "packages/primitives/src/glyphs/index.ts";
/** Runs pi-tui at runtime by design: `layout.ts` measures with `visibleWidth`. */
const TEXT = "packages/primitives/src/text/layout.ts";

function scan(text: string, file = MENU, rules?: readonly HygieneRule[]) {
	return scanSource(file, text, rules === undefined ? undefined : { rules });
}

/** Readable failure message: the future violation, not a bare array diff. */
function describe(findings: readonly Finding[]): string {
	const lines = findings.map(
		(finding) =>
			`${finding.file}:${finding.line} [${finding.rule}] ${finding.text}`,
	);
	return `${findings.length} finding(s):\n${lines.join("\n")}`;
}

test("module-state fires on a top-level let and on a top-level var", () => {
	assert.deepEqual(scan("let counter = 0;\n"), [
		{
			file: MENU,
			line: 1,
			rule: "module-state",
			text: "let counter = 0;",
		},
	]);
	assert.deepEqual(
		scan("var legacy = 1;\n").map((finding) => finding.rule),
		["module-state"],
	);
	// `export` does not change the scope of the binding.
	assert.deepEqual(
		scan("export let counter = 0;\n").map((finding) => finding.rule),
		["module-state"],
	);
});

test("module-state fires on a top-level collection literal", () => {
	for (const collection of ["Map", "Set", "WeakMap", "WeakSet"]) {
		const findings = scan(`const catalogue = new ${collection}();\n`);
		assert.deepEqual(findings, [
			{
				file: MENU,
				line: 1,
				rule: "module-state",
				text: `const catalogue = new ${collection}();`,
			},
		]);
	}

	// Generic arguments and a spread argument are the same declaration.
	assert.deepEqual(
		scan('const cache = new Map<string, number>([["a", 1]]);\n').map(
			(finding) => finding.rule,
		),
		["module-state"],
	);
});

test("module-state fires on a module-level object or array that the file mutates", () => {
	assert.deepEqual(
		scan("const cache = {};\ncache.hits = 0;\n").map((f) => f.rule),
		["module-state"],
	);
	assert.deepEqual(
		scan('const seen: string[] = [];\nseen.push("a");\n').map((f) => f.rule),
		["module-state"],
	);
	assert.deepEqual(
		scan("const table = {};\ntable[key] = 1;\n").map((f) => f.rule),
		["module-state"],
	);
});

test("module-state ignores a constant table that is never written", () => {
	const text = [
		"const DEFAULTS = { width: 8 };",
		"const LEVELS = [1, 2, 3];",
		'export const CHANNELS = Object.freeze({ routed: "x" });',
		"",
	].join("\n");
	assert.deepEqual(scan(text), []);
});

test("module-state ignores a factory call whose type mentions Map", () => {
	// The rule is about a mutable module binding, not about the word Map: a
	// factory may close over per-call state, so only `new Map|Set|WeakMap|WeakSet(`
	// is a finding.
	assert.deepEqual(
		scan("const cache: Map<string, number> = makeCache();\n"),
		[],
	);
	assert.deepEqual(
		scan("const ids: ReadonlySet<string> = collectIds();\n"),
		[],
	);
});

test("module-state ignores bindings inside a function body", () => {
	const text = [
		"function createCounter() {",
		"\tlet value = 0;",
		"\tconst index = new Map<string, number>();",
		"\treturn () => value + index.size;",
		"}",
		"",
	].join("\n");
	assert.deepEqual(scan(text), []);
});

test("module-state ignores a binding inside a one-line function body", () => {
	// Brace depth has to be tracked per character: this line starts at depth 0 and
	// closes at depth 0, and the binding it holds is not module state.
	assert.deepEqual(
		scan("const next = () => { let value = 0; return value; };\n"),
		[],
	);
});

test("module-state ignores a for-loop binding and a class field", () => {
	assert.deepEqual(
		scan(
			"for (let index = 0; index < 3; index += 1) {\n\ttotal += index;\n}\n",
		),
		[],
	);
	assert.deepEqual(
		scan("class Store {\n\tcache = new Map<string, number>();\n}\n"),
		[],
	);
	assert.deepEqual(
		scan("const config = {\n\tcache: new Map<string, number>(),\n};\n"),
		[],
	);
});

test("module-state ignores comments and strings that contain the words", () => {
	const text = [
		"// let counter = 0;",
		"/* const cache = new Map(); */",
		'const note = "let counter = 0; const cache = new Map();";',
		"const other = `let counter = 0;`;",
		"",
	].join("\n");
	assert.deepEqual(scan(text), []);
});

test("module-state survives a regular expression that contains braces", () => {
	// A regex body must be blanked: mis-lexing it counts `{` as a block opener and
	// silences module-state for the rest of the file.
	const text = "const WIDE = /\\u{1F300}-\\u{1FAFF}/u;\nlet counter = 0;\n";
	assert.deepEqual(
		scan(text).map((finding) => `${finding.line}:${finding.rule}`),
		["2:module-state"],
	);
});

test("brace depth survives a nested template literal", () => {
	const text = [
		// biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholders are literal source under test
		'const label = `${items.map((item) => ({ id: `n-${item.id}` })).join(",")}`;',
		"let counter = 0;",
		"",
	].join("\n");
	assert.deepEqual(
		scan(text).map((finding) => `${finding.line}:${finding.rule}`),
		["2:module-state"],
	);
});

test("a division is not read as the start of a regular expression", () => {
	// Reading `/` as a regex start would blank the remainder of the line and hide
	// this console call.
	assert.deepEqual(
		scan("const scale = a / b; console.log(scale);\n").map(
			(finding) => finding.rule,
		),
		["console"],
	);
});

test("instanceof fires on a class that is not a host built-in", () => {
	assert.deepEqual(scan("if (error instanceof ToppingError) throw error;\n"), [
		{
			file: MENU,
			line: 1,
			rule: "instanceof",
			text: "if (error instanceof ToppingError) throw error;",
		},
	]);
	// Cross-package `instanceof` through a namespace import is the same hazard.
	assert.deepEqual(
		scan("const typed = value instanceof tui.Component;\n").map((f) => f.rule),
		["instanceof"],
	);
});

test("instanceof ignores the host built-ins", () => {
	const text = [
		"if (error instanceof Error) return;",
		"if (error instanceof TypeError) return;",
		"if (error instanceof DOMException) return;",
		"if (value instanceof Promise) return;",
		"if (value instanceof Uint8Array) return;",
		"",
	].join("\n");
	assert.deepEqual(scan(text), []);
});

test("instanceof judges a parenthesised or computed right-hand side", () => {
	// The operator is matched first and the right-hand side judged after, so a form that
	// is not a bare identifier cannot slip past by simply not matching a pattern.
	assert.deepEqual(
		scan("if (value instanceof (Error)) return;\n").map((f) => f.rule),
		[],
	);
	assert.deepEqual(
		scan("if (value instanceof (ToppingError)) return;\n").map((f) => f.rule),
		["instanceof"],
	);
	assert.deepEqual(
		scan("if (value instanceof classes[i]) return;\n").map((f) => f.rule),
		["instanceof"],
	);
});

test("instanceof ignores comments and strings that contain the operator", () => {
	const text = [
		"// error instanceof ToppingError",
		'const message = "error instanceof ToppingError";',
		"",
	].join("\n");
	assert.deepEqual(scan(text), []);
});

test("console fires on a member reference", () => {
	assert.deepEqual(scan('console.log("ready");\n'), [
		{
			file: MENU,
			line: 1,
			rule: "console",
			text: 'console.log("ready");',
		},
	]);
	// Optional chaining is still a member reference.
	assert.deepEqual(
		scan('console?.warn("quiet");\n').map((finding) => finding.rule),
		["console"],
	);
	// Depth is irrelevant: a console call inside a function is still a console call.
	assert.deepEqual(
		scan('function render() {\n\tconsole.error("bad");\n}\n').map(
			(finding) => finding.line,
		),
		[2],
	);
});

test("console ignores identifiers that merely start with console", () => {
	const text = [
		"const consoleLike = new FakeConsole();",
		"const console_ = consoleLike;",
		'const message = "console.log(1)";',
		"// console.log(1)",
		"",
	].join("\n");
	assert.deepEqual(scan(text), []);
});

test("pi-runtime-import fires on a value import from a pi package", () => {
	assert.deepEqual(
		scan('import { visibleWidth } from "@earendil-works/pi-tui";\n', CONTRACTS),
		[
			{
				file: CONTRACTS,
				line: 1,
				rule: "pi-runtime-import",
				text: 'import { visibleWidth } from "@earendil-works/pi-tui";',
			},
		],
	);
	assert.deepEqual(
		scan('export * from "@earendil-works/pi-ai";\n', ACTIVITY).map(
			(f) => f.rule,
		),
		["pi-runtime-import"],
	);
});

test("pi-runtime-import fires on an inline type member in a value import", () => {
	// Under `verbatimModuleSyntax` the statement is still a runtime import, so the
	// inline `type` marker does not make it safe.
	const text =
		'import { type Component, visibleWidth } from "@earendil-works/pi-tui";\n';
	assert.deepEqual(
		scan(text, CONTRACTS).map((finding) => finding.rule),
		["pi-runtime-import"],
	);
});

test("pi-runtime-import fires on a dynamic import", () => {
	assert.deepEqual(
		scan(
			'async function load() {\n\treturn await import("@earendil-works/pi-tui");\n}\n',
			CONTRACTS,
		),
		[
			{
				file: CONTRACTS,
				line: 2,
				rule: "pi-runtime-import",
				text: 'return await import("@earendil-works/pi-tui");',
			},
		],
	);
	// Also at module scope, where there is no enclosing statement to inherit.
	assert.deepEqual(
		scan(
			'const tui = await import("@earendil-works/pi-tui");\n',
			CONTRACTS,
		).map((finding) => finding.line),
		[1],
	);
});

test("pi-runtime-import ignores an import type statement", () => {
	assert.deepEqual(
		scan(
			'import type { Component } from "@earendil-works/pi-tui";\n',
			CONTRACTS,
		),
		[],
	);
	assert.deepEqual(
		scan(
			'export type { Component } from "@earendil-works/pi-tui";\n',
			CONTRACTS,
		),
		[],
	);
});

test("pi-runtime-import reads a multi-line import statement", () => {
	// Reported at the statement's first line: that is where a reader looks and
	// where a hygiene-allow directive goes.
	const value =
		'import {\n\ttype Component,\n\tvisibleWidth,\n} from "@earendil-works/pi-tui";\n';
	assert.deepEqual(scan(value, CONTRACTS), [
		{
			file: CONTRACTS,
			line: 1,
			rule: "pi-runtime-import",
			text: "import {",
		},
	]);

	const typeOnly =
		'import type {\n\tComponent,\n} from "@earendil-works/pi-tui";\n';
	assert.deepEqual(scan(typeOnly, CONTRACTS), []);
});

test("pi-runtime-import is limited to the pi-free subpaths", () => {
	const text = 'import { visibleWidth } from "@earendil-works/pi-tui";\n';
	// Rendering subpaths do import pi at runtime; that is the packaging recipe.
	assert.deepEqual(scan(text, MENU), []);
	assert.deepEqual(scan(text, ACTIVITY_TUI), []);
	// Only whole path segments count, never a file name that contains the word.
	assert.deepEqual(
		scan(text, "packages/primitives/src/contracts/index.test.ts").map(
			(finding) => finding.rule,
		),
		["pi-runtime-import"],
	);
});

test("pi-runtime-import covers the colour and glyph subpaths but not text", () => {
	const value = 'import { visibleWidth } from "@earendil-works/pi-tui";\n';
	for (const file of [COLOR, GLYPHS]) {
		assert.deepEqual(
			scan(value, file).map((finding) => finding.rule),
			["pi-runtime-import"],
			file,
		);
	}
	// `text/layout.ts` is the one place those subpaths import pi-tui at runtime.
	assert.deepEqual(scan(value, TEXT), []);

	// The type-only forms `./color` actually uses stay clean.
	for (const typeOnly of [
		'import type { TerminalColorMode } from "@earendil-works/pi-tui";\n',
		'export type { TerminalColorMode } from "@earendil-works/pi-tui";\n',
	]) {
		assert.deepEqual(scan(typeOnly, COLOR), [], typeOnly);
	}

	// An inline `type` marker inside a braced value import is still a runtime import.
	assert.deepEqual(
		scan(
			'export { type TerminalColorMode } from "@earendil-works/pi-tui";\n',
			COLOR,
		).map((finding) => finding.rule),
		["pi-runtime-import"],
	);

	// Only the directory straight under `src` names the subpath: a checkout under a directory
	// that happens to be called `color`, or a nested folder with that name, does not count.
	assert.deepEqual(
		scan(
			value,
			"/work/color/pi-topping-primitives/packages/primitives/src/menu/index.ts",
		),
		[],
	);
	assert.deepEqual(
		scan(value, "packages/primitives/src/models/color/picker.ts"),
		[],
	);
	assert.deepEqual(
		scan(
			value,
			"/work/glyphs/pi-topping-primitives/packages/primitives/src/color/rgb.ts",
		).map((finding) => finding.rule),
		["pi-runtime-import"],
	);

	// A file merely named `color.ts` in another subpath is not in a pi-free directory.
	assert.deepEqual(scan(value, "packages/primitives/src/menu/color.ts"), []);
	assert.deepEqual(scan(value, "packages/primitives/src/models/glyphs.ts"), []);
});

test("pi-runtime-import ignores non-pi specifiers and comments", () => {
	const text = [
		'import { readFile } from "node:fs";',
		'import { join } from "node:path";',
		'// import { visibleWidth } from "@earendil-works/pi-tui";',
		'const note = "from @earendil-works/pi-tui";',
		"",
	].join("\n");
	assert.deepEqual(scan(text, CONTRACTS), []);
});

test("a same-line hygiene-allow directive suppresses only the named rule", () => {
	const allowed =
		"const catalogue = new WeakMap(); // hygiene-allow: module-state the catalogue is keyed by registry so it dies with it\n";
	assert.deepEqual(scan(allowed), []);

	const otherRule =
		"const catalogue = new WeakMap(); // hygiene-allow: console silence the deprecation path\n";
	assert.deepEqual(
		scan(otherRule).map((finding) => finding.rule),
		["module-state"],
	);
});

test("a hygiene-allow directive on the line above suppresses the rule", () => {
	const text =
		"// hygiene-allow: module-state a process-wide cache is deliberate here\nconst catalogue = new WeakMap();\n";
	assert.deepEqual(scan(text), []);
});

test("a hygiene-allow directive without a reason does not suppress", () => {
	for (const text of [
		"// hygiene-allow: module-state\nconst catalogue = new WeakMap();\n",
		"// hygiene-allow:\nconst catalogue = new WeakMap();\n",
		"const catalogue = new WeakMap(); // hygiene-allow: module-state   \n",
	]) {
		assert.deepEqual(
			scan(text).map((finding) => finding.rule),
			["module-state"],
			`an escape hatch with no reason must not suppress: ${JSON.stringify(text)}`,
		);
	}
});

test("a hygiene-allow directive covers only its own line and the next one", () => {
	const text = [
		"// hygiene-allow: console the banner is the point of this branch",
		"",
		'console.log("banner");',
		"",
	].join("\n");
	assert.deepEqual(
		scan(text).map((finding) => finding.line),
		[3],
	);
});

test("the rules option narrows the scan", () => {
	const text = "let counter = 0;\nconsole.log(counter);\n";
	assert.deepEqual(
		scan(text, MENU, ["console"]).map((finding) => finding.rule),
		["console"],
	);
});

test("findings report a 1-based line and the trimmed source line", () => {
	const findings = scan("const a = 1;\n\n    let counter = 0;\n");
	assert.deepEqual(findings, [
		{
			file: MENU,
			line: 3,
			rule: "module-state",
			text: "let counter = 0;",
		},
	]);
});

test("scanTree reports nothing in the shipped source trees", () => {
	const findings = [
		...scanTree(join(REPO_ROOT, "packages/primitives/src")),
		...scanTree(join(REPO_ROOT, "packages/test-utils/src")),
	];
	assert.deepEqual(findings, [], describe(findings));
});

test("the tree scan is live: an injected violation in a real file is reported", () => {
	const file = CONTRACTS;
	const source = readFileSync(join(REPO_ROOT, file), "utf8");
	const injected = `${source}\nimport { visibleWidth } from "@earendil-works/pi-tui";\nlet twice = 0;\n`;
	assert.deepEqual(
		scanSource(file, injected).map((finding) => finding.rule),
		["pi-runtime-import", "module-state"],
	);
});
