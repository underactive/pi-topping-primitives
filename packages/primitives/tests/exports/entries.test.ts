// Compiled-condition test. Run with `node -C compiled --test`. Deliberately loads no resolve
// hook and no `--import`, because this is what a plain consumer does.
//
// The static imports below are load-bearing twice over:
//   - at runtime they prove the `compiled` condition and the emitted dist files agree;
//   - under `npm run typecheck:exports` they make tsc read every dist/*.d.ts through the
//     `types` condition, so a declaration that disagrees with its neighbour fails.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as activityNs from "@underactive/pi-topping-primitives/activity";
import * as activityTuiNs from "@underactive/pi-topping-primitives/activity-tui";
import * as contractsNs from "@underactive/pi-topping-primitives/contracts";
import * as menuNs from "@underactive/pi-topping-primitives/menu";
import * as modelsNs from "@underactive/pi-topping-primitives/models";
import * as settingsNs from "@underactive/pi-topping-primitives/settings";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

/** Every subpath this file imports statically. Must equal `Object.keys(pkg.exports)`. */
const SUBPATHS = [
	"./contracts",
	"./settings",
	"./activity",
	"./activity-tui",
	"./menu",
	"./models",
] as const;

/** The statically imported namespaces, keyed by subpath. */
const NAMESPACES: Record<string, Record<string, unknown>> = {
	"./contracts": contractsNs as unknown as Record<string, unknown>,
	"./settings": settingsNs as unknown as Record<string, unknown>,
	"./activity": activityNs as unknown as Record<string, unknown>,
	"./activity-tui": activityTuiNs as unknown as Record<string, unknown>,
	"./menu": menuNs as unknown as Record<string, unknown>,
	"./models": modelsNs as unknown as Record<string, unknown>,
};

const manifest = JSON.parse(
	readFileSync(join(packageRoot, "package.json"), "utf8"),
) as {
	name: string;
	exports: Record<string, unknown>;
};

/**
 * Throws unless `value` and everything reachable from it is frozen.
 *
 * Functions are skipped on purpose: a frozen function is not the idiom, and requiring
 * it would reject every exported helper. Module-level state attached to a function is
 * the hygiene scanner's `module-state` rule to catch, not this one.
 * `Reflect.ownKeys` is used rather than `Object.entries` so a non-enumerable or
 * symbol-keyed property cannot hide mutable state.
 */
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
	for (const key of Reflect.ownKeys(value)) {
		assertDeepFrozen(
			(value as Record<PropertyKey, unknown>)[key],
			`${path}.${String(key)}`,
			seen,
		);
	}
}

test("the static import list matches the exports map exactly", () => {
	assert.deepEqual(
		[...SUBPATHS].sort(),
		Object.keys(manifest.exports).sort(),
		"update the static imports, SUBPATHS and NAMESPACES together with package.json exports",
	);
});

/** Newest mtime of any `.ts` file under `dir`. */
function newestSourceMtime(dir: string): number {
	let newest = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			newest = Math.max(newest, newestSourceMtime(path));
		} else if (entry.isFile() && entry.name.endsWith(".ts")) {
			newest = Math.max(newest, statSync(path).mtimeMs);
		}
	}
	return newest;
}

// This file reads `dist/`, and nothing in it builds. Without this guard a source change
// that was never compiled makes every other assertion here certify stale output, which is
// a silent pass rather than a failure. `npm test` builds first; a bare `npm run test:exports`
// does not, and this is what catches that.
test("dist is newer than every source file", () => {
	const sourceMtime = newestSourceMtime(join(packageRoot, "src"));
	for (const subpath of SUBPATHS) {
		const distFile = join(
			packageRoot,
			"dist",
			...subpath.slice(2).split("/"),
			"index.js",
		);
		assert.ok(
			statSync(distFile).mtimeMs >= sourceMtime,
			`${subpath}: dist is older than src, so this run would certify stale output; run \`npm run build\` first`,
		);
	}
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
		// The query string is what forces a second module record. Without this assertion a
		// runtime that collapsed both specifiers onto one instance would satisfy the key
		// comparison and prove nothing, which is the whole failure mode this test exists for.
		assert.notStrictEqual(
			second,
			namespace,
			"?copy=2 must yield a distinct module instance, not the cached one",
		);
		assert.deepEqual(Object.keys(second).sort(), Object.keys(namespace).sort());
	});

	test(`${subpath} exports no shared mutable state`, () => {
		const seen = new WeakSet<object>();
		for (const [key, value] of Object.entries(namespace)) {
			assertDeepFrozen(value, `${subpath}.${key}`, seen);
		}
	});
}
