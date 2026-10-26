import assert from "node:assert/strict";
import { test } from "node:test";
import * as glyphs from "@underactive/pi-topping-primitives/glyphs";
import type { ThinkingLevel } from "@underactive/pi-topping-primitives/models";

type Assert<T extends true> = T;
export type GradedLevelsAgree = [
	Assert<
		glyphs.GradedThinkingLevel extends Exclude<ThinkingLevel, "off">
			? true
			: false
	>,
	Assert<
		Exclude<ThinkingLevel, "off"> extends glyphs.GradedThinkingLevel
			? true
			: false
	>,
];

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
		glyphs.THINKING_LEVEL_LABELS,
		glyphs.THINKING_LEVEL_LABELS.nerd,
		glyphs.THINKING_LEVEL_LABELS.unicode,
		glyphs.THINKING_LEVEL_LABELS.ascii,
	]) {
		assert.ok(Object.isFrozen(table));
	}
	assert.equal(glyphs.THINKING_LEVEL_LABELS.nerd.xhigh, "\u{f0aa5} xhigh");
	assert.equal(glyphs.thinkingLevelLabel("max", "ascii"), "[max]");
	assert.equal(glyphs.thinkingLevelLabel("constructor", "unicode"), "");
	assert.equal(glyphs.thinkingLevelLabel("off", "nerd"), "");
});
