import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { test } from "node:test";
import {
	createProcessTracker,
	DEFAULT_KILL_GRACE_MS,
	escalateKill,
	type KillableProcess,
} from "../src/process/index.js";

const POSIX = { skip: process.platform === "win32" };

/** Every grace below is this long, and every "nothing more happens" wait is ten times it. */
const GRACE_MS = 50;
const WAIT_MS = GRACE_MS * 10;

/** A process that ignores SIGTERM, says so once the handler is installed, and idles. */
const STUBBORN = `process.on("SIGTERM", () => {});
process.stdout.write("ready\\n");
setInterval(() => {}, 1000);`;

interface Fake extends KillableProcess {
	exitCode: number | null;
	signalCode: NodeJS.Signals | null;
	killed: boolean;
	readonly signals: string[];
}

function fake(
	options: {
		settled?: boolean;
		throwOn?: string;
		settleOnTerm?: boolean;
		killedFlag?: boolean;
	} = {},
): Fake {
	const proc: Fake = {
		exitCode: options.settled ? 0 : null,
		signalCode: null,
		killed: options.killedFlag === true,
		signals: [],
		kill(signal) {
			proc.signals.push(String(signal));
			if (signal === options.throwOn) throw new Error("ESRCH");
			if (signal === "SIGTERM" && options.settleOnTerm) {
				setTimeout(() => {
					proc.exitCode = 0;
				}, 10);
			}
			return true;
		},
	};
	return proc;
}

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until `done()` holds or `ms` passes; resolves whether it held. */
async function until(done: () => boolean, ms: number): Promise<boolean> {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (done()) return true;
		await sleep(5);
	}
	return done();
}

async function startStubborn(): Promise<ChildProcess> {
	const child = spawn(process.execPath, ["-e", STUBBORN], {
		stdio: ["ignore", "pipe", "ignore"],
	});
	await new Promise<void>((resolve, reject) => {
		child.once("error", reject);
		child.stdout?.once("data", () => resolve());
	});
	return child;
}

function closed(
	child: ChildProcess,
	ms = 5000,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`child still running after ${ms}ms`)),
			ms,
		);
		child.once("close", (code, signal) => {
			clearTimeout(timer);
			resolve({ code, signal });
		});
	});
}

test("the default grace is five seconds", () => {
	assert.equal(DEFAULT_KILL_GRACE_MS, 5000);
});

test("escalateKill sends nothing to a process that has settled", async () => {
	const proc = fake({ settled: true });
	escalateKill(proc, GRACE_MS);
	await sleep(WAIT_MS);
	assert.deepEqual(proc.signals, []);
});

test("escalateKill does not SIGKILL when SIGTERM cannot be sent", async () => {
	const proc = fake({ throwOn: "SIGTERM" });
	escalateKill(proc, GRACE_MS);
	await sleep(WAIT_MS);
	assert.deepEqual(proc.signals, ["SIGTERM"]);
});

test("escalateKill sends SIGTERM, then SIGKILL after the grace", async () => {
	const proc = fake();
	escalateKill(proc, GRACE_MS);
	assert.deepEqual(proc.signals, ["SIGTERM"]);
	assert.equal(await until(() => proc.signals.length === 2, WAIT_MS), true);
	assert.deepEqual(proc.signals, ["SIGTERM", "SIGKILL"]);
});

test("escalateKill skips SIGKILL for a process that settles during the grace", async () => {
	const proc = fake({ settleOnTerm: true });
	// The fake settles 10 ms after SIGTERM, well inside the grace.
	escalateKill(proc, GRACE_MS);
	await sleep(WAIT_MS);
	assert.deepEqual(proc.signals, ["SIGTERM"]);
});

test("escalateKill swallows a SIGKILL that throws", async () => {
	const proc = fake({ throwOn: "SIGKILL" });
	escalateKill(proc, GRACE_MS);
	assert.equal(await until(() => proc.signals.length === 2, WAIT_MS), true);
	assert.deepEqual(proc.signals, ["SIGTERM", "SIGKILL"]);
});

