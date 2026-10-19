import assert from "node:assert/strict";
import { test } from "node:test";
import {
	easeFade,
	FADE_SHADE_COUNT,
	fadeShade,
	slideOutTail,
} from "../src/activity/index.js";
import { WORKING_STATUS_SLIDE_MS } from "../src/contracts/index.js";

test("easeFade is monotonic and pinned at both ends", () => {
	assert.equal(easeFade(0), 0);
	assert.equal(easeFade(1), 1);
	assert.ok(Math.abs(easeFade(0.5) - 0.5) < 1e-12, "the midpoint is half");
	assert.ok(easeFade(0.25) < easeFade(0.5) && easeFade(0.5) < easeFade(0.75));
});

test("easeFade clamps progress outside 0..1", () => {
	assert.equal(easeFade(-3), 0);
	assert.equal(easeFade(7), 1);
});

test("fadeShade splits the fade into equal steps", () => {
	assert.equal(FADE_SHADE_COUNT, 5);
	// 250 ms over 5 shades: 50 ms each.
	for (const [elapsed, shade] of [
		[0, 0],
		[49, 0],
		[50, 1],
		[99, 1],
		[100, 2],
		[199, 3],
		[200, 4],
		[249, 4],
	] as const) {
		assert.equal(fadeShade(elapsed, 250, 5), shade, `${elapsed} ms`);
	}
});

test("fadeShade clamps rather than overflow", () => {
	assert.equal(fadeShade(-10, 250, 5), 0);
	assert.equal(fadeShade(250, 250, 5), 4);
	assert.equal(fadeShade(1e9, 250, 5), 4);
	assert.equal(fadeShade(Number.NaN, 250, 5), 0);
	assert.equal(
		fadeShade(10, 0, 5),
		4,
		"a zero-length fade is already complete",
	);
	assert.equal(fadeShade(10, 500, 1), 0);
});

test("slideOutTail reveals the tail first and shows the whole text once the slide is over", () => {
	assert.equal(slideOutTail("test-model", 0), "");
	assert.equal(
		slideOutTail("test-model", WORKING_STATUS_SLIDE_MS / 2),
		"model",
	);
	assert.equal(
		slideOutTail("test-model", WORKING_STATUS_SLIDE_MS),
		"test-model",
	);
	let previous = "";
	for (let elapsed = 0; elapsed <= WORKING_STATUS_SLIDE_MS; elapsed += 10) {
		const shown = slideOutTail("test-model", elapsed);
		assert.ok(
			"test-model".endsWith(shown) && shown.length >= previous.length,
			`${elapsed}ms shows ${JSON.stringify(shown)}`,
		);
		previous = shown;
	}
});

test("slideOutTail never splits a surrogate pair", () => {
	const robot = String.fromCodePoint(0x1f916);
	const text = `${robot}db`;
	for (let elapsed = 0; elapsed <= WORKING_STATUS_SLIDE_MS; elapsed += 10) {
		assert.ok(
			["", "b", "db", text].includes(slideOutTail(text, elapsed)),
			`${elapsed}ms`,
		);
	}
});

test("slideOutTail takes its own duration, and negative time shows nothing", () => {
	assert.equal(slideOutTail("abcd", 50, 100), "cd");
	assert.equal(slideOutTail("abcd", 100, 100), "abcd");
	assert.equal(slideOutTail("abcd", -20), "");
	assert.equal(slideOutTail("", 10), "");
});
