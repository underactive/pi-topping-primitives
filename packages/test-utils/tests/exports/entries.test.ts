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
import * as ansiNs from "@underactive/pi-topping-test-utils/ansi";
import * as fakeCtxNs from "@underactive/pi-topping-test-utils/fake-ctx";
import * as fakePiNs from "@underactive/pi-topping-test-utils/fake-pi";
import * as fakeTuiNs from "@underactive/pi-topping-test-utils/fake-tui";
import * as fixturesMessagesNs from "@underactive/pi-topping-test-utils/fixtures/messages";
import * as fixturesModelsNs from "@underactive/pi-topping-test-utils/fixtures/models";
import * as gitNs from "@underactive/pi-topping-test-utils/git";
import * as keysNs from "@underactive/pi-topping-test-utils/keys";
import * as sandboxNs from "@underactive/pi-topping-test-utils/sandbox";
import * as shipManifestNs from "@underactive/pi-topping-test-utils/ship-manifest";
import * as themeNs from "@underactive/pi-topping-test-utils/theme";
import * as waitNs from "@underactive/pi-topping-test-utils/wait";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

/** Every subpath this file imports statically. Must equal `Object.keys(pkg.exports)`. */
const SUBPATHS = [
	"./theme",
	"./keys",
	"./ansi",
	"./fake-pi",
	"./fake-ctx",
	"./fake-tui",
	"./sandbox",
	"./fixtures/messages",
	"./fixtures/models",
	"./git",
	"./wait",
	"./ship-manifest",
] as const;

/** The statically imported namespaces, keyed by subpath. */
const NAMESPACES: Record<string, Record<string, unknown>> = {
	"./theme": themeNs as unknown as Record<string, unknown>,
	"./keys": keysNs as unknown as Record<string, unknown>,
	"./ansi": ansiNs as unknown as Record<string, unknown>,
	"./fake-pi": fakePiNs as unknown as Record<string, unknown>,
	"./fake-ctx": fakeCtxNs as unknown as Record<string, unknown>,
	"./fake-tui": fakeTuiNs as unknown as Record<string, unknown>,
	"./sandbox": sandboxNs as unknown as Record<string, unknown>,
	"./fixtures/messages": fixturesMessagesNs as unknown as Record<
		string,
		unknown
	>,
	"./fixtures/models": fixturesModelsNs as unknown as Record<string, unknown>,
	"./git": gitNs as unknown as Record<string, unknown>,
	"./wait": waitNs as unknown as Record<string, unknown>,
	"./ship-manifest": shipManifestNs as unknown as Record<string, unknown>,
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
