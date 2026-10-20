import assert from "node:assert/strict";
import { test } from "node:test";
import {
	channelsToFgAnsi,
	cosineFalloff,
	fadeRgbToward,
	type Rgb,
	shimmerCell,
} from "../src/color/index.js";
import { readFixture } from "./phase6-fixtures.js";

interface FadeFixture {
	target: Rgb;
	cases: {
		mode: "truecolor" | "256color";
		input: string;
		opacity: number;
		output: string;
	}[];
}

interface ShimmerFixture {
	bandHalf: number;
	peakAlpha: number;
	cases: {
		base: Rgb;
		highlight: Rgb;
		ch: string;
		dist: number;
		output: string;
	}[];
}

const BAR_BG: Rgb = [18, 18, 18];

// Captured from statusline's StatusTheme.fadeAnsi (target #121212) under pi-tui's forced
// truecolor and 256-colour capabilities, before it was edited.
const fade = readFixture<FadeFixture>("fade-sgr");
// Captured from splash's shimmerCell before it was edited.
const shimmer = readFixture<ShimmerFixture>("shimmer-cell");

test("fadeRgbToward reproduces statusline's fadeAnsi over the captured inputs, opacities and modes", () => {
	assert.deepEqual(fade.target, [18, 18, 18]);
	assert.ok(fade.cases.length > 150);
	for (const { mode, input, opacity, output } of fade.cases) {
		assert.equal(
			fadeRgbToward(input, fade.target, opacity, mode),
			output,
			`${mode} opacity ${opacity} ${JSON.stringify(input)}`,
		);
	}
});

test("fadeRgbToward at full opacity returns the text itself", () => {
	const text = "\x1b[38;2;254;188;56mA\x1b[39m";
	assert.equal(fadeRgbToward(text, BAR_BG, 1, "truecolor"), text);
	assert.equal(fadeRgbToward(text, BAR_BG, 7, "truecolor"), text);
});

test("fadeRgbToward treats a NaN opacity as no fade instead of writing NaN channels", () => {
	const text = "\x1b[38;2;254;188;56mA\x1b[39m";
	assert.equal(fadeRgbToward(text, BAR_BG, Number.NaN, "truecolor"), text);
	assert.equal(fadeRgbToward(text, BAR_BG, Number.NaN, "256color"), text);
});

test("fadeRgbToward clamps opacity below zero to a full sink", () => {
	const text = "\x1b[38;2;254;188;56mA\x1b[39m";
	assert.equal(
		fadeRgbToward(text, BAR_BG, -3, "truecolor"),
		fadeRgbToward(text, BAR_BG, 0, "truecolor"),
	);
	assert.equal(
		fadeRgbToward("\x1b[38;2;254;188;56mA", BAR_BG, 0, "truecolor"),
		"\x1b[38;2;18;18;18mA",
	);
});

test("fadeRgbToward keeps each colour in its plane and rewrites it in the host's mode", () => {
	assert.equal(
		fadeRgbToward("\x1b[48;2;200;100;0m", BAR_BG, 0.5, "truecolor"),
		"\x1b[48;2;109;59;9m",
	);
	// 256-colour output is the same blend, converted, in the plane it came from.
	const blended = channelsToFgAnsi(109, 59, 9, "256color");
	assert.equal(
		fadeRgbToward("\x1b[48;2;200;100;0m", BAR_BG, 0.5, "256color"),
		blended.replace("\x1b[38;", "\x1b[48;"),
	);
	assert.equal(
		fadeRgbToward("\x1b[38;2;200;100;0m", BAR_BG, 0.5, "256color"),
		blended,
	);
});

test("fadeRgbToward recolours the default foreground from a neutral stand-in", () => {
	assert.equal(
		fadeRgbToward("a\x1b[39mb", BAR_BG, 0.5, "truecolor"),
		"a\x1b[38;2;111;111;111mb",
	);
});

test("fadeRgbToward leaves the background reset, plain text and compound SGR alone", () => {
	for (const text of [
		"plain",
		"\x1b[49m",
		"\x1b[1;38;2;1;2;3m",
		"\x1b[0m\x1b[1m",
		"",
	]) {
		assert.equal(fadeRgbToward(text, BAR_BG, 0.5, "truecolor"), text);
	}
});

test("fadeRgbToward keeps OSC 8 envelopes intact", () => {
	const link = "\x1b]8;;https://example.com\x07";
	const close = "\x1b]8;;\x07";
	const faded = fadeRgbToward(
		`${link}\x1b[38;2;200;100;50mlink\x1b[39m${close}`,
		BAR_BG,
		0.5,
		"truecolor",
	);
	assert.ok(faded.startsWith(link));
	assert.ok(faded.endsWith(close));
});

test("fadeRgbToward holds no state between calls", () => {
	const inputs = [
		"\x1b[38;2;254;188;56mA\x1b[39m",
		"\x1b[48;5;236mB\x1b[49m",
		"plain",
		"\x1b[38;5;196mC\x1b[39m\x1b[39m",
	];
	const first = inputs.map((text) =>
		fadeRgbToward(text, BAR_BG, 0.4, "truecolor"),
	);
	for (let round = 0; round < 3; round++) {
		for (const [index, text] of inputs.entries()) {
			assert.equal(
				fadeRgbToward(text, BAR_BG, 0.4, "truecolor"),
				first[index],
				`round ${round} input ${index}`,
			);
		}
	}
});

