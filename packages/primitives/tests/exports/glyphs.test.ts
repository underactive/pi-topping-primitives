import assert from "node:assert/strict";
import { test } from "node:test";
import * as glyphs from "@underactive/pi-topping-primitives/glyphs";

test("compiled ./glyphs exposes frozen frames and spinners", () => {
	assert.equal(glyphs.BOX_STYLES.rounded.topLeft, "\u256d");
	assert.equal(glyphs.ASCII_BOX.horizontal, "-");
	assert.equal(glyphs.SPINNER_FRAMES.length, 10);
	assert.equal(glyphs.QUADRANT_SPINNER_FRAMES.length, 4);
	assert.equal(glyphs.SPINNER_FRAME_MS, 80);
	for (const table of [
		glyphs.BOX_STYLES,
		glyphs.BOX_STYLES.heavy,
		glyphs.ASCII_BOX,
		glyphs.SPINNER_FRAMES,
		glyphs.QUADRANT_SPINNER_FRAMES,
	]) {
		assert.ok(Object.isFrozen(table));
	}
});
