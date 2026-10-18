/**
 * Hygiene scanner for the primitives hard rules in sections 1 and 8 of
 * `HANDOFF_PRIMITIVES.md`. It turns those prose rules into findings so CI can
 * fail on a regression instead of a reviewer having to notice one.
 *
 * The scan is line-oriented in spirit but lexes each file first: comments,
 * string bodies and regular-expression bodies are blanked into a same-length
 * "code view". Every index therefore means the same thing in both views, so a
 * pattern hit in the code view maps straight back to the reported source line
 * and to the brace depth recorded for that position. That is what keeps a
 * comment or a string that merely contains `console.log` from being a finding.
 *
 * `scanSource` is pure: same text in, same findings out, no I/O.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type HygieneRule =
	| "module-state"
	| "instanceof"
	| "console"
	| "pi-runtime-import";

export interface Finding {
	file: string;
	line: number; // 1-based
	rule: HygieneRule;
	text: string; // the offending source line, trimmed
}

export interface ScanOptions {
	rules?: readonly HygieneRule[]; // default: all four
}

/** Declaration order is also the tie-break order for findings on one line. */
const ALL_RULES: readonly HygieneRule[] = [
	"module-state",
	"instanceof",
	"console",
	"pi-runtime-import",
];

/**
 * Built-ins that are identical across package copies because they come from the
 * host realm. Any other right-hand side is a class defined by some package, and
 * `instanceof` against it breaks the moment two copies are loaded.
 */
const ALLOWED_INSTANCEOF: ReadonlySet<string> = new Set([
	"Error",
	"TypeError",
	"RangeError",
	"SyntaxError",
	"ReferenceError",
	"EvalError",
	"URIError",
	"AggregateError",
	"DOMException",
	"Date",
	"RegExp",
	"Map",
	"Set",
	"WeakMap",
	"WeakSet",
	"Array",
	"ArrayBuffer",
	"SharedArrayBuffer",
	"DataView",
	"Int8Array",
	"Uint8Array",
	"Uint8ClampedArray",
	"Int16Array",
	"Uint16Array",
	"Int32Array",
	"Uint32Array",
	"Float32Array",
	"Float64Array",
	"BigInt64Array",
	"BigUint64Array",
	"Promise",
	"URL",
	"AbortSignal",
	"AbortController",
	"Buffer",
	"Object",
	"Function",
]);

/** Only these subpaths may not import pi at runtime; every other subpath may. */
const PI_FREE_PATH_SEGMENTS: ReadonlySet<string> = new Set([
	"contracts",
	"activity",
]);

const PI_SCOPE_PREFIX = "@earendil-works/";

/** A string or template literal, recorded so the import rule can read specifiers. */
interface StringLiteral {
	/** Index of the first character inside the quotes. */
	start: number;
	/** Index of the closing quote or backtick. */
	end: number;
	/** Raw inner text. Escapes are not decoded, which is enough for specifiers. */
	value: string;
}

/** A comment, recorded so `hygiene-allow` directives are read from comments only. */
interface Comment {
	start: number;
	end: number;
	text: string;
}

interface Lexed {
	/** Same length as the source; comments, string bodies and regex bodies are spaces. */
	code: string;
	strings: StringLiteral[];
	comments: Comment[];
	/** Depth before each index. Reads as zero wherever the index is module scope. */
	braceDepth: Int32Array;
	parenDepth: Int32Array;
	bracketDepth: Int32Array;
}

type LexMode =
	| "code"
	| "line-comment"
	| "block-comment"
	| "single-quote"
	| "double-quote"
	| "template"
	| "regex";

/** Tokens that end an expression, so a following `/` divides rather than opens a regex. */
const REGEX_PRECEDING_CHARS = "(,=:[!&|?{};+-*%^~<>";

/** Keywords after which a `/` opens a regex rather than dividing. */
const REGEX_PRECEDING_WORDS: ReadonlySet<string> = new Set([
	"await",
	"case",
	"delete",
	"do",
	"else",
	"in",
	"instanceof",
	"new",
	"of",
	"return",
	"throw",
	"typeof",
	"void",
	"yield",
]);

