import assert from "node:assert/strict";
import { test } from "node:test";
import { ansiToRgb } from "../src/activity-tui/index.js";
import {
	channelsToFgAnsi,
	hexToFgAnsi,
	mixRgb,
	parseHex,
	parseSgrColor,
	rgbTo256,
	rgbToFgAnsi,
	xterm256ToRgb,
} from "../src/color/index.js";

test("parseHex reads #rrggbb in either case, with or without the hash", () => {
	assert.deepEqual(parseHex("#84c51a"), [132, 197, 26]);
	assert.deepEqual(parseHex("84C51A"), [132, 197, 26]);
	assert.deepEqual(parseHex("#000000"), [0, 0, 0]);
	assert.deepEqual(parseHex("#ffffff"), [255, 255, 255]);
});

test("parseHex rejects everything but six hex digits", () => {
	for (const bad of [
		"",
		"#",
		"#ggg",
		"#gggggg",
		"#12345",
		"#1234567",
		"#123",
		" #84c51a",
		"#84c51a ",
		"#84c51a\n",
		"84c51",
		"0x84c51a",
	]) {
		assert.equal(parseHex(bad), undefined, JSON.stringify(bad));
	}
});

test("parseHex hands back a fresh tuple each call", () => {
	const first = parseHex("#010203");
	const second = parseHex("#010203");
	assert.notEqual(first, second);
	assert.deepEqual(first, second);
});

test("mixRgb blends channel by channel and rounds", () => {
	assert.deepEqual(mixRgb([0, 0, 0], [255, 255, 255], 0.5), [128, 128, 128]);
	assert.deepEqual(mixRgb([0, 0, 0], [100, 200, 50], 0.25), [25, 50, 13]);
	assert.deepEqual(mixRgb([10, 20, 30], [10, 20, 30], 0.7), [10, 20, 30]);
});

test("mixRgb clamps the amount and leaves its inputs alone", () => {
	const from = Object.freeze([10, 20, 30] as const);
	const to = Object.freeze([200, 210, 220] as const);
	assert.deepEqual(mixRgb(from, to, -1), [10, 20, 30]);
	assert.deepEqual(mixRgb(from, to, 0), [10, 20, 30]);
	assert.deepEqual(mixRgb(from, to, 1), [200, 210, 220]);
	assert.deepEqual(mixRgb(from, to, 2), [200, 210, 220]);
	assert.deepEqual([...from], [10, 20, 30]);
	assert.deepEqual([...to], [200, 210, 220]);
});

test("rgbTo256 takes the gray ramp for equal channels, with black and white at the edges", () => {
	assert.equal(rgbTo256(0, 0, 0), 16);
	assert.equal(rgbTo256(7, 7, 7), 16);
	assert.equal(rgbTo256(8, 8, 8), 232);
	assert.equal(rgbTo256(128, 128, 128), 244);
	assert.equal(rgbTo256(248, 248, 248), 255);
	assert.equal(rgbTo256(249, 249, 249), 231);
	assert.equal(rgbTo256(255, 255, 255), 231);
});

test("rgbTo256 takes the 6x6x6 cube for anything else", () => {
	assert.equal(rgbTo256(255, 0, 0), 196);
	assert.equal(rgbTo256(0, 255, 0), 46);
	assert.equal(rgbTo256(0, 0, 255), 21);
	assert.equal(rgbTo256(255, 255, 0), 226);
	assert.equal(rgbTo256(255, 0, 255), 201);
	assert.equal(rgbTo256(0, 255, 255), 51);
	assert.equal(rgbTo256(0, 0, 1), 16);
});

test("xterm256ToRgb reads the gray ramp and the cube origin", () => {
	assert.deepEqual(xterm256ToRgb(16), [0, 0, 0]);
	assert.deepEqual(xterm256ToRgb(232), [8, 8, 8]);
	assert.deepEqual(xterm256ToRgb(244), [128, 128, 128]);
	assert.deepEqual(xterm256ToRgb(255), [238, 238, 238]);
});

test("xterm256ToRgb reads the terminal's own colours, 0 to 15, as black, like the cube origin at 16", () => {
	for (let n = 0; n <= 16; n++) {
		assert.deepEqual(xterm256ToRgb(n), [0, 0, 0], String(n));
	}
});

// DEFECT PIN. The cube levels here are statusline's `55 + v * 51`; xterm's are 0, 95, 135, 175,
// 215, 255 (`55 + v * 40`), so levels 4 and 5 come out above 255 and the others read bright.
// The values are kept so a faded 256-colour escape matches statusline's old bytes. When the
// cube is corrected on purpose, these expectations change with it, and so do the fade bytes.
test("xterm256ToRgb keeps statusline's cube arithmetic, including levels above 255 (known defect)", () => {
	assert.deepEqual(xterm256ToRgb(17), [0, 0, 106]); // xterm: 0, 0, 95
	assert.deepEqual(xterm256ToRgb(21), [0, 0, 310]); // xterm: 0, 0, 255
	assert.deepEqual(xterm256ToRgb(196), [310, 0, 0]); // xterm: 255, 0, 0
	assert.deepEqual(xterm256ToRgb(178), [259, 208, 0]); // xterm: 215, 175, 0
	assert.deepEqual(xterm256ToRgb(231), [310, 310, 310]); // xterm: 255, 255, 255
});