test(
	"escalateKill brings down a real child that ignores SIGTERM",
	POSIX,
	async () => {
		const child = await startStubborn();
		try {
			escalateKill(child, GRACE_MS);
			const result = await closed(child);
			assert.equal(result.signal, "SIGKILL");
		} finally {
			child.kill("SIGKILL");
		}
	},
);

test("a tracker behaves like a Set of processes", () => {
	const tracker = createProcessTracker<Fake>();
	const a = fake();
	const b = fake();
	assert.equal(tracker.size, 0);
	tracker.add(a);
	tracker.add(a);
	tracker.add(b);
	assert.equal(tracker.size, 2);
	assert.equal(tracker.has(a), true);
	assert.equal(tracker.delete(a), true);
	assert.equal(tracker.delete(a), false);
	assert.equal(tracker.has(a), false);
	assert.equal(tracker.size, 1);
});

test("two trackers are independent", () => {
	const first = createProcessTracker<Fake>();
	const second = createProcessTracker<Fake>();
	const proc = fake();
	first.add(proc);
	assert.equal(second.size, 0);
	second.cleanup(GRACE_MS);
	assert.deepEqual(proc.signals, []);
	assert.equal(first.size, 1);
});

test("a tracker is frozen", () => {
	assert.equal(Object.isFrozen(createProcessTracker()), true);
});

test("cleanup empties the tracker at once and signals only live processes", async () => {
	const tracker = createProcessTracker<Fake>();
	const live = fake();
	const done = fake({ settled: true });
	tracker.add(live);
	tracker.add(done);
	tracker.cleanup(GRACE_MS);
	assert.equal(tracker.size, 0);
	assert.deepEqual(live.signals, ["SIGTERM"]);
	assert.deepEqual(done.signals, []);
	assert.equal(await until(() => live.signals.length === 2, WAIT_MS), true);
	assert.deepEqual(live.signals, ["SIGTERM", "SIGKILL"]);
	assert.deepEqual(done.signals, []);
});

test("cleanup judges a process by its exit state, not its killed flag", async () => {
	const tracker = createProcessTracker<Fake>();
	// `killed` turns true as soon as a signal is sent, not when the process is gone.
	const proc = fake({ killedFlag: true });
	tracker.add(proc);
	tracker.cleanup(GRACE_MS);
	assert.equal(await until(() => proc.signals.length === 2, WAIT_MS), true);
	assert.deepEqual(proc.signals, ["SIGTERM", "SIGKILL"]);
});

test("cleanup is safe to call twice", async () => {
	const tracker = createProcessTracker<Fake>();
	const proc = fake();
	tracker.add(proc);
	tracker.cleanup(GRACE_MS);
	tracker.cleanup(GRACE_MS);
	await sleep(WAIT_MS);
	assert.equal(tracker.size, 0);
	// The second pass has nothing left to signal, so the process sees one SIGTERM and the
	// snapshot SIGKILL from the first pass.
	assert.deepEqual(proc.signals, ["SIGTERM", "SIGKILL"]);
});

test("cleanup tolerates a kill that throws", async () => {
	const tracker = createProcessTracker<Fake>();
	const proc = fake({ throwOn: "SIGTERM" });
	tracker.add(proc);
	assert.doesNotThrow(() => tracker.cleanup(GRACE_MS));
	assert.equal(await until(() => proc.signals.length === 2, WAIT_MS), true);
	assert.deepEqual(proc.signals, ["SIGTERM", "SIGKILL"]);
});

test("cleanup SIGKILLs the snapshot after clearing", POSIX, async () => {
	const tracker = createProcessTracker();
	const child = await startStubborn();
	try {
		tracker.add(child);
		tracker.cleanup(GRACE_MS);
		// Cleared before the grace ends, yet the delayed pass still reaches the child.
		assert.equal(tracker.size, 0);
		const result = await closed(child);
		assert.equal(result.signal, "SIGKILL");
	} finally {
		child.kill("SIGKILL");
	}
});
