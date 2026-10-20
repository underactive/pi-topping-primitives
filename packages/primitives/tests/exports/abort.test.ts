import assert from "node:assert/strict";
import { test } from "node:test";
import * as abort from "@underactive/pi-topping-primitives/abort";

test("compiled ./abort builds and recognises abort errors", async () => {
	assert.equal(abort.isAbortError(abort.abortError("x")), true);
	assert.equal(abort.isAbortError(new Error("x")), false);

	const controller = new AbortController();
	controller.abort();
	await assert.rejects(
		abort.raceAbort(new Promise<void>(() => {}), controller.signal, "stopped"),
		{ name: "AbortError", message: "stopped" },
	);
});

test("compiled ./abort composes a deadline without starting a timer at zero", () => {
	const deadline = abort.createDeadline(0, undefined);
	assert.equal(deadline.signal, undefined);
	assert.equal(deadline.timedOut(), false);
	deadline.dispose();
});

test("compiled ./abort registers and unregisters a request controller", () => {
	const active = new Set<AbortController>();
	const { signal, cleanup } = abort.combineSignals(undefined, 5_000, active);
	assert.equal(active.size, 1);
	assert.equal(signal.aborted, false);
	cleanup();
	assert.equal(active.size, 0);
});