test("channelsToFgAnsi writes truecolor as given and 256-colour through rgbTo256", () => {
	assert.equal(channelsToFgAnsi(1, 2, 3, "truecolor"), "\x1b[38;2;1;2;3m");
	assert.equal(channelsToFgAnsi(255, 0, 0, "256color"), "\x1b[38;5;196m");
	assert.equal(channelsToFgAnsi(9, 9, 9, "256color"), "\x1b[38;5;232m");
});

test("rgbToFgAnsi is channelsToFgAnsi over a tuple, in both modes", () => {
	for (const rgb of [
		[0, 0, 0],
		[132, 197, 26],
		[255, 255, 255],
		[38, 100, 70],
	] as const) {
		for (const mode of ["truecolor", "256color"] as const) {
			assert.equal(
				rgbToFgAnsi(rgb, mode),
				channelsToFgAnsi(rgb[0], rgb[1], rgb[2], mode),
				`${rgb.join(",")} ${mode}`,
			);
		}
	}
});

test("hexToFgAnsi needs the mode and answers an empty string for a bad hex", () => {
	assert.equal(hexToFgAnsi("#84c51a", "truecolor"), "\x1b[38;2;132;197;26m");
	assert.equal(hexToFgAnsi("#ff0000", "256color"), "\x1b[38;5;196m");
	assert.equal(hexToFgAnsi("nope", "truecolor"), "");
	assert.equal(hexToFgAnsi("", "256color"), "");
});

test("parseSgrColor reads a truecolor foreground and background", () => {
	assert.deepEqual(parseSgrColor("\x1b[38;2;10;20;30m"), {
		kind: "truecolor",
		plane: "fg",
		rgb: [10, 20, 30],
	});
	assert.deepEqual(parseSgrColor("\x1b[48;2;1;2;3m"), {
		kind: "truecolor",
		plane: "bg",
		rgb: [1, 2, 3],
	});
});

test("parseSgrColor resolves a 256-colour foreground and background", () => {
	assert.deepEqual(parseSgrColor("\x1b[38;5;244m"), {
		kind: "indexed",
		plane: "fg",
		index: 244,
		rgb: [128, 128, 128],
	});
	assert.deepEqual(parseSgrColor("\x1b[48;5;232m"), {
		kind: "indexed",
		plane: "bg",
		index: 232,
		rgb: [8, 8, 8],
	});
});

test("parseSgrColor reads the default-foreground reset but not the background one", () => {
	assert.deepEqual(parseSgrColor("\x1b[39m"), { kind: "default", plane: "fg" });
	assert.equal(parseSgrColor("\x1b[49m"), undefined);
});

test("parseSgrColor is unanchored and takes the first colour it finds", () => {
	assert.deepEqual(parseSgrColor("\x1b[1m\x1b[38;2;7;8;9mtext\x1b[22m"), {
		kind: "truecolor",
		plane: "fg",
		rgb: [7, 8, 9],
	});
	assert.deepEqual(
		parseSgrColor("lead \x1b[38;5;196mx\x1b[38;2;1;2;3my\x1b[39m"),
		{ kind: "indexed", plane: "fg", index: 196, rgb: xterm256ToRgb(196) },
	);
});

test("parseSgrColor finds nothing in plain text, styles without colour, or a compound SGR", () => {
	for (const text of [
		"",
		"plain",
		"\x1b[1mbold\x1b[22m",
		"\x1b[0m",
		"\x1b[31mred", // the sixteen named colours are not read
		"\x1b[1;38;2;1;2;3m",
		"\x1b[38;2;1;2m",
		"\x1b[38;2;1;2;3",
	]) {
		assert.equal(parseSgrColor(text), undefined, JSON.stringify(text));
	}
});

test("parseSgrColor keeps no state between calls", () => {
	const text = "\x1b[38;2;1;2;3m";
	for (let i = 0; i < 4; i++) {
		assert.deepEqual(parseSgrColor(text)?.kind, "truecolor");
	}
});

test("parseSgrColor is not ./activity-tui's ansiToRgb: the broader reader finds what the narrow one refuses", () => {
	// ansiToRgb answers "can this foreground be blended?" and says null otherwise. Each of
	// these is a colour escape the blend cannot use and the parser can read.
	for (const [text, kind] of [
		["\x1b[38;5;196m", "indexed"],
		["\x1b[39m", "default"],
		["\x1b[48;2;1;2;3m", "truecolor"],
		["\x1b[48;5;70m", "indexed"],
	] as const) {
		assert.equal(ansiToRgb(text), null, `ansiToRgb ${JSON.stringify(text)}`);
		assert.equal(
			parseSgrColor(text)?.kind,
			kind,
			`parseSgrColor ${JSON.stringify(text)}`,
		);
	}
	// Where they overlap they agree on the numbers.
	const truecolor = "\x1b[1m\x1b[38;2;12;34;56m";
	assert.deepEqual(ansiToRgb(truecolor), [12, 34, 56]);
	assert.deepEqual(parseSgrColor(truecolor), {
		kind: "truecolor",
		plane: "fg",
		rgb: [12, 34, 56],
	});
});
