import assert from "node:assert/strict";
import { test } from "node:test";
import { StreamingWordCounter } from "../src/activity/index.js";

test("StreamingWordCounter counts words split across deltas once", () => {
	const counter = new StreamingWordCounter();

	assert.equal(counter.count("hel"), 1);
	assert.equal(counter.count("lo world"), 1);
	assert.equal(counter.count(" again"), 1);
});

test("StreamingWordCounter separates thinking and text streams", () => {
	const counter = new StreamingWordCounter();

	assert.equal(counter.count("thought", "thinking_delta"), 1);
	assert.equal(counter.count("answer", "text_delta"), 1);
});

test("StreamingWordCounter preserves in-word state across interleaved streams", () => {
	const counter = new StreamingWordCounter();

	assert.equal(counter.count("hel", "thinking_delta"), 1);
	assert.equal(counter.count("answer", "text_delta"), 1);
	assert.equal(counter.count("lo", "thinking_delta"), 0);
});

test("StreamingWordCounter reset starts a new stream", () => {
	const counter = new StreamingWordCounter();

	assert.equal(counter.count("partial"), 1);
	counter.reset();
	assert.equal(counter.count("continuation"), 1);
});

test("StreamingWordCounter treats unicode spaces as boundaries", () => {
	const counter = new StreamingWordCounter();

	// NBSP, ideographic space and the zero-width no-break space all split words.
	assert.equal(counter.count("a\u00a0b\u3000c\ufeffd e"), 5);
	assert.equal(counter.count(""), 0);
});
