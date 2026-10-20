import assert from "node:assert/strict";
import { test } from "node:test";
import { raceAbort } from "../src/abort/index.js";

// The first three are moved from sensei's test/sensei/deadline.test.ts, with vitest's matchers
// written as node:assert.
test("raceAbort observes a rejection when the signal is already aborted", async () => {
	const controller = new AbortController();
	controller.abort();

	await assert.rejects(
		raceAbort(Promise.reject(new Error("late")), controller.signal, "aborted"),
		{ name: "AbortError", message: "aborted" },
	);
});

test("raceAbort passes through a value settled before abort", async () => {
	const controller = new AbortController();
	const result = raceAbort(
		Promise.resolve("value"),
		controller.signal,
		"aborted",
	);

	assert.equal(await result, "value");
	controller.abort();
});

test("raceAbort passes through a rejection settled before abort", async () => {
	const controller = new AbortController();
	const error = new Error("provider failed");
	const result = raceAbort(Promise.reject(error), controller.signal, "aborted");

	await assert.rejects(result, (thrown) => thrown === error);
	controller.abort();
});

test("raceAbort returns the very promise when there is no signal", () => {
	const promise = Promise.resolve(1);
	assert.equal(raceAbort(promise, undefined, "aborted"), promise);
});

test("raceAbort rejects with the abort message when the signal fires first", async () => {
	const controller = new AbortController();
	const never = new Promise<string>(() => {});
	const raced = raceAbort(never, controller.signal, "gave up");
	controller.abort();
	await assert.rejects(raced, { name: "AbortError", message: "gave up" });
});

test("raceAbort settles with the promise's own result after the signal fires late", async () => {
	const controller = new AbortController();
	let finish: (value: string) => void = () => {};
	const slow = new Promise<string>((resolve) => {
		finish = resolve;
	});
	const raced = raceAbort(slow, controller.signal, "aborted");
	finish("done");
	assert.equal(await raced, "done");
	controller.abort();
});

test("raceAbort removes its abort listener when the promise settles", async () => {
	const controller = new AbortController();
	const signal = controller.signal;
	let added = 0;
	let removed = 0;
	const addEventListener = signal.addEventListener.bind(signal);
	const removeEventListener = signal.removeEventListener.bind(signal);
	Object.assign(signal, {
		addEventListener: (
			...args: Parameters<AbortSignal["addEventListener"]>
		) => {
			added++;
			addEventListener(...args);
		},
		removeEventListener: (
			...args: Parameters<AbortSignal["removeEventListener"]>
		) => {
			removed++;
			removeEventListener(...args);
		},
	});

	assert.equal(await raceAbort(Promise.resolve(1), signal, "aborted"), 1);
	assert.equal(added, 1);
	assert.equal(removed, 1);

	const error = new Error("boom");
	await assert.rejects(
		raceAbort(Promise.reject(error), signal, "aborted"),
		(thrown) => thrown === error,
	);
	assert.equal(added, 2);
	assert.equal(removed, 2);
});
