import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
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

test("a second module instance contends with the first on one lock path", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pt-exp-"));
	try {
		const file = join(dir, "a.json");
		const distIndex = pathToFileURL(
			fileURLToPath(
				import.meta.resolve("@underactive/pi-topping-primitives/settings"),
			),
		).href;
		const second = (await import(
			`${distIndex}?copy=2`
		)) as typeof import("@underactive/pi-topping-primitives/settings");
		mkdirSync(`${file}.lock`);
		writeFileSync(
			join(`${file}.lock`, "owner.json"),
			JSON.stringify({
				pid: process.pid,
				hostname: hostname(),
				at: Date.now(),
			}),
		);
		const result = second
			.createSettingsStore<Doc>(options(file, { attempts: 1 }))
			.update((c) => c);
		assert.equal(result.ok, false);
		if (!result.ok) assert.equal(result.reason, "busy");
	} finally {
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
