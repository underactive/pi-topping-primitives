// Source-condition test. No build required. The resolve hook in tools/ts-resolve.ts is
// active and no `compiled` condition is set, so the `default` condition must hand back the
// TypeScript source. This is the shape pi's jiti loader imports.
//
// Every subpath specifier here is a runtime string on purpose. A static import would make
// tsc resolve `types`, which points at an unbuilt `dist/`, and the pre-build typecheck leg
// in CI would fail with TS2307 before anything has been compiled.
import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const PACKAGE = "@underactive/pi-topping-primitives";

/** Every subpath the package exports, in `exports` order. */
const SUBPATHS = [
	"./contracts",
	"./settings",
	"./activity",
	"./activity-tui",
] as const;

// Node's resolver realpaths the workspace symlink out of node_modules, which is also why
// type stripping works here. Compare against the real directory, not the symlinked one.
const packageRoot = realpathSync(fileURLToPath(new URL("..", import.meta.url)));

for (const subpath of SUBPATHS) {
	test(`${subpath} resolves to its TypeScript source`, async () => {
		const specifier = `${PACKAGE}/${subpath.slice(2)}`;

		assert.equal(
			realpathSync(fileURLToPath(import.meta.resolve(specifier))),
			join(packageRoot, "src", ...subpath.slice(2).split("/"), "index.ts"),
		);

		const mod: unknown = await import(specifier);
		assert.equal(typeof mod, "object");
		assert.notEqual(mod, null);
	});
}
