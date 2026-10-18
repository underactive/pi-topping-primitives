/**
 * Prove what each package publishes before anything is published.
 *
 * The file list comes from `npm pack --dry-run --json --workspaces`, which runs every package's
 * `prepack`, so a green run also proves the build works. The shape of that output was checked
 * empirically against the installed npm: a top-level JSON array with one object per workspace
 * package (`{ id, name, version, filename, files: [{ path, size, mode }], … }`). Arrival order
 * follows the root `workspaces` array. Only `name`, `version` and `files[].path` are read here.
 *
 * Run from anywhere: the repo root is resolved from this module's URL, never from the cwd.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Files a published package always carries, on top of whatever `files` promises. */
const REQUIRED_METADATA = [
	"package.json",
	"README.md",
	"LICENSE",
	"CHANGELOG.md",
	"THIRD_PARTY_NOTICES.md",
] as const;

/** Path segments that must never reach a tarball. */
const FORBIDDEN_SEGMENTS = new Set(["tests", "scripts", "node_modules"]);

/** Basenames that must never reach a tarball. Tested against the basename, hence the anchors. */
const FORBIDDEN_BASENAME = /(?:^tsconfig.*\.json$|\.test\.ts$|\.tsbuildinfo$)/;

interface PackedPackage {
	name: string;
	version: string;
	files: string[];
}

interface WorkspacePackage {
	/** Directory relative to the repo root, posix separators. */
	dir: string;
	name: string;
	version: string;
	/** Export keys in `package.json` order, e.g. `./contracts`. */
	exportSubpaths: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(text: string): unknown {
	return JSON.parse(text);
}

function readPackOutput(): PackedPackage[] {
	let stdout: string;
	try {
		stdout = execFileSync(
			"npm",
			["pack", "--dry-run", "--json", "--workspaces"],
			{ cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
		);
	} catch {
		throw new Error(
			"check-pack: `npm pack --dry-run --json --workspaces` failed; the prepack output above says why",
		);
	}
	const parsed = readJson(stdout);
	if (!Array.isArray(parsed)) {
		throw new Error(
			"check-pack: npm pack --dry-run --json did not return a top-level array",
		);
	}
	return parsed.map((entry) => {
		if (!isRecord(entry)) {
			throw new Error("check-pack: npm pack returned a non-object entry");
		}
		const { name, version, files } = entry;
		if (typeof name !== "string" || typeof version !== "string") {
			throw new Error("check-pack: npm pack entry has no string name/version");
		}
		if (!Array.isArray(files)) {
			throw new Error(
				`check-pack: npm pack entry for ${name} has no files array`,
			);
		}
		return {
			name,
			version,
			files: files.map((file) => {
				if (!isRecord(file) || typeof file.path !== "string") {
					throw new Error(
						`check-pack: npm pack entry for ${name} has a file without a string path`,
					);
				}
				return file.path;
			}),
		};
	});
}

async function readWorkspacePackages(): Promise<WorkspacePackage[]> {
	const rootManifest = readJson(
		await readFile(join(root, "package.json"), "utf8"),
	);
	if (!isRecord(rootManifest) || !Array.isArray(rootManifest.workspaces)) {
		throw new Error("check-pack: root package.json has no workspaces array");
	}
	const packages: WorkspacePackage[] = [];
	for (const entry of rootManifest.workspaces) {
		if (typeof entry !== "string") {
			throw new Error("check-pack: workspaces entries must be strings");
		}
		const manifest = readJson(
			await readFile(join(root, entry, "package.json"), "utf8"),
		);
		if (
			!isRecord(manifest) ||
			typeof manifest.name !== "string" ||
			typeof manifest.version !== "string"
		) {
			throw new Error(
				`check-pack: ${entry}/package.json has no string name/version`,
			);
		}
		packages.push({
			dir: entry,
			name: manifest.name,
			version: manifest.version,
			exportSubpaths: isRecord(manifest.exports)
				? Object.keys(manifest.exports)
				: [],
		});
	}
	return packages;
}

/** Every `.ts` file under `dir`, recursively. */
async function listSourceFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const found: string[] = [];
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...(await listSourceFiles(path)));
		else if (entry.isFile() && entry.name.endsWith(".ts")) found.push(path);
	}
	return found;
}

