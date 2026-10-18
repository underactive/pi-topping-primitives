// Package-shape guard: section 3 (packaging recipe) and the "library, not an
// extension" rule from section 1 of HANDOFF_PRIMITIVES.md, asserted against both
// manifests. Each assertion names the file and the field so a future edit that
// breaks the recipe reads as a fix list rather than a diff.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

interface PackageCase {
	/** Package directory relative to the repo root; also the `repository.directory` value. */
	readonly directory: string;
	/** Every subpath this package may export, in the order it must appear. */
	readonly planned: readonly string[];
}

interface Manifest {
	name?: string;
	version?: string;
	type?: string;
	license?: string;
	engines?: { node?: string };
	publishConfig?: { access?: string };
	repository?: { directory?: string };
	keywords?: readonly string[];
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	files?: readonly string[];
	exports?: Record<string, Record<string, string>>;
	scripts?: Record<string, string>;
}

const PRIMITIVES: PackageCase = {
	directory: "packages/primitives",
	planned: [
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
	],
};

const TEST_UTILS: PackageCase = {
	directory: "packages/test-utils",
	planned: [
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
	],
};

const PACKAGES = [PRIMITIVES, TEST_UTILS];

/** Peers as `"*"`: the recipe's floor is the consumer's pi, not a pinned copy. */
const PI_PEERS = [
	"@earendil-works/pi-ai",
	"@earendil-works/pi-coding-agent",
	"@earendil-works/pi-tui",
];

/** The one pi version the packages are tested against, pinned exactly in devDependencies. */
const PI_PIN = "1.3.0";

/** Exactly what ships: source for pi's loader, dist for tests, and the docs. */
const FILES = [
	"src/**/*.ts",
	"!src/**/*.test.ts",
	"dist/**",
	"README.md",
	"LICENSE",
	"CHANGELOG.md",
	"THIRD_PARTY_NOTICES.md",
];

const SCRIPTS = [
	"build",
	"build:watch",
	"typecheck",
	"typecheck:exports",
	"test:src",
	"test:exports",
	"test",
	"prepack",
	"prepublishOnly",
];

function packageRoot(pkg: PackageCase): string {
	return join(REPO_ROOT, pkg.directory);
}

function readManifest(pkg: PackageCase): Manifest {
	return JSON.parse(
		readFileSync(join(packageRoot(pkg), "package.json"), "utf8"),
	) as Manifest;
}

/**
 * The first line that is neither blank nor an ATX heading. The title line above
 * it is allowed, because an H1 is a heading and does not count as content.
 */
function firstContentLine(markdown: string): string | undefined {
	for (const line of markdown.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "") continue;
		if (/^#{1,6}(\s|$)/.test(trimmed)) continue;
		return trimmed;
	}
	return undefined;
}

/**
 * Actual export keys must appear in the planned order. A subpath may be dropped
 * in a later phase, so this is a subsequence check and not an equality check.
 */
function assertPlannedOrder(
	actual: readonly string[],
	planned: readonly string[],
	where: string,
): void {
	let cursor = 0;
	for (const key of actual) {
		const position = planned.indexOf(key, cursor);
		assert.notEqual(
			position,
			-1,
			`${where}: exports["${key}"] is out of order; it must come after ${planned[cursor - 1] ?? "the start of the planned list"}`,
		);
		cursor = position + 1;
	}
}

