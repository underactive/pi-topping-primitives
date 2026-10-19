import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as first from "@underactive/pi-topping-primitives/settings";
import {
	createSettingsStore,
	sanitize,
} from "@underactive/pi-topping-primitives/settings";

interface Doc {
	n: number;
}

function options(
	file: string,
	lock?: Parameters<typeof createSettingsStore>[0]["lock"],
) {
	return {
		path: () => file,
		codec: {
			sanitize: (raw: unknown): Doc => ({
				n: sanitize.numberOr(sanitize.isRecord(raw) ? raw.n : undefined, 0, {
					integer: true,
				}),
			}),
		},
		lock,
	};
}

test("compiled settings store round trips", () => {
	const dir = mkdtempSync(join(tmpdir(), "pt-exp-"));
	try {
		const store = createSettingsStore<Doc>(options(join(dir, "a.json")));
		assert.equal(store.update((c) => ({ n: c.n + 2 })).ok, true);
		assert.deepEqual(store.read(), { n: 2 });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("an independent copy of the module contends with the first through the lock directory", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pt-exp-"));
	// A full copy of dist/settings (not a ?copy query on the barrel, which would share the
	// sibling modules) gives a second module graph with its own bindings.
	const distDir = dirname(
		fileURLToPath(
			import.meta.resolve("@underactive/pi-topping-primitives/settings"),
		),
	);
	const copyDir = join(dirname(distDir), `settings-copy-${process.pid}`);
	try {
		cpSync(distDir, copyDir, { recursive: true });
		const second = (await import(
			pathToFileURL(join(copyDir, "index.js")).href
		)) as typeof first;
		assert.notStrictEqual(second.acquireDirLock, first.acquireDirLock);

		const file = join(dir, "a.json");
		assert.equal(first.acquireDirLock(`${file}.lock`), true);
		const blocked = second
			.createSettingsStore<Doc>(options(file, { attempts: 1 }))
			.update((c) => c);
		assert.equal(blocked.ok, false);
		if (!blocked.ok) assert.equal(blocked.reason, "busy");
		first.releaseDirLock(`${file}.lock`);

		const freed = second
			.createSettingsStore<Doc>(options(file))
			.update((c) => ({ n: c.n + 1 }));
		assert.equal(freed.ok, true);
		assert.deepEqual(first.createSettingsStore<Doc>(options(file)).read(), {
			n: 1,
		});
	} finally {
		rmSync(copyDir, { recursive: true, force: true });
		rmSync(dir, { recursive: true, force: true });
	}
});

function contender(file: string, count: number): Promise<number | null> {
	const script = fileURLToPath(
		new URL("./fixtures/settings-contender.ts", import.meta.url),
	);
	return new Promise((resolve) => {
		const child = spawn(
			process.execPath,
			["-C", "compiled", script, file, String(count)],
			{
				cwd: fileURLToPath(new URL("../..", import.meta.url)),
				stdio: "inherit",
			},
		);
		child.on("close", resolve);
	});
}

test("two processes updating one file lose no increments", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pt-exp-"));
	try {
		const file = join(dir, "a.json");
		const codes = await Promise.all([contender(file, 40), contender(file, 40)]);
		assert.deepEqual(codes, [0, 0]);
		assert.equal((JSON.parse(readFileSync(file, "utf8")) as Doc).n, 80);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
