// Compiled-condition test. Run with `node -C compiled --test`. Deliberately loads no resolve
// hook and no `--import`, because this is what a plain consumer does.
//
// The static imports below are load-bearing twice over:
//   - at runtime they prove the `compiled` condition and the emitted dist files agree;
//   - under `npm run typecheck:exports` they make tsc read every dist/*.d.ts through the
//     `types` condition, so a declaration that disagrees with its neighbour fails.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as activityNs from "@underactive/pi-topping-primitives/activity";
import * as activityTuiNs from "@underactive/pi-topping-primitives/activity-tui";
import * as colorNs from "@underactive/pi-topping-primitives/color";
import * as contractsNs from "@underactive/pi-topping-primitives/contracts";
import * as glyphsNs from "@underactive/pi-topping-primitives/glyphs";
import * as menuNs from "@underactive/pi-topping-primitives/menu";
import * as modelsNs from "@underactive/pi-topping-primitives/models";
import * as processNs from "@underactive/pi-topping-primitives/process";
import * as settingsNs from "@underactive/pi-topping-primitives/settings";
import * as textNs from "@underactive/pi-topping-primitives/text";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

/** Every subpath this file imports statically. Must equal `Object.keys(pkg.exports)`. */
const SUBPATHS = [
	"./contracts",
	"./settings",
	"./activity",
	"./activity-tui",
	"./menu",
	"./models",
	"./color",
	"./text",
	"./glyphs",
	"./process",
] as const;

/** The statically imported namespaces, keyed by subpath. */
const NAMESPACES: Record<string, Record<string, unknown>> = {
	"./contracts": contractsNs as unknown as Record<string, unknown>,
	"./settings": settingsNs as unknown as Record<string, unknown>,
	"./activity": activityNs as unknown as Record<string, unknown>,
	"./activity-tui": activityTuiNs as unknown as Record<string, unknown>,
	"./menu": menuNs as unknown as Record<string, unknown>,
	"./models": modelsNs as unknown as Record<string, unknown>,
	"./color": colorNs as unknown as Record<string, unknown>,
	"./text": textNs as unknown as Record<string, unknown>,
	"./glyphs": glyphsNs as unknown as Record<string, unknown>,
	"./process": processNs as unknown as Record<string, unknown>,
};

const manifest = JSON.parse(
	readFileSync(join(packageRoot, "package.json"), "utf8"),
) as {
	name: string;
	exports: Record<string, unknown>;
};

/** Throws unless `value` and everything reachable from it is frozen. Functions are skipped. */
function assertDeepFrozen(
	value: unknown,
	path: string,
	seen: WeakSet<object>,
): void {
	if (value === null || typeof value !== "object") return;
	if (seen.has(value)) return;
	seen.add(value);
	assert.ok(
		Object.isFrozen(value),
		`${path} is exported but not frozen: two copies of this package in one pi process must be harmless`,
	);
	for (const [key, child] of Object.entries(value)) {
		assertDeepFrozen(child, `${path}.${key}`, seen);
	}
}

test("the static import list matches the exports map exactly", () => {
	assert.deepEqual(
		[...SUBPATHS].sort(),
		Object.keys(manifest.exports).sort(),
		"update the static imports, SUBPATHS and NAMESPACES together with package.json exports",
	);
});

for (const subpath of SUBPATHS) {
	const namespace = NAMESPACES[subpath] ?? {};
	const distDir = join(packageRoot, "dist", ...subpath.slice(2).split("/"));

	test(`${subpath} resolves to dist and ships declarations`, () => {
		assert.equal(
			fileURLToPath(
				import.meta.resolve(`${manifest.name}/${subpath.slice(2)}`),
			),
			join(distDir, "index.js"),
			"run with -C compiled: a src/*.ts answer means the condition never reached the resolver",
		);
		assert.ok(
			existsSync(join(distDir, "index.d.ts")),
			`${subpath} must emit declarations`,
		);
	});

	test(`${subpath} exposes the same names in a second module instance`, async () => {
		const second = (await import(
			`${pathToFileURL(join(distDir, "index.js")).href}?copy=2`
		)) as Record<string, unknown>;
		assert.deepEqual(Object.keys(second).sort(), Object.keys(namespace).sort());
	});

	test(`${subpath} exports no shared mutable state`, () => {
		const seen = new WeakSet<object>();
		for (const [key, value] of Object.entries(namespace)) {
			assertDeepFrozen(value, `${subpath}.${key}`, seen);
		}
	});
}