test("fadeRgbToward blends toward whatever target it is given", () => {
	assert.equal(
		fadeRgbToward("\x1b[38;2;100;100;100m", [0, 200, 0], 0.5, "truecolor"),
		"\x1b[38;2;50;150;50m",
	);
});

test("cosineFalloff is a raised cosine from 1 at the centre to 0 at the half-width", () => {
	assert.equal(cosineFalloff(0, 2), 1);
	assert.equal(cosineFalloff(2, 2), 0);
	assert.equal(cosineFalloff(3, 2), 0);
	assert.equal(cosineFalloff(1, 2), 0.5);
	assert.ok(cosineFalloff(0.5, 2) > cosineFalloff(1, 2));
	assert.ok(cosineFalloff(1, 2) > cosineFalloff(1.5, 2));
});

test("cosineFalloff reads a distance as a magnitude, and a non-positive width as all zero", () => {
	assert.equal(cosineFalloff(-1, 2), cosineFalloff(1, 2));
	assert.equal(cosineFalloff(-2, 2), 0);
	assert.equal(cosineFalloff(-7, 2), 0);
	assert.equal(cosineFalloff(Number.NaN, 2), 0);
	assert.equal(cosineFalloff(0, 0), 0);
	assert.equal(cosineFalloff(0, -1), 0);
});

test("shimmerCell reproduces splash's cell over the captured palettes and distances", () => {
	assert.equal(shimmer.bandHalf, 5);
	assert.equal(shimmer.peakAlpha, 0.9);
	assert.ok(shimmer.cases.length > 50);
	for (const { base, highlight, ch, dist, output } of shimmer.cases) {
		const label = `dist ${dist} ${JSON.stringify(ch)} ${base}->${highlight}`;
		assert.equal(shimmerCell(ch, dist, { base, highlight }), output, label);
		// The defaults are the explicit values, not a separate code path.
		assert.equal(
			shimmerCell(
				ch,
				dist,
				{ base, highlight },
				{ bandHalf: 5, peakAlpha: 0.9, boldAbove: 0.2 },
			),
			output,
			label,
		);
	}
});

test("shimmerCell is bold at the crest and settles to the base ink at and beyond the band edge", () => {
	const palette = {
		base: [100, 100, 110],
		highlight: [230, 230, 235],
	} as const;
	assert.ok(shimmerCell("x", 0, palette).startsWith("\x1b[1m"));
	assert.ok(shimmerCell("x", 0, palette).endsWith("x\x1b[22m"));
	// The raised cosine reaches exactly 0 at the edge, so the edge cell is plain base ink whether
	// or not the band's edge counts as inside it.
	assert.equal(shimmerCell("x", 5, palette), "\x1b[38;2;100;100;110mx");
	assert.equal(shimmerCell("x", 5.01, palette), "\x1b[38;2;100;100;110mx");
	assert.equal(shimmerCell("x", 100, palette), "\x1b[38;2;100;100;110mx");
});

test("shimmerCell reads a distance as a magnitude and a non-finite one as base ink", () => {
	const palette = {
		base: [100, 100, 110],
		highlight: [230, 230, 235],
	} as const;
	const base = "\x1b[38;2;100;100;110mx";
	// Before the guard a negative distance wrapped round the cosine and glowed (-7 reached
	// about a third of the crest and went bold).
	for (const dist of [0.5, 1, 2.5, 4.99]) {
		assert.equal(
			shimmerCell("x", -dist, palette),
			shimmerCell("x", dist, palette),
			String(dist),
		);
	}
	assert.equal(shimmerCell("x", -7, palette), base);
	assert.equal(shimmerCell("x", Number.NaN, palette), base);
	assert.equal(shimmerCell("x", Number.POSITIVE_INFINITY, palette), base);
	assert.equal(shimmerCell("x", Number.NEGATIVE_INFINITY, palette), base);
});

test("shimmerCell with no band is all base ink instead of NaN channels", () => {
	const palette = { base: [10, 20, 30], highlight: [200, 210, 220] } as const;
	for (const bandHalf of [0, -3]) {
		assert.equal(
			shimmerCell("x", 0, palette, { bandHalf }),
			"\x1b[38;2;10;20;30mx",
			String(bandHalf),
		);
	}
});

test("shimmerCell takes a custom band, peak and bold threshold", () => {
	const palette = { base: [0, 0, 0], highlight: [200, 100, 50] } as const;
	const options = { bandHalf: 2, peakAlpha: 1, boldAbove: 0.9 };
	// The crest reaches the highlight exactly and is bold.
	assert.equal(
		shimmerCell("x", 0, palette, options),
		"\x1b[1m\x1b[38;2;200;100;50mx\x1b[22m",
	);
	// Halfway across the band: half the highlight, below the bold threshold.
	assert.equal(shimmerCell("x", 1, palette, options), "\x1b[38;2;100;50;25mx");
	// Past the band: base ink.
	assert.equal(shimmerCell("x", 3, palette, options), "\x1b[38;2;0;0;0mx");
});
