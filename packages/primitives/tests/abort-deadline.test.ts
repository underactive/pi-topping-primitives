import assert from "node:assert/strict";
import { test } from "node:test";
import { createDeadline } from "../src/abort/index.js";

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/** The ref'd timers alive right now, so a test can tell whether a call started one. */
const timers = (): number =>
	process.getActiveResourcesInfo().filter((name) => name === "Timeout").length;

/** Resolves when `signal` aborts; rejects after five seconds so a bug fails instead of hanging. */
function whenAborted(signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			resolve();
			return;
		}
		const guard = setTimeout(
			() => reject(new Error("the signal never aborted")),
			5_000,
		);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(guard);
				resolve();
			},
			{ once: true },
		);
	});
}

// Adapted from sensei's test/sensei/deadline.test.ts. Those tests drive vitest's fake timers;
// this package mocks no clocks, so the timer is real, the count is read from the process, and
// the waits are generous.
test("a positive timeout starts one timer, aborts, and reports a timeout", async () => {
	const base = timers();
	const deadline = createDeadline(30, undefined);
	assert.equal(timers(), base + 1);
	assert.ok(deadline.signal);
	assert.equal(deadline.signal.aborted, false);
	assert.equal(deadline.timedOut(), false);

	await whenAborted(deadline.signal);
	assert.equal(deadline.timedOut(), true);
	deadline.dispose();
	deadline.dispose();
	assert.equal(timers(), base);
});

test("dispose clears the timer, and the signal never aborts afterwards", async () => {
	const base = timers();
	const deadline = createDeadline(40, undefined);
	assert.equal(timers(), base + 1);
	deadline.dispose();
	assert.equal(timers(), base);
	deadline.dispose();

	await sleep(400);
	assert.equal(deadline.signal?.aborted, false);
	assert.equal(deadline.timedOut(), false);
});

test("no timer and no signal at a timeout of zero, below zero or NaN", () => {
	for (const timeoutMs of [0, -5, Number.NaN]) {
		const base = timers();
		const deadline = createDeadline(timeoutMs, undefined);
		assert.equal(timers(), base, String(timeoutMs));
		assert.equal(deadline.signal, undefined, String(timeoutMs));
		assert.equal(deadline.timedOut(), false, String(timeoutMs));
		deadline.dispose();
	}
});

test("a timeout of zero hands the caller's signal through and a caller abort is not a timeout", () => {
	const caller = new AbortController();
	const base = timers();
	const deadline = createDeadline(0, caller.signal);

	assert.equal(timers(), base);
	assert.equal(deadline.signal, caller.signal);
	caller.abort();
	assert.equal(deadline.signal?.aborted, true);
	assert.equal(deadline.timedOut(), false);
	deadline.dispose();
	assert.equal(timers(), base);
});

test("a caller abort before the timer is not reported as a timeout", () => {
	const caller = new AbortController();
	const base = timers();
	const deadline = createDeadline(5_000, caller.signal);

	assert.notEqual(deadline.signal, caller.signal);
	assert.equal(deadline.signal?.aborted, false);
	caller.abort();
	assert.equal(deadline.signal?.aborted, true);
	assert.equal(deadline.timedOut(), false);
	deadline.dispose();
	assert.equal(timers(), base);
});

test("the timer firing first is a timeout and leaves the caller's signal alone", async () => {
	const caller = new AbortController();
	const deadline = createDeadline(30, caller.signal);
	assert.ok(deadline.signal);

	await whenAborted(deadline.signal);
	assert.equal(deadline.timedOut(), true);
	assert.equal(caller.signal.aborted, false);
	deadline.dispose();
});

test("an already aborted caller signal gives an aborted signal and no timeout", () => {
	const caller = new AbortController();
	caller.abort();
	const deadline = createDeadline(5_000, caller.signal);

	assert.equal(deadline.signal?.aborted, true);
	assert.equal(deadline.timedOut(), false);
	deadline.dispose();
});

// Unclamped, each of these runs setTimeout with a delay Node rewrites to 1 ms, so the signal
// would abort within a few milliseconds; the wait here is 75 times that.
test("a timeout past 2^31 - 1, Infinity included, is clamped instead of firing at once", async () => {
	const base = timers();
	const deadlines = [
		Number.POSITIVE_INFINITY,
		2 ** 31,
		2 ** 32,
		Number.MAX_SAFE_INTEGER,
	].map((timeoutMs) => createDeadline(timeoutMs, undefined));
	assert.equal(timers(), base + deadlines.length);

	await sleep(150);
	for (const deadline of deadlines) {
		assert.equal(deadline.signal?.aborted, false);
		assert.equal(deadline.timedOut(), false);
		deadline.dispose();
	}
	assert.equal(timers(), base);
});