function isWordChar(char: string): boolean {
	return /[\w$]/.test(char);
}

function regexAllowed(lastChar: string, lastWord: string): boolean {
	if (lastChar === "") return true;
	if (isWordChar(lastChar)) return REGEX_PRECEDING_WORDS.has(lastWord);
	return REGEX_PRECEDING_CHARS.includes(lastChar);
}

/**
 * Blank comments, string bodies and regex bodies, recording literals plus the
 * brace/paren/bracket depth before every index.
 */
function lex(text: string): Lexed {
	const length = text.length;
	// Prefill preserves newlines and blanks everything else, so a mode that does
	// not copy a character has already blanked it.
	const out: string[] = new Array(length);
	for (let index = 0; index < length; index += 1) {
		out[index] = text[index] === "\n" ? "\n" : " ";
	}

	const strings: StringLiteral[] = [];
	const comments: Comment[] = [];
	/** One entry per open `${ … }`, counting `{` seen since that `${`. */
	const templateExpressions: number[] = [];
	let mode: LexMode = "code";
	let literalStart = 0;
	let commentStart = 0;
	let regexInClass = false;
	let lastChar = "";
	let word = "";
	let lastWord = "";

	let index = 0;
	while (index < length) {
		const char = text[index] ?? "";
		const next = text[index + 1] ?? "";

		if (mode === "line-comment") {
			if (char === "\n") {
				comments.push({
					start: commentStart,
					end: index,
					text: text.slice(commentStart, index),
				});
				mode = "code";
				index += 1;
			} else {
				index += 1;
			}
			continue;
		}

		if (mode === "block-comment") {
			if (char === "*" && next === "/") {
				comments.push({
					start: commentStart,
					end: index + 2,
					text: text.slice(commentStart, index + 2),
				});
				mode = "code";
				index += 2;
			} else {
				index += 1;
			}
			continue;
		}

		if (mode === "single-quote" || mode === "double-quote") {
			const quote = mode === "single-quote" ? "'" : '"';
			if (char === "\\") {
				index += 2;
				continue;
			}
			if (char === quote || char === "\n") {
				strings.push({
					start: literalStart,
					end: index,
					value: text.slice(literalStart, index),
				});
				// A closed string is a value: a following `/` divides.
				lastChar = quote;
				lastWord = "";
				mode = "code";
				index += 1;
				continue;
			}
			index += 1;
			continue;
		}

		if (mode === "template") {
			if (char === "\\") {
				index += 2;
				continue;
			}
			if (char === "`") {
				strings.push({
					start: literalStart,
					end: index,
					value: text.slice(literalStart, index),
				});
				lastChar = "`";
				lastWord = "";
				mode = "code";
				index += 1;
				continue;
			}
			if (char === "$" && next === "{") {
				templateExpressions.push(0);
				mode = "code";
				index += 2;
				continue;
			}
			index += 1;
			continue;
		}

		if (mode === "regex") {
			if (char === "\\") {
				index += 2;
				continue;
			}
			if (char === "\n") {
				// An unterminated literal: recover rather than blank the rest of the file.
				mode = "code";
				continue;
			}
			if (char === "[") {
				regexInClass = true;
				index += 1;
				continue;
			}
			if (char === "]") {
				regexInClass = false;
				index += 1;
				continue;
			}
			if (char === "/" && !regexInClass) {
				lastChar = "/";
				lastWord = "";
				mode = "code";
				index += 1;
				continue;
			}
			index += 1;
			continue;
		}

		if (char === "/" && next === "/") {
			commentStart = index;
			mode = "line-comment";
			index += 2;
			continue;
		}
		if (char === "/" && next === "*") {
			commentStart = index;
			mode = "block-comment";
			index += 2;
			continue;
		}
		if (char === "'" || char === '"' || char === "`") {
			literalStart = index + 1;
			mode =
				char === "'"
					? "single-quote"
					: char === '"'
						? "double-quote"
						: "template";
			index += 1;
			continue;
		}
		if (char === "/" && regexAllowed(lastChar, word === "" ? lastWord : word)) {
			regexInClass = false;
			index += 1;
			mode = "regex";
			continue;
		}

		// A `${ … }` closes on the first `}` at its own nesting level; that `}` is
		// template syntax and stays blanked so the `${` / `}` pair cancels out.
		if (char === "{") {
			const top = templateExpressions.at(-1);
			if (top !== undefined)
				templateExpressions[templateExpressions.length - 1] = top + 1;
		} else if (char === "}") {
			const top = templateExpressions.at(-1);
			if (top === 0) {
				templateExpressions.pop();
				index += 1;
				mode = "template";
				continue;
			}
			if (top !== undefined)
				templateExpressions[templateExpressions.length - 1] = top - 1;
		}

		out[index] = char;
		if (/[\w$]/.test(char)) {
			word += char;
		} else if (word !== "") {
			lastWord = word;
			word = "";
		}
		// Every non-blank code character, including a word character: `a / b` divides
		// because the token before the `/` is an identifier, not the `=` before it.
		if (!/\s/.test(char)) lastChar = char;
		index += 1;
	}

	const code = out.join("");
	const braceDepth = new Int32Array(length);
	const parenDepth = new Int32Array(length);
	const bracketDepth = new Int32Array(length);
	let braces = 0;
	let parens = 0;
	let brackets = 0;
	for (let at = 0; at < length; at += 1) {
		braceDepth[at] = braces;
		parenDepth[at] = parens;
		bracketDepth[at] = brackets;
		switch (code[at]) {
			case "{":
				braces += 1;
				break;
			case "}":
				braces -= 1;
				break;
			case "(":
				parens += 1;
				break;
			case ")":
				parens -= 1;
				break;
			case "[":
				brackets += 1;
				break;
			case "]":
				brackets -= 1;
				break;
			default:
				break;
		}
	}

	return { code, strings, comments, braceDepth, parenDepth, bracketDepth };
}

