import assert from "node:assert/strict";
import { test } from "node:test";
import { SPAWN_TIMEOUT_EXIT_CODE, spawnCollect } from "../src/process/index.js";

const POSIX = { skip: process.platform === "win32" };

const node = (script: string, timeoutMs = 10_000) =>
	spawnCollect(process.execPath, ["-e", script], { timeoutMs });

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function gone(pid: number, ms: number): Promise<boolean> {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (!alive(pid)) return true;
		await sleep(25);
	}
	return !alive(pid);
}

test("the timeout exit code is 124", () => {
	assert.equal(SPAWN_TIMEOUT_EXIT_CODE, 124);
});

test("stdout, stderr and the exit code pass through", async () => {
	const result = await node(
		'process.stdout.write("out"); process.stderr.write("err"); process.exit(3)',
	);
	assert.deepEqual(result, {
		code: 3,
		stdout: "out",
		stderr: "err",
		timedOut: false,
	});
});

test("a clean exit is code 0", async () => {
	const result = await node('process.stdout.write("ok")');
	assert.deepEqual(result, {
		code: 0,
		stdout: "ok",
		stderr: "",
		timedOut: false,
	});
});

test("a process that dies by signal reports code 1", POSIX, async () => {
	const result = await node('process.kill(process.pid, "SIGKILL")');
	assert.equal(result.code, 1);
	assert.equal(result.timedOut, false);
});

test("a missing command resolves code 1 with the error appended", async () => {
	const result = await spawnCollect("pt-no-such-command-xyz", ["a"], {
		timeoutMs: 5000,
	});
	assert.equal(result.code, 1);
	assert.equal(result.stdout, "");
	assert.match(result.stderr, /ENOENT/);
	assert.equal(result.timedOut, false);
});

test("a NUL in an argument resolves code 1 instead of throwing", async () => {
	const result = await spawnCollect(process.execPath, ["a\0b"], {
		timeoutMs: 5000,
	});
	assert.equal(result.code, 1);
	assert.equal(result.stdout, "");
	assert.notEqual(result.stderr, "");
	assert.equal(result.timedOut, false);
});

test("the args array is not mutated and no shell is used", async () => {
	const args = [
		"-e",
		'process.stdout.write(process.argv.slice(1).join("|"))',
		"a b",
		"$HOME",
		";echo x",
	];
	const copy = [...args];
	const result = await spawnCollect(process.execPath, args, {
		timeoutMs: 5000,
	});
	assert.deepEqual(args, copy);
	assert.equal(result.stdout, "a b|$HOME|;echo x");
});

test("cwd and env reach the child", async () => {
	const result = await spawnCollect(
		process.execPath,
		["-e", "process.stdout.write(process.cwd() + '|' + process.env.PT_PROBE)"],
		{
			timeoutMs: 5000,
			cwd: process.cwd(),
			env: { ...process.env, PT_PROBE: "yes" },
		},
	);
	assert.equal(result.stdout, `${process.cwd()}|yes`);
});

test(
	"a timeout resolves at once with 124, the suffix and the child brought down",
	POSIX,
	async () => {
		// `sh` ignores SIGTERM from its first instruction, so unlike a node child (whose handler is
		// installed ~40 ms in) there is no startup race to win before the 100 ms timeout signals it.
		// The pid line is the ready handshake: it is written after the trap is set.
		const script =
			'trap "" TERM; echo $$; printf partial >&2; while :; do sleep 0.05; done';
		const started = Date.now();
		const result = await spawnCollect("/bin/sh", ["-c", script], {
			timeoutMs: 100,
			killGraceMs: 50,
		});
		const elapsed = Date.now() - started;
		const pid = Number(result.stdout.trim());
		try {
			assert.equal(result.code, SPAWN_TIMEOUT_EXIT_CODE);
			assert.equal(result.timedOut, true);
			assert.equal(result.stderr, "partial\n[timed out after 100ms]");
			assert.ok(elapsed < 1000, `took ${elapsed}ms`);
			assert.ok(Number.isInteger(pid) && pid > 0, `no pid in ${result.stdout}`);
			// SIGKILL goes out 50 ms after SIGTERM; allow ten times that.
			assert.equal(
				await gone(pid, 500),
				true,
				"child outlived the SIGKILL grace",
			);
		} finally {
			if (Number.isInteger(pid) && pid > 0 && alive(pid))
				process.kill(pid, "SIGKILL");
		}
	},
);

test("a timeout with empty stderr has no leading newline", async () => {
	const result = await node("setInterval(() => {}, 1000)", 150);
	assert.equal(result.code, SPAWN_TIMEOUT_EXIT_CODE);
	assert.equal(result.stderr, "[timed out after 150ms]");
});

test(
	"the result stays the timeout even if the child exits right after SIGTERM",
	POSIX,
	async () => {
		// The trap exits cleanly once the current sleep ends, so the child closes with code 0 soon
		// after the timeout has already resolved the call; that close must not replace the result.
		const result = await spawnCollect(
			"/bin/sh",
			["-c", 'trap "exit 0" TERM; while :; do sleep 0.05; done'],
			{ timeoutMs: 100, killGraceMs: 50 },
		);
		await new Promise((resolve) => setTimeout(resolve, 200));
		assert.equal(result.code, SPAWN_TIMEOUT_EXIT_CODE);
		assert.equal(result.timedOut, true);
	},
);

test("an infinite or zero timeout starts no timer", async () => {
	for (const timeoutMs of [Number.POSITIVE_INFINITY, 0, -5, Number.NaN]) {
		const result = await node(
			'setTimeout(() => process.stdout.write("done"), 150)',
			timeoutMs,
		);
		assert.equal(result.code, 0, `timeoutMs ${timeoutMs}`);
		assert.equal(result.stdout, "done");
		assert.equal(result.timedOut, false);
	}
});

test("a multibyte character split across two writes decodes intact", async () => {
	const result = await node(
		'const b = Buffer.from("a€b"); process.stdout.write(b.subarray(0, 2)); setTimeout(() => process.stdout.write(b.subarray(2)), 100)',
	);
	assert.equal(result.stdout, "a€b");
});

test("stderr is decoded across chunks too", async () => {
	const result = await node(
		'const b = Buffer.from("€"); process.stderr.write(b.subarray(0, 1)); setTimeout(() => process.stderr.write(b.subarray(1)), 100)',
	);
	assert.equal(result.stderr, "€");
});
