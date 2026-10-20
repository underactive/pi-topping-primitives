import assert from "node:assert/strict";
import { test } from "node:test";
import {
	BAR_CELLS,
	BAR_FILLED,
	BAR_TROUGH,
	type CometPalette,
	renderCometBar,
	SYNTHWAVE_GREENS,
} from "../src/color/index.js";
import { stripSgr } from "../src/text/index.js";
import {
	decodeNumber,
	type EncodedNumber,
	readFixture,
} from "./phase6-fixtures.js";

interface CometFixture {
	cases: {
		percent: EncodedNumber;
		elapsedMs: EncodedNumber;
		mode: "truecolor" | "256color";
		bar: string;
	}[];
}

const MODE = { mode: "truecolor" as const };

// Captured from compact's renderProgressBar before it was edited. Statusline's
// renderCompactionBar produced the same strings for every case, which is why the two copies
// could become one.
const fixture = readFixture<CometFixture>("comet-bar");

function filledColors(bar: string): Array<[number, number, number]> {
	const colors: Array<[number, number, number]> = [];
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape sequences
	for (const match of bar.matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m▋/g)) {
		colors.push([Number(match[1]), Number(match[2]), Number(match[3])]);
	}
	return colors;
}

function brightestCell(colors: Array<[number, number, number]>): number {
	let brightest = 0;
	for (let i = 1; i < colors.length; i++) {
		if ((colors[i]?.[1] ?? 0) > (colors[brightest]?.[1] ?? 0)) brightest = i;
	}
	return brightest;
}

test("renderCometBar reproduces compact's bar over the whole captured matrix", () => {
	// 9 percentages x 9 elapsed values x 2 modes.
	assert.equal(fixture.cases.length, 162);
	for (const { percent, elapsedMs, mode, bar } of fixture.cases) {
		assert.equal(
			renderCometBar(decodeNumber(percent) as number, {
				mode,
				elapsedMs: decodeNumber(elapsedMs),
			}),
			bar,
			`${mode} percent ${percent} elapsed ${elapsedMs}`,
		);
	}
});

test("the bar has the expected glyphs, a Synthwave-green trough and foreground-only resets", () => {
	const bar = renderCometBar(50, MODE);
	assert.equal(stripSgr(bar), `${"▋".repeat(10)}${"░".repeat(10)}`);
	assert.ok(bar.includes("\x1b[38;2;38;100;70m"), "trough colour");
	assert.ok(bar.includes("\x1b[2m"), "trough is dimmed");
	assert.ok(
		!bar.includes("\x1b[0m"),
		"a full reset would clear the caller's background",
	);
	assert.ok(bar.endsWith("\x1b[39m"));
});

test("the glyph and width constants are the ones the context graph uses", () => {
	assert.equal(BAR_CELLS, 20);
	assert.equal(BAR_FILLED, "\u258b");
	assert.equal(BAR_TROUGH, "\u2591");
});

test("a full bar has no trough and an empty bar has no filled cell", () => {
	const full = renderCometBar(100, MODE);
	assert.equal(stripSgr(full), BAR_FILLED.repeat(BAR_CELLS));
	assert.ok(!full.includes(BAR_TROUGH));
	const empty = renderCometBar(0, MODE);
	assert.equal(stripSgr(empty), BAR_TROUGH.repeat(BAR_CELLS));
	assert.ok(!empty.includes(BAR_FILLED));
});

test("the phosphor comet travels from right to left", () => {
	const right = filledColors(renderCometBar(100, { ...MODE, elapsedMs: 500 }));
	const left = filledColors(renderCometBar(100, { ...MODE, elapsedMs: 1_500 }));
	assert.equal(right.length, 20);
	assert.equal(left.length, 20);
	assert.notDeepEqual(right, left);
	assert.ok(brightestCell(right) > brightestCell(left));
});

test("the sweep repeats every two seconds and parks at its start without a clock", () => {
	const at = (elapsedMs?: number) => renderCometBar(60, { ...MODE, elapsedMs });
	assert.equal(at(250), at(2_250));
	assert.equal(at(1_999), at(5_999));
	assert.equal(at(0), at(undefined));
	assert.equal(at(0), at(2_000));
	for (const unreadable of [Number.NaN, -5, Number.POSITIVE_INFINITY]) {
		assert.equal(at(unreadable), at(0), String(unreadable));
	}
});

test("the bar supports the 256-colour fallback", () => {
	const bar = renderCometBar(100, { mode: "256color", elapsedMs: 500 });
	assert.ok(bar.includes("\x1b[38;5;"));
	assert.ok(!bar.includes("\x1b[38;2;"));
	assert.ok(!bar.includes("\x1b[0m"));
});

test("the bar clamps out-of-range percentages and reads NaN and the infinities as 0", () => {
	const empty = renderCometBar(0, MODE);
	const full = renderCometBar(100, MODE);
	assert.equal(renderCometBar(-10, MODE), empty);
	assert.equal(renderCometBar(150, MODE), full);
	// compact's copy tested `Number.isFinite(percent)` before clamping, so +Infinity is 0%, not
	// 100%. The fixture does not cover this; the differential run against compact's HEAD does.
	for (const unreadable of [
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
	]) {
		assert.equal(renderCometBar(unreadable, MODE), empty, String(unreadable));
	}
});

test("percentages round to the nearest cell", () => {
	for (const [percent, cells] of [
		[1, 0],
		[2.4, 0],
		[2.6, 1],
		[37, 7],
		[99, 20],
	] as const) {
		assert.equal(
			(stripSgr(renderCometBar(percent, MODE)).match(/▋/g) ?? []).length,
			cells,
			String(percent),
		);
	}
});

test("a custom palette recolours the bar without changing its shape", () => {
	const palette: CometPalette = Object.freeze({
		deep: Object.freeze([10, 0, 0] as const),
		base: Object.freeze([200, 0, 0] as const),
		light: Object.freeze([255, 200, 200] as const),
		trough: Object.freeze([90, 10, 10] as const),
	});
	const custom = renderCometBar(50, { ...MODE, elapsedMs: 700, palette });
	const standard = renderCometBar(50, { ...MODE, elapsedMs: 700 });
	assert.notEqual(custom, standard);
	assert.equal(stripSgr(custom), stripSgr(standard));
	assert.ok(custom.includes("\x1b[38;2;90;10;10m"), "custom trough colour");
	assert.ok(!custom.includes("\x1b[38;2;38;100;70m"));
	// Asking for the shipped palette by name is the same as the default.
	assert.equal(
		renderCometBar(50, { ...MODE, elapsedMs: 700, palette: SYNTHWAVE_GREENS }),
		standard,
	);
});
