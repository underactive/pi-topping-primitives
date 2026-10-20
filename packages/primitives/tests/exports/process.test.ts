import assert from "node:assert/strict";
import { test } from "node:test";
import * as proc from "@underactive/pi-topping-primitives/process";

test("compiled ./process resolves the PATH fallback with its via", () => {
	assert.deepEqual(
		proc.resolvePiInvocation(["--version"], {
			argv1: "",
			execPath: "/usr/bin/node",
		}),
		{ command: "pi", args: ["--version"], via: "path" },
	);
});

test("compiled ./process compares versions", () => {
	const parsed = proc.parsePiVersion("pi 1.3.0");
	assert.ok(parsed);
	assert.equal(proc.versionAtLeast(parsed, [1, 0, 4]), true);
	assert.equal(proc.hostBelow("1.0.3", "1.0.4"), true);
	assert.equal(proc.hostBelow("pi 1.0.3", "1.0.4"), false);
});

test("compiled ./process maps with a concurrency limit", async () => {
	const results = await proc.mapWithConcurrencyLimit(
		[1, 2, 3],
		2,
		async (n) => n * 2,
	);
	assert.deepEqual(results, [2, 4, 6]);
});

test("compiled ./process makes independent, frozen trackers", () => {
	const first = proc.createProcessTracker();
	const second = proc.createProcessTracker();
	assert.notEqual(first, second);
	assert.equal(Object.isFrozen(first), true);
	assert.equal(first.size, 0);
	assert.equal(proc.DEFAULT_KILL_GRACE_MS, 5000);
});

test("compiled ./process spawns and collects", async () => {
	assert.equal(proc.SPAWN_TIMEOUT_EXIT_CODE, 124);
	const result = await proc.spawnCollect(
		process.execPath,
		["-e", "process.stdout.write('ok')"],
		{ timeoutMs: 10_000 },
	);
	assert.deepEqual(result, {
		code: 0,
		stdout: "ok",
		stderr: "",
		timedOut: false,
	});
});

test("compiled ./process loads agents through pi's frontmatter parser", () => {
	assert.deepEqual(
		proc.loadAgentsFromDir("/nonexistent/pt-agents", "user"),
		[],
	);
	assert.equal(typeof proc.findNearestProjectAgentsDir, "function");
	assert.equal(typeof proc.parseAgentFile, "function");
});
