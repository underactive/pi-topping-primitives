import assert from "node:assert/strict";
import { test } from "node:test";
import { abortError, isAbortError } from "../src/abort/index.js";

test("abortError builds an Error named AbortError with the message", () => {
	const error = abortError("stopped by the user");
	assert.ok(error instanceof Error);
	assert.equal(error.name, "AbortError");
	assert.equal(error.message, "stopped by the user");
});

test("isAbortError recognises abortError and what the platform rejects with", () => {
	assert.equal(isAbortError(abortError("x")), true);
	assert.equal(isAbortError(new DOMException("x", "AbortError")), true);
	assert.equal(isAbortError(AbortSignal.abort().reason), true);
});

test("isAbortError rejects everything else", () => {
	assert.equal(isAbortError(new Error("x")), false);
	assert.equal(isAbortError(new DOMException("x", "TimeoutError")), false);
	assert.equal(isAbortError(AbortSignal.timeout(0).reason), false);
	assert.equal(isAbortError({ name: "AbortError" }), false);
	assert.equal(isAbortError("AbortError"), false);
	assert.equal(isAbortError(undefined), false);
	assert.equal(isAbortError(null), false);
});