async function expectedFiles(pkg: WorkspacePackage): Promise<string[]> {
	const expected = new Set<string>(REQUIRED_METADATA);
	for (const subpath of pkg.exportSubpaths) {
		const sub = subpath.slice(2);
		expected.add(`dist/${sub}/index.js`);
		expected.add(`dist/${sub}/index.d.ts`);
		expected.add(`src/${sub}/index.ts`);
	}
	// Pack paths are package-relative; the on-disk walk below has to be trimmed to match.
	const sourceDir = join(root, pkg.dir, "src");
	if (existsSync(sourceDir)) {
		for (const file of await listSourceFiles(sourceDir)) {
			const rel = `src/${file.slice(sourceDir.length + 1)}`;
			if (!rel.endsWith(".test.ts")) expected.add(rel);
		}
	}
	return [...expected].sort();
}

function forbiddenReason(path: string): string | undefined {
	const segments = path.split("/");
	for (const segment of segments) {
		if (FORBIDDEN_SEGMENTS.has(segment)) return `\`${segment}/\` path segment`;
	}
	const basename = segments[segments.length - 1] ?? path;
	if (FORBIDDEN_BASENAME.test(basename)) return `forbidden filename`;
	return undefined;
}

/** Committed build output means the tarball could ship stale code. */
function committedDistFiles(): string[] {
	const tracked = execFileSync("git", ["ls-files"], {
		cwd: root,
		encoding: "utf8",
	});
	return tracked
		.split("\n")
		.filter((line) => line.length > 0)
		.filter((line) => line.split("/").includes("dist"));
}

async function main(): Promise<void> {
	const packed = readPackOutput();
	const workspacePackages = await readWorkspacePackages();
	const packedByName = new Map(packed.map((entry) => [entry.name, entry]));
	const problems: string[] = [];

	for (const pkg of workspacePackages) {
		const header = `${pkg.dir} (${pkg.name}@${pkg.version})`;
		const entry = packedByName.get(pkg.name);
		if (!entry) {
			problems.push(`${header}: no entry in the npm pack --workspaces output`);
			continue;
		}
		const actual = new Set(entry.files);
		const expected = await expectedFiles(pkg);
		const missing = expected.filter((path) => !actual.has(path));
		const forbidden = entry.files.flatMap((path) => {
			const reason = forbiddenReason(path);
			return reason === undefined ? [] : [`${path} (${reason})`];
		});
		if (missing.length === 0 && forbidden.length === 0) continue;

		const lines = [header];
		if (missing.length > 0) {
			lines.push(
				`  missing from the tarball (${missing.length}):`,
				...missing.map((path) => `    - ${path}`),
			);
		}
		if (forbidden.length > 0) {
			lines.push(
				`  must not ship (${forbidden.length}):`,
				...forbidden.map((path) => `    - ${path}`),
			);
		}
		problems.push(lines.join("\n"));
	}

	const dist = committedDistFiles();
	if (dist.length > 0) {
		problems.push(
			[
				"dist/ must be built by prepack, never committed:",
				...dist.map((path) => `    - ${path}`),
			].join("\n"),
		);
	}

	if (problems.length > 0) {
		console.error(problems.join("\n\n"));
		console.error("\ncheck-pack: FAILED");
		process.exitCode = 1;
		return;
	}

	const fileCount = packed.reduce(
		(total, entry) => total + entry.files.length,
		0,
	);
	console.log(
		`check-pack: ${workspacePackages.length} packages OK, ${fileCount} files packed, every expected file present, nothing forbidden, no dist/ committed.`,
	);
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
