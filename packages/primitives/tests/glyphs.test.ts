import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
	ASCII_BOX,
	BOX_STYLES,
	type BoxGlyphs,
	type BoxStyle,
	type GradedThinkingLevel,
	QUADRANT_SPINNER_FRAMES,
	SPINNER_FRAME_MS,
	SPINNER_FRAMES,
	THINKING_LEVEL_LABELS,
	type ThinkingGlyphPreset,
	thinkingLevelLabel,
} from "../src/glyphs/index.js";
import { THINKING_LEVELS } from "../src/models/refs.js";

/*
 * The expected tables are written as code points on purpose: several box-drawing glyphs differ
 * only by weight, and a lookalike typed into the source would pass an eyeball review. They were
 * checked against statusline's src/theme.ts, pi-topping's src/prompt-decorator.ts (which names
 * the corners tl/tr/bl/br and the edges h/v), moa-fusion's src/ui/chrome.ts, pi-topping's
 * src/format.ts and persona-audit's TABLE_FRAMES before any of them was edited.
 */
const EXPECTED_THINKING: Record<
	ThinkingGlyphPreset,
	Record<GradedThinkingLevel, string>
> = {
	nerd: {
		minimal: "\u{f0a9e} min",
		low: "\u{f0a9f} low",
		medium: "\u{f0aa1} med",
		high: "\u{f0aa3} high",
		xhigh: "\u{f0aa5} xhigh",
		max: "\u{f06d} max",
	},
	unicode: {
		minimal: "\u25cb min",
		low: "\u25d4 low",
		medium: "\u25d1 med",
		high: "\u25d2 high",
		xhigh: "\u25d5 xhigh",
		max: "\u25c9 max",
	},
	ascii: {
		minimal: "[min]",
		low: "[low]",
		medium: "[med]",
		high: "[high]",
		xhigh: "[xhigh]",
		max: "[max]",
	},
};

const EXPECTED: Record<BoxStyle, BoxGlyphs> = {
	rounded: {
		topLeft: "\u256d",
		topRight: "\u256e",
		bottomLeft: "\u2570",
		bottomRight: "\u256f",
		horizontal: "\u2500",
		vertical: "\u2502",
	},
	heavy: {
		topLeft: "\u250f",
		topRight: "\u2513",
		bottomLeft: "\u2517",
		bottomRight: "\u251b",
		horizontal: "\u2501",
		vertical: "\u2503",
	},
	double: {
		topLeft: "\u2554",
		topRight: "\u2557",
		bottomLeft: "\u255a",
		bottomRight: "\u255d",
		horizontal: "\u2550",
		vertical: "\u2551",
	},
	single: {
		topLeft: "\u250c",
		topRight: "\u2510",
		bottomLeft: "\u2514",
		bottomRight: "\u2518",
		horizontal: "\u2500",
		vertical: "\u2502",
	},
};

test("BOX_STYLES holds the four border styles statusline and pi-topping drew", () => {
	assert.deepEqual(Object.keys(BOX_STYLES).sort(), [
		"double",
		"heavy",
		"rounded",
		"single",
	]);
	for (const style of Object.keys(EXPECTED) as BoxStyle[]) {
		assert.deepEqual({ ...BOX_STYLES[style] }, EXPECTED[style], style);
	}
});

test("every style has exactly the six frame glyphs, each one cell wide", () => {
	for (const [style, glyphs] of Object.entries(BOX_STYLES)) {
		assert.deepEqual(
			Object.keys(glyphs).sort(),
			[
				"bottomLeft",
				"bottomRight",
				"horizontal",
				"topLeft",
				"topRight",
				"vertical",
			],
			style,
		);
		for (const glyph of Object.values(glyphs)) {
			assert.equal(visibleWidth(glyph), 1, `${style} ${glyph}`);
		}
	}
});

test("ASCII_BOX is the plain-text frame", () => {
	assert.deepEqual(
		{ ...ASCII_BOX },
		{
			topLeft: "+",
			topRight: "+",
			bottomLeft: "+",
			bottomRight: "+",
			horizontal: "-",
			vertical: "|",
		},
	);
});

test("SPINNER_FRAMES is the braille set pi-tui's Loader cycles", () => {
	assert.deepEqual(
		[...SPINNER_FRAMES],
		[
			"\u280b",
			"\u2819",
			"\u2839",
			"\u2838",
			"\u283c",
			"\u2834",
			"\u2826",
			"\u2827",
			"\u2807",
			"\u280f",
		],
	);
	assert.equal(SPINNER_FRAME_MS, 80);
});

test("every spinner frame is one column wide, so a frame swap never shifts the line", () => {
	for (const frame of [...SPINNER_FRAMES, ...QUADRANT_SPINNER_FRAMES]) {
		assert.equal(visibleWidth(frame), 1, frame);
	}
});

test("QUADRANT_SPINNER_FRAMES is the four-step circle", () => {
	assert.deepEqual(
		[...QUADRANT_SPINNER_FRAMES],
		["\u25d0", "\u25d3", "\u25d1", "\u25d2"],
	);
});

test("thinking-level labels hold each preset and stay aligned with THINKING_LEVELS", () => {
	const presets = Object.keys(
		THINKING_LEVEL_LABELS,
	).sort() as ThinkingGlyphPreset[];
	assert.deepEqual(presets, ["ascii", "nerd", "unicode"]);
	for (const preset of presets) {
		assert.deepEqual(
			{ ...THINKING_LEVEL_LABELS[preset] },
			EXPECTED_THINKING[preset],
			preset,
		);
		assert.deepEqual(
			Object.keys(THINKING_LEVEL_LABELS[preset]),
			THINKING_LEVELS.filter((level) => level !== "off"),
			`${preset} level order`,
		);
	}
});

test("thinkingLevelLabel returns graded labels and rejects absent, unknown and prototype keys", () => {
	for (const preset of Object.keys(
		EXPECTED_THINKING,
	) as ThinkingGlyphPreset[]) {
		for (const level of Object.keys(
			EXPECTED_THINKING[preset],
		) as GradedThinkingLevel[]) {
			assert.equal(
				thinkingLevelLabel(level, preset),
				EXPECTED_THINKING[preset][level],
			);
		}
		for (const level of [
			"off",
			undefined,
			"",
			"ultra",
			"XHIGH",
			"constructor",
			"__proto__",
			"toString",
			"hasOwnProperty",
		]) {
			assert.equal(
				thinkingLevelLabel(level, preset),
				"",
				`${preset} ${String(level)}`,
			);
		}
	}
});

test("every table is frozen at every level", () => {
	for (const table of [
		BOX_STYLES,
		ASCII_BOX,
		SPINNER_FRAMES,
		QUADRANT_SPINNER_FRAMES,
		THINKING_LEVEL_LABELS,
	]) {
		assert.ok(Object.isFrozen(table));
	}
	for (const glyphs of Object.values(BOX_STYLES)) {
		assert.ok(Object.isFrozen(glyphs));
	}
	for (const labels of Object.values(THINKING_LEVEL_LABELS)) {
		assert.ok(Object.isFrozen(labels));
	}
});

test("a frozen table refuses a write", () => {
	assert.throws(() => {
		(SPINNER_FRAMES as unknown as string[]).push("x");
	}, TypeError);
	assert.throws(() => {
		(BOX_STYLES.rounded as unknown as Record<string, string>).topLeft = "x";
	}, TypeError);
	assert.throws(() => {
		(
			THINKING_LEVEL_LABELS.nerd as unknown as Record<
				GradedThinkingLevel,
				string
			>
		).xhigh = "x";
	}, TypeError);
});