for (const pkg of PACKAGES) {
	const where = `${pkg.directory}/package.json`;

	test(`${where}: identity and metadata`, () => {
		const manifest = readManifest(pkg);

		assert.equal(manifest.type, "module", `${where}: "type" must be "module"`);
		assert.equal(manifest.license, "MIT", `${where}: "license" must be "MIT"`);
		assert.equal(
			manifest.engines?.node,
			">=22.19.0",
			`${where}: "engines.node" must be ">=22.19.0"`,
		);
		assert.equal(
			manifest.publishConfig?.access,
			"public",
			`${where}: "publishConfig.access" must be "public"`,
		);
		assert.equal(
			manifest.repository?.directory,
			pkg.directory,
			`${where}: "repository.directory" must be "${pkg.directory}"`,
		);

		// A `pi` field would make pi load the package as an extension.
		assert.equal(
			Object.hasOwn(manifest, "pi"),
			false,
			`${where}: a "pi" field would make pi load this library as an extension`,
		);
		const keywords = manifest.keywords ?? [];
		for (const banned of ["pi-package", "pi-extension"]) {
			assert.equal(
				keywords.includes(banned),
				false,
				`${where}: the keyword "${banned}" would make pi load this library as an extension`,
			);
		}

		// Zero runtime dependencies. The pi packages are peers, not dependencies.
		if (Object.hasOwn(manifest, "dependencies")) {
			assert.deepEqual(
				manifest.dependencies,
				{},
				`${where}: "dependencies" must be absent or empty`,
			);
		}
	});

	test(`${where}: peerDependencies`, () => {
		const manifest = readManifest(pkg);
		const peers = manifest.peerDependencies ?? {};

		assert.deepEqual(
			Object.keys(peers).sort(),
			[...PI_PEERS].sort(),
			`${where}: "peerDependencies" must name exactly ${PI_PEERS.join(", ")}`,
		);
		for (const name of PI_PEERS) {
			assert.equal(
				peers[name],
				"*",
				`${where}: "peerDependencies.${name}" must be "*"`,
			);
		}
	});

	test(`${where}: exports map`, () => {
		const manifest = readManifest(pkg);
		const exported = manifest.exports ?? {};

		// No root export: subpaths keep a contracts-only consumer from transpiling
		// menu or picker code.
		assert.equal(
			Object.hasOwn(exported, "."),
			false,
			`${where}: there must be no "." export; the package exports subpaths only`,
		);

		const actual = Object.keys(exported);
		for (const key of actual) {
			assert.ok(
				pkg.planned.includes(key),
				`${where}: exports["${key}"] is not one of the planned subpaths`,
			);
		}
		assertPlannedOrder(actual, pkg.planned, where);

		for (const key of actual) {
			const entry = exported[key] ?? {};
			const name = key.replace(/^\.\//, "");

			assert.deepEqual(
				Object.keys(entry),
				["types", "compiled", "default"],
				`${where}: exports["${key}"] must list exactly types, compiled and default, in that order`,
			);
			assert.equal(
				entry.types,
				`./dist/${name}/index.d.ts`,
				`${where}: exports["${key}"].types`,
			);
			assert.equal(
				entry.compiled,
				`./dist/${name}/index.js`,
				`${where}: exports["${key}"].compiled`,
			);
			assert.equal(
				entry.default,
				`./src/${name}/index.ts`,
				`${where}: exports["${key}"].default must be the TypeScript source, never compiled JavaScript`,
			);

			const source = join(packageRoot(pkg), entry.default ?? "");
			assert.equal(
				existsSync(source),
				true,
				`${where}: exports["${key}"].default points at a missing file: ${source}`,
			);
		}
	});

	test(`${where}: files and scripts`, () => {
		const manifest = readManifest(pkg);

		assert.deepEqual(
			manifest.files,
			FILES,
			`${where}: "files" must be exactly ${JSON.stringify(FILES)}`,
		);

		const scripts = manifest.scripts ?? {};
		for (const name of SCRIPTS) {
			assert.equal(
				typeof scripts[name],
				"string",
				`${where}: the "${name}" script is missing`,
			);
		}
		assert.match(
			scripts["test:exports"] ?? "",
			/-C compiled/,
			`${where}: "test:exports" must select the compiled condition with "-C compiled"`,
		);
		assert.equal(
			(scripts["test:exports"] ?? "").includes("--import"),
			false,
			`${where}: "test:exports" must not load the resolve hook; a plain consumer has none`,
		);
		assert.match(
			scripts["test:src"] ?? "",
			/--import/,
			`${where}: "test:src" must load the resolve hook with "--import"`,
		);
		assert.match(
			scripts["test:src"] ?? "",
			/\.\.\/\.\.\/tools\/ts-resolve\.ts/,
			`${where}: "test:src" must point at "../../tools/ts-resolve.ts"`,
		);
	});

	test(`${where}: shipped docs and the library claim`, () => {
		const root = packageRoot(pkg);

		for (const name of ["LICENSE", "CHANGELOG.md", "THIRD_PARTY_NOTICES.md"]) {
			assert.equal(
				existsSync(join(root, name)),
				true,
				`${where}: "${name}" is in "files" but missing from ${pkg.directory}/`,
			);
		}

		const readme = readFileSync(join(root, "README.md"), "utf8");
		assert.equal(
			firstContentLine(readme),
			"A library, not an extension.",
			`${where}: the README's first content line must read "A library, not an extension."`,
		);
	});
}

test("both packages are released in lockstep", () => {
	const primitives = readManifest(PRIMITIVES);
	const testUtils = readManifest(TEST_UTILS);

	assert.equal(
		primitives.version,
		testUtils.version,
		"packages/primitives/package.json and packages/test-utils/package.json must carry the same version",
	);
});

test("both packages pin the same pi devDependency versions", () => {
	const primitives = readManifest(PRIMITIVES).devDependencies ?? {};
	const testUtils = readManifest(TEST_UTILS).devDependencies ?? {};

	for (const name of PI_PEERS) {
		assert.equal(
			typeof primitives[name],
			"string",
			`packages/primitives/package.json: "devDependencies.${name}" is required so the peer is exercised`,
		);
		assert.equal(
			typeof testUtils[name],
			"string",
			`packages/test-utils/package.json: "devDependencies.${name}" is required so the peer is exercised`,
		);
		assert.equal(
			primitives[name],
			testUtils[name],
			`"devDependencies.${name}" must be the same exact version in both packages`,
		);
		assert.equal(
			primitives[name],
			PI_PIN,
			`"devDependencies.${name}" must be pinned to ${PI_PIN}, the version the packages are tested against`,
		);
	}
});