function isHygieneRule(value: string): value is HygieneRule {
	return (ALL_RULES as readonly string[]).includes(value);
}

/**
 * Read `// hygiene-allow: <rule>[,<rule>…] <reason>` directives. The reason is
 * mandatory: an escape hatch without one is ignored so the rule still fires.
 * A directive covers its own line and the line below it.
 */
function collectAllows(
	comments: readonly Comment[],
	lineOf: (index: number) => number,
): Map<number, Set<HygieneRule>> {
	const allows = new Map<number, Set<HygieneRule>>();

	for (const comment of comments) {
		const firstLine = lineOf(comment.start);
		comment.text.split("\n").forEach((piece, offset) => {
			const marker = /hygiene-allow:(.*)$/.exec(piece);
			const body = marker?.[1]?.trim() ?? "";
			if (body === "") return;

			// Rules are comma-separated so a space always starts the reason.
			const separator = body.search(/\s/);
			if (separator === -1) return;
			const reason = body.slice(separator).trim();
			if (reason === "") return;

			const rules = body
				.slice(0, separator)
				.split(",")
				.map((rule) => rule.trim())
				.filter(isHygieneRule);
			if (rules.length === 0) return;

			const line = firstLine + offset;
			const allowed = allows.get(line) ?? new Set<HygieneRule>();
			for (const rule of rules) allowed.add(rule);
			allows.set(line, allowed);
		});
	}

	return allows;
}

/** File-level gate for the import rule: the paths pi may load twice. */
function isPiFreePath(file: string): boolean {
	const segments = file.split(/[\\/]/);
	// Directory segments only; the trailing segment is the file name.
	return segments
		.slice(0, -1)
		.some((segment) => PI_FREE_PATH_SEGMENTS.has(segment));
}

