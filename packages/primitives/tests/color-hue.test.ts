import assert from "node:assert/strict";
import { test } from "node:test";
import { hslToRgb, hsvToRgb, wrapDeg } from "../src/color/index.js";
import { readFixture } from "./phase6-fixtures.js";

interface HueFixture {
	hsl: { hue: number; s: number; l: number; rgb: number[] }[];
	hsv: { hue: number; s: number; v: number; rgb: number[] }[];
}

// Captured from statusline src/rainbow.ts hslToRgb and splash src/color.ts hsvRgb (whose
// "r;g;b" string was split into a tuple) before either was edited.
const fixture = readFixture<HueFixture>("hue");

test("hslToRgb reproduces the statusline values over the captured grid", () => {
	assert.ok(fixture.hsl.length > 50);
	for (const { hue, s, l, rgb } of fixture.hsl) {
		assert.deepEqual(hslToRgb(hue, s, l), rgb, `h=${hue} s=${s} l=${l}`);
	}
});

test("hsvToRgb reproduces splash's values over the captured grid, as a tuple", () => {
	assert.ok(fixture.hsv.length > 50);
	for (const { hue, s, v, rgb } of fixture.hsv) {
		assert.deepEqual(hsvToRgb(hue, s, v), rgb, `h=${hue} s=${s} v=${v}`);
	}
});

test("hslToRgb hits the primaries and the extremes", () => {
	assert.deepEqual(hslToRgb(0, 1, 0.5), [255, 0, 0]);
	assert.deepEqual(hslToRgb(120, 1, 0.5), [0, 255, 0]);
	assert.deepEqual(hslToRgb(240, 1, 0.5), [0, 0, 255]);
	assert.deepEqual(hslToRgb(60, 1, 0.5), [255, 255, 0]);
	assert.deepEqual(hslToRgb(180, 1, 0.5), [0, 255, 255]);
	assert.deepEqual(hslToRgb(300, 1, 0.5), [255, 0, 255]);
	assert.deepEqual(hslToRgb(123, 0, 0.5), [128, 128, 128]);
	assert.deepEqual(hslToRgb(123, 1, 0), [0, 0, 0]);
	assert.deepEqual(hslToRgb(123, 1, 1), [255, 255, 255]);
});

test("hsvToRgb hits the primaries and the extremes", () => {
	assert.deepEqual(hsvToRgb(0, 1, 1), [255, 0, 0]);
	assert.deepEqual(hsvToRgb(120, 1, 1), [0, 255, 0]);
	assert.deepEqual(hsvToRgb(240, 1, 1), [0, 0, 255]);
	assert.deepEqual(hsvToRgb(0, 0, 0.5), [128, 128, 128]);
	assert.deepEqual(hsvToRgb(77, 1, 0), [0, 0, 0]);
});

test("hsvToRgb wraps the hue; hslToRgb does not, so callers wrap first", () => {
	for (const hue of [30, 200, 330]) {
		assert.deepEqual(hsvToRgb(hue + 360, 0.8, 0.9), hsvToRgb(hue, 0.8, 0.9));
		assert.deepEqual(hsvToRgb(hue - 720, 0.8, 0.9), hsvToRgb(hue, 0.8, 0.9));
		assert.deepEqual(
			hslToRgb(wrapDeg(hue + 360), 0.9, 0.72),
			hslToRgb(hue, 0.9, 0.72),
		);
	}
});

test("wrapDeg maps any angle into 0 (inclusive) to 360 (exclusive)", () => {
	assert.equal(wrapDeg(0), 0);
	assert.equal(wrapDeg(360), 0);
	assert.equal(wrapDeg(720), 0);
	assert.equal(wrapDeg(-1), 359);
	assert.equal(wrapDeg(-360), 0);
	assert.equal(wrapDeg(365), 5);
	assert.equal(wrapDeg(359.5), 359.5);
	for (const deg of [-1e6, -361, -0.5, 0.5, 359.99, 1e6 + 0.25]) {
		const wrapped = wrapDeg(deg);
		assert.ok(wrapped >= 0 && wrapped < 360, `${deg} -> ${wrapped}`);
	}
});
