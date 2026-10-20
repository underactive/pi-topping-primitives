import assert from "node:assert/strict";
import { test } from "node:test";
import { combineSignals } from "../src/abort/index.js";

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

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

test("combineSignals registers a controller and cleanup unregisters it", () => {
	const active = new Set<AbortController>();
	const { signal, cleanup } = combineSignals(undefined, 5_000, active);

	assert.equal(active.size, 1);
	assert.equal(signal.aborted, false);
	cleanup();
	assert.equal(active.size, 0);
	cleanup();
	assert.equal(active.size, 0);
});

test("aborting the registered controllers aborts the signal, as a host does on shutdown", () => {
	const active = new Set<AbortController>();
	const first = combineSignals(undefined, 5_000, active);
	const second = combineSignals(undefined, 5_000, active);
	assert.equal(active.size, 2);

	for (const controller of active) controller.abort();
	active.clear();
	assert.equal(first.signal.aborted, true);
	assert.equal(second.signal.aborted, true);
});

test("the caller's signal aborts the combined signal and leaves the registration for cleanup", () => {
	const active = new Set<AbortController>();
	const user = new AbortController();
	const { signal, cleanup } = combineSignals(user.signal, 5_000, active);

	assert.equal(signal.aborted, false);
	user.abort();
	assert.equal(signal.aborted, true);
	assert.equal(active.size, 1);
	cleanup();
	assert.equal(active.size, 0);
});

test("an already aborted caller signal gives an aborted signal", () => {
	const user = new AbortController();
	user.abort();
	const active = new Set<AbortController>();
	const { signal, cleanup } = combineSignals(user.signal, 5_000, active);
	assert.equal(signal.aborted, true);
	cleanup();
});

test("the timeout aborts the signal with a TimeoutError", async () => {
	const active = new Set<AbortController>();
	const { signal, cleanup } = combineSignals(undefined, 30, active);

	await whenAborted(signal);
	assert.equal((signal.reason as Error).name, "TimeoutError");
	cleanup();
});

test("nothing aborts the signal when no source fires", async () => {
	const active = new Set<AbortController>();
	const { signal, cleanup } = combineSignals(undefined, 5_000, active);
	await sleep(100);
	assert.equal(signal.aborted, false);
	cleanup();
});

// Unclamped, AbortSignal.timeout past 2^31 - 1 fires within a few milliseconds; the wait here
// is 75 times that.
test("a timeout past 2^31 - 1, Infinity included, is clamped instead of firing at once", async () => {
	const active = new Set<AbortController>();
	const combined = [
		Number.POSITIVE_INFINITY,
		2 ** 31,
		2 ** 32,
		Number.MAX_SAFE_INTEGER,
	].map((timeoutMs) => combineSignals(undefined, timeoutMs, active));

	await sleep(150);
	for (const { signal, cleanup } of combined) {
		assert.equal(signal.aborted, false);
		cleanup();
	}
	assert.equal(active.size, 0);
});

test("an out-of-range timeout throws before anything is registered", () => {
	const active = new Set<AbortController>();
	for (const timeoutMs of [Number.NaN, -1, 1.5]) {
		assert.throws(
			() => combineSignals(undefined, timeoutMs, active),
			{ code: "ERR_OUT_OF_RANGE" },
			String(timeoutMs),
		);
		assert.equal(active.size, 0, String(timeoutMs));
	}
});

test("each call registers in the set it was given and nowhere else", () => {
	const left = new Set<AbortController>();
	const right = new Set<AbortController>();
	const a = combineSignals(undefined, 5_000, left);
	const b = combineSignals(undefined, 5_000, right);

	assert.equal(left.size, 1);
	assert.equal(right.size, 1);
	a.cleanup();
	assert.equal(left.size, 0);
	assert.equal(right.size, 1);
	b.cleanup();
});
