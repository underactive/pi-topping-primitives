/**
 * `prepublishOnly` guard: refuse to publish a package whose subpaths export nothing.
 *
 * Phase 0 ships `export {};` stubs so the exports map, the declarations and the tests can be
 * wired before the code exists; a stub that survives into a publish is a broken package for every
 * consumer, and this is the last moment it can be caught. Run it from the package directory with
 * `dist/` already built (`npm run build`), because it imports each subpath's `compiled` target
 * exactly as a consumer under the `compiled` condition would.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface Subpath {
	/** Export key as written in `package.json`, e.g. `./contracts`. */
	key: string;
	/** `compiled` target as written in `package.json`, e.g. `dist/contracts/index.js`. */
	target: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readManifest(
	text: string,
	path: string,
): {
	name: string;
	version: string;
	subpaths: Subpath[];
} {
	const manifest = JSON.parse(text) as unknown;
	if (!isRecord(manifest)) {
		throw new Error(`check-release: ${path} is not a JSON object`);
	}
	const { name, version } = manifest;
	if (typeof name !== "string" || typeof version !== "string") {
		throw new Error(`check-release: ${path} has no string name/version`);
	}
	if (!isRecord(manifest.exports)) {
		throw new Error(`check-release: ${path} has no exports object`);
	}
	const subpaths = Object.entries(manifest.exports).map(([key, value]) => {
		const compiled = isRecord(value) ? value.compiled : undefined;
		if (typeof compiled !== "string") {
			throw new Error(
				`check-release: ${name} export ${key} has no string "compiled" target; every subpath needs one so the SDK path can be tested and published`,
			);
		}
		// Manifests spell these `./dist/…`; print and resolve them package-relative.
		return { key, target: compiled.replace(/^\.\//, "") };
	});
	return { name, version, subpaths };
}

async function main(): Promise<void> {
	const pkgDirArg = process.argv[2];
	if (pkgDirArg === undefined) {
		console.error("usage: node scripts/check-release.ts <pkgDir>");
		process.exitCode = 1;
		return;
	}
	const pkgDir = resolve(pkgDirArg);
	const { name, version, subpaths } = readManifest(
		await readFile(join(pkgDir, "package.json"), "utf8"),
		pkgDir,
	);

	const unbuilt = subpaths.filter(
		(subpath) => !existsSync(join(pkgDir, subpath.target)),
	);
	if (unbuilt.length > 0) {
		console.error(
			`${name}@${version} is not built: these targets do not exist:`,
		);
		for (const subpath of unbuilt) {
			console.error(`  ${subpath.key} -> ${subpath.target}`);
		}
		console.error(
			`Run \`npm run build\` in ${pkgDirArg} first, then retry the publish.`,
		);
		process.exitCode = 1;
		return;
	}

	const counts: Array<{ subpath: Subpath; count: number }> = [];
	const empty: Subpath[] = [];
	for (const subpath of subpaths) {
		const href = pathToFileURL(join(pkgDir, subpath.target)).href;
		let module: unknown;
		try {
			module = await import(href);
		} catch (error) {
			console.error(
				`${subpath.key} -> ${subpath.target} failed to load: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			process.exitCode = 1;
			return;
		}
		const count = isRecord(module) ? Object.keys(module).length : 0;
		counts.push({ subpath, count });
		if (count === 0) empty.push(subpath);
	}

	if (empty.length > 0) {
		console.error(
			`${name}@${version} cannot be published: these subpaths are empty:`,
		);
		for (const subpath of empty) {
			console.error(`  ${subpath.key} -> ${subpath.target}`);
		}
		console.error(
			"Fill each subpath or remove it from `exports` before publishing.",
		);
		process.exitCode = 1;
		return;
	}

	console.log(`${name}@${version}: every subpath exports something.`);
	for (const { subpath, count } of counts) {
		console.log(
			`  ${subpath.key} -> ${subpath.target}: ${count} export${count === 1 ? "" : "s"}`,
		);
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