/** Report `import`/`export` statements that reach pi at runtime, not only for types. */
function scanPiRuntimeImports(
	lexed: Lexed,
	push: (index: number, rule: HygieneRule) => void,
): void {
	const { code, strings, braceDepth } = lexed;

	const keywords = [...code.matchAll(/\b(?:import|export)\b/g)]
		.map((match) => match.index ?? 0)
		.filter((at) => (braceDepth[at] ?? 0) === 0);

	for (let order = 0; order < keywords.length; order += 1) {
		const start = keywords[order] ?? 0;
		const nextKeyword = keywords[order + 1] ?? code.length;
		const semicolon = code.indexOf(";", start);
		const end = Math.min(
			nextKeyword,
			semicolon === -1 ? code.length : semicolon,
		);
		const statement = code.slice(start, end);

		// `import type …` and `export type …` never reach pi at runtime.
		if (/^(?:import|export)\s+type\s/.test(statement)) continue;

		const from = [...statement.matchAll(/\bfrom\b/g)].at(-1);
		let literal: StringLiteral | undefined;
		if (from !== undefined) {
			const fromEnd = start + (from.index ?? 0) + from[0].length;
			literal = strings.find(
				(entry) => entry.start >= fromEnd && entry.start < end,
			);
		} else {
			// Bare `import "x"` and dynamic `import("x")` only: require nothing but
			// whitespace between the keyword and the literal, so `import.meta` and
			// string-heavy statements are left alone.
			const keywordEnd = start + 6;
			literal = strings.find(
				(entry) => entry.start >= keywordEnd && entry.start < end,
			);
			if (
				literal !== undefined &&
				code.slice(keywordEnd, literal.start).trim() !== ""
			) {
				literal = undefined;
			}
		}
		if (literal === undefined) continue;
		if (!literal.value.startsWith(PI_SCOPE_PREFIX)) continue;

		push(start, "pi-runtime-import");
	}

	// Dynamic imports at any depth: the statement walk above only enters at module
	// scope, and a `import(…)` call inside a function is still a runtime import.
	for (const match of code.matchAll(/\bimport\s*\(/g)) {
		const at = match.index ?? 0;
		const open = at + match[0].length - 1;
		const literal = strings.find((entry) => entry.start > open);
		if (literal === undefined) continue;
		// Only an immediately-following literal counts as this call's specifier.
		if (code.slice(open + 1, literal.start).trim() !== "") continue;
		if (!literal.value.startsWith(PI_SCOPE_PREFIX)) continue;

		push(at, "pi-runtime-import");
	}
}

/** Scan one file's text. `file` is only used for the finding's `file` field. */
export function scanSource(
	file: string,
	text: string,
	options?: ScanOptions,
): Finding[] {
	const enabled = new Set<HygieneRule>(options?.rules ?? ALL_RULES);
	const lexed = lex(text);
	const { code, braceDepth, parenDepth, bracketDepth } = lexed;

	const lineStarts = [0];
	for (let index = 0; index < text.length; index += 1) {
		if (text[index] === "\n") lineStarts.push(index + 1);
	}
	const lineOf = (index: number): number => {
		let low = 0;
		let high = lineStarts.length - 1;
		while (low < high) {
			const middle = (low + high + 1) >> 1;
			if ((lineStarts[middle] ?? 0) <= index) low = middle;
			else high = middle - 1;
		}
		return low + 1;
	};
	const lineText = (line: number): string =>
		text
			.slice(lineStarts[line - 1] ?? 0, lineStarts[line] ?? text.length)
			.trim();

	const allows = collectAllows(lexed.comments, lineOf);
	const isAllowed = (rule: HygieneRule, line: number): boolean =>
		allows.get(line)?.has(rule) === true ||
		allows.get(line - 1)?.has(rule) === true;

	const findings: Finding[] = [];
	/** One finding per line per rule: the reported text is the whole line. */
	const reported = new Set<string>();
	const push = (index: number, rule: HygieneRule): void => {
		if (!enabled.has(rule)) return;
		const line = lineOf(index);
		if (isAllowed(rule, line)) return;
		const key = `${line}:${rule}`;
		if (reported.has(key)) return;
		reported.add(key);
		findings.push({ file, line, rule, text: lineText(line) });
	};

	if (enabled.has("module-state")) {
		// Module scope means outside every brace, paren and bracket: the paren check
		// is what keeps `for (let i = …)` from looking like module-level state.
		const isModuleScope = (index: number): boolean =>
			(braceDepth[index] ?? 0) === 0 &&
			(parenDepth[index] ?? 0) === 0 &&
			(bracketDepth[index] ?? 0) === 0;

		for (const match of code.matchAll(/\b(?:let|var)\s+[A-Za-z_$]/g)) {
			const at = match.index ?? 0;
			if (!isModuleScope(at)) continue;
			push(at, "module-state");
		}

		// Only the literal constructor form. `const x: Map<K, V> = makeCache()` is a
		// factory call the caller may close over, not module-level mutable state.
		// Type arguments (`new Map<string, number>(…)`) are part of the same form.
		const COLLECTION_CONST =
			/\bconst\s+[A-Za-z_$][\w$]*\s*(?::[^=;\n]*)?=\s*new\s+(?:Map|Set|WeakMap|WeakSet)\s*(?:<.*?>)?\s*\(/g;
		for (const match of code.matchAll(COLLECTION_CONST)) {
			const at = match.index ?? 0;
			if (!isModuleScope(at)) continue;
			push(at, "module-state");
		}

		// `const cache = {}` / `= []` is the commonest form of module state, and it is a
		// literal, so the collection pattern above does not see it. Flag it only when the
		// same file later assigns into it or calls a mutating method on it: a constant
		// table nobody touches is not state, and `Object.freeze({…})` never matches here.
		const LITERAL_CONST =
			/\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=;\n]*)?=\s*(?:\{|\[)/g;
		for (const match of code.matchAll(LITERAL_CONST)) {
			const at = match.index ?? 0;
			if (!isModuleScope(at)) continue;
			const name = (match[1] ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const mutated = new RegExp(
				`\\b${name}\\s*(?:\\.[A-Za-z_$][\\w$]*\\s*=(?!=)|\\[[^\\]]*\\]\\s*=(?!=)|\\.(?:push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin|set|add|delete)\\s*\\()`,
			);
			if (mutated.test(code)) push(at, "module-state");
		}
	}

	if (enabled.has("instanceof")) {
		// Match the operator itself, then judge whatever follows, so a form that is not a
		// bare identifier cannot slip past by failing to match. `instanceof (Foo)` is the
		// same check as `instanceof Foo`; `instanceof ns.Foo` and `instanceof list[i]` are
		// both rejected, and the latter is the case a bare-identifier pattern would miss.
		for (const match of code.matchAll(/\binstanceof\b/g)) {
			const at = match.index ?? 0;
			const rhs = code.slice(at + match[0].length).replace(/^\s*\(?\s*/, "");
			const name = /^[A-Za-z_$][\w$]*/.exec(rhs)?.[0] ?? "";
			if (ALLOWED_INSTANCEOF.has(name)) continue;
			push(at, "instanceof");
		}
	}

	if (enabled.has("console")) {
		for (const match of code.matchAll(/\bconsole\s*(?:\.|\?\.)/g)) {
			push(match.index ?? 0, "console");
		}
	}

	if (enabled.has("pi-runtime-import") && isPiFreePath(file)) {
		scanPiRuntimeImports(lexed, push);
	}

	const order = (rule: HygieneRule): number => ALL_RULES.indexOf(rule);
	return findings.sort(
		(left, right) =>
			left.line - right.line || order(left.rule) - order(right.rule),
	);
}

/** Every `.ts` file under `directory`, in a deterministic order. */
function listTypeScriptFiles(directory: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.name === "node_modules") continue;
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...listTypeScriptFiles(path));
		else if (entry.name.endsWith(".ts")) files.push(path);
	}
	return files.sort();
}

/** Walk `root` for TypeScript files and scan each. Sorted by file, then line. */
export function scanTree(root: string, options?: ScanOptions): Finding[] {
	const findings = listTypeScriptFiles(root).flatMap((file) =>
		scanSource(file, readFileSync(file, "utf8"), options),
	);
	return findings.sort(
		(left, right) =>
			(left.file < right.file ? -1 : left.file > right.file ? 1 : 0) ||
			left.line - right.line,
	);
}
