import assert from "node:assert/strict";
import { test } from "node:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import {
	ELLIPSIS,
	fitCell,
	joinParts,
	padCenter,
	padRight,
	pickFitting,
	truncateVisible,
	wrapCommaDelimited,
} from "../src/text/index.js";
import { readFixture } from "./phase6-fixtures.js";

/*
 * Ported from splash test/text.test.ts, whose ids are kept in the test names so the mapping
 * from the moved tests stays visible: T-04 padRight/padCenter, T-05 and T-14
 * wrapCommaDelimited, T-08 truncateVisible, T-09 and T-15 fitCell, T-10 joinParts, T-11
 * pickFitting. Splash measured with its own `visibleLength`, a one-line wrapper over pi-tui's
 * `visibleWidth`, and stripped escapes with `sanitizeTuiText`; here both come from pi-tui.
 */

const SGR_RED = "\x1b[38;2;200;0;0m";
const OSC_LINK = "\x1b]8;;https://example.com\x07link\x1b]8;;\x07";

// No escape sequence may be split: every ESC must begin a complete SGR or OSC-8 sequence.
function hasBrokenEscape(text: string): boolean {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape sequences
	return /\x1b(?!\[[0-9;]*m|\]8;;[^\x07]*\x07)/.test(text);
}

interface LayoutFixture {
	padRight: { text: string; width: number; output: string }[];
	padCenter: { text: string; width: number; output: string }[];
	truncateVisible: { text: string; width: number; output: string }[];
	fitCell: { text: string; width: number; output: string }[];
	pickFitting: { candidates: string[]; width: number; output: string }[];
	joinParts: {
		parts: (string | null | false)[];
		separator: string | null;
		output: string;
	}[];
	wrapCommaDelimited: {
		items: string[];
		width: number;
		itemWidths?: number[];
		lines: string[];
	}[];
}

// Captured from splash's src/text.ts before it was edited.
const fixture = readFixture<LayoutFixture>("text-layout");
const UNDEFINED = "__undefined__";

test("every layout helper reproduces splash's output over the captured matrix", () => {
	assert.ok(fixture.padRight.length > 100);
	for (const { text, width, output } of fixture.padRight) {
		assert.equal(
			padRight(text, width),
			output,
			`padRight ${width} ${JSON.stringify(text)}`,
		);
	}
	for (const { text, width, output } of fixture.padCenter) {
		assert.equal(
			padCenter(text, width),
			output,
			`padCenter ${width} ${JSON.stringify(text)}`,
		);
	}
	for (const { text, width, output } of fixture.truncateVisible) {
		assert.equal(
			truncateVisible(text, width),
			output,
			`truncateVisible ${width} ${JSON.stringify(text)}`,
		);
	}
	for (const { text, width, output } of fixture.fitCell) {
		assert.equal(
			fitCell(text, width),
			output,
			`fitCell ${width} ${JSON.stringify(text)}`,
		);
	}
	for (const { candidates, width, output } of fixture.pickFitting) {
		assert.equal(
			pickFitting(candidates, width),
			output,
			`pickFitting ${width} ${JSON.stringify(candidates)}`,
		);
	}
	for (const { parts, separator, output } of fixture.joinParts) {
		const real = parts.map((part) => (part === UNDEFINED ? undefined : part));
		assert.equal(
			separator === null ? joinParts(real) : joinParts(real, separator),
			output,
			JSON.stringify(parts),
		);
	}
	assert.ok(fixture.wrapCommaDelimited.length > 100);
	for (const {
		items,
		width,
		itemWidths,
		lines,
	} of fixture.wrapCommaDelimited) {
		assert.deepEqual(
			wrapCommaDelimited(items, width, itemWidths),
			lines,
			`wrapCommaDelimited ${width} ${JSON.stringify(items)} ${JSON.stringify(itemWidths)}`,
		);
	}
});

test("padRight / padCenter pad to the requested visible width, never truncate (T-04)", () => {
	const texts = ["", "a", "hello", `${SGR_RED}hi\x1b[0m`];
	for (const text of texts) {
		const len = visibleWidth(text);
		for (let width = 0; width <= 60; width++) {
			const expected = Math.max(width, len);
			assert.equal(
				visibleWidth(padRight(text, width)),
				expected,
				`padRight(${JSON.stringify(text)}, ${width})`,
			);
			assert.equal(
				visibleWidth(padCenter(text, width)),
				expected,
				`padCenter(${JSON.stringify(text)}, ${width})`,
			);
		}
	}
});

test("padRight left-aligns (T-04)", () => {
	assert.equal(padRight("ab", 5), "ab   ");
});

test("padCenter balances padding within one column (T-04)", () => {
	for (let width = 0; width <= 40; width++) {
		const result = padCenter("abc", width);
		const left = result.length - result.trimStart().length;
		const right = result.length - result.trimEnd().length;
		assert.ok(
			Math.abs(left - right) <= 1,
			`width=${width}: left=${left} right=${right}`,
		);
	}
});

test("wrapCommaDelimited returns [] for empty items (T-05)", () => {
	assert.deepEqual(wrapCommaDelimited([], 20), []);
});

test("wrapCommaDelimited keeps a single short item on one line with no trailing comma (T-05)", () => {
	const lines = wrapCommaDelimited(["alpha"], 20);
	assert.equal(lines.length, 1);
	assert.equal(lines[0]?.trimEnd().endsWith(","), false);
	assert.ok(lines[0]?.includes("alpha"));
});

test("wrapCommaDelimited keeps every line within width and marks breaks with a trailing comma (T-05)", () => {
	const itemSets = [
		["alpha", "beta", "gamma", "delta", "epsilon"],
		["a", "b", "c", "d", "e", "f", "g", "h"],
		["one", "two", "three", "four", "five", "six", "seven"],
	];
	for (const items of itemSets) {
		const longest = Math.max(...items.map((s) => s.length));
		for (let width = longest + 2; width <= 60; width++) {
			const lines = wrapCommaDelimited(items, width);
			for (const [i, line] of lines.entries()) {
				assert.ok(
					visibleWidth(line) <= width,
					`items=${items.join("/")} width=${width} line ${i} too wide: ${JSON.stringify(line)}`,
				);
				const trimmed = line.trimEnd();
				if (i < lines.length - 1) {
					assert.ok(
						trimmed.endsWith(","),
						`width=${width} line ${i} lacks break comma: ${JSON.stringify(line)}`,
					);
				} else {
					assert.equal(
						trimmed.endsWith(","),
						false,
						`width=${width} last line has dangling comma`,
					);
				}
			}
			const reconstructed = lines
				.join(",")
				.split(",")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			assert.deepEqual(
				reconstructed,
				items,
				`width=${width} loses or reorders items`,
			);
		}
	}
});

test("wrapCommaDelimited measures wide characters in columns (T-05)", () => {
	const lines = wrapCommaDelimited(["日本語", "中文", "한국어"], 10);
	for (const line of lines) {
		assert.ok(visibleWidth(line) <= 10, JSON.stringify(line));
	}
	assert.ok(
		lines.length > 1,
		"wide items must wrap where code units alone would seem to fit",
	);
});

test("wrapCommaDelimited does not lose an item wider than the width (T-14)", () => {
	const lines = wrapCommaDelimited(["tiny", "averylongitemthatcannotfit"], 10);
	const joined = lines.join("\n");
	assert.ok(joined.includes("averylongitemthatcannotfit"));
	assert.ok(joined.includes("tiny"));
});

test("wrapCommaDelimited trusts the widths it is given", () => {
	// Declared widths of 4 make "a" and "b" too wide to share a line of 8 (4 + 2 + 4 + 1 > 8).
	assert.deepEqual(wrapCommaDelimited(["a", "b"], 8, [4, 4]), ["a,", "b"]);
	assert.deepEqual(wrapCommaDelimited(["a", "b"], 8), ["a, b"]);
});

test("truncateVisible hits min(maxWidth, width) exactly and never splits escapes (T-08)", () => {
	const corpus = [
		"The quick brown fox",
		`pre${SGR_RED}mid\x1b[0mpost`,
		`a${OSC_LINK}z`,
	];
	for (const text of corpus) {
		const len = visibleWidth(text);
		for (let maxWidth = 0; maxWidth <= len + 5; maxWidth++) {
			const result = truncateVisible(text, maxWidth);
			assert.equal(
				visibleWidth(result),
				Math.min(maxWidth, len),
				`text=${JSON.stringify(text)} maxWidth=${maxWidth}`,
			);
			assert.equal(
				hasBrokenEscape(result),
				false,
				`broken escape in ${JSON.stringify(result)}`,
			);
		}
	}
});

test("truncateVisible is a prefix for escape-free text (T-08)", () => {
	const text = "The quick brown fox";
	for (let maxWidth = 0; maxWidth <= text.length + 3; maxWidth++) {
		assert.equal(
			truncateVisible(text, maxWidth),
			text.slice(0, Math.min(maxWidth, text.length)),
		);
	}
});

test("truncateVisible drops a wide character straddling the cut instead of overflowing (T-08)", () => {
	assert.equal(truncateVisible("日本", 3), "日");
	assert.equal(truncateVisible("日本語", 4), "日本");
});

test("fitCell leaves fitting text unchanged (T-09)", () => {
	for (const text of ["", "abc", `${SGR_RED}ab\x1b[0m`]) {
		assert.equal(fitCell(text, 10), text);
	}
});

test("fitCell truncates plain text to width with an ellipsis (T-09)", () => {
	// Byte-level output carries an unconditional ESC[39m fg-close; the contract governs visible
	// content, so compare after stripping escapes.
	const text = "abcdefghijklmnop";
	for (let width = ELLIPSIS.length; width < text.length; width++) {
		const result = fitCell(text, width);
		const expected = text.slice(0, width - ELLIPSIS.length) + ELLIPSIS;
		assert.equal(stripTerminalSequences(result), expected, `width=${width}`);
		assert.equal(visibleWidth(result), width, `width=${width}`);
		assert.equal(
			result.includes("\x1b[0m"),
			false,
			`width=${width}: full reset leaks`,
		);
	}
});

test("fitCell closes an open colour span with a foreground-only reset (T-09)", () => {
	const result = fitCell(`${SGR_RED}averylongcoloredvalue`, 8);
	assert.ok(visibleWidth(result) <= 8);
	assert.ok(result.includes("\x1b[39m"), "must close fg span with ESC[39m");
	assert.equal(
		result.includes("\x1b[0m"),
		false,
		"full reset would destroy the surrounding bg",
	);
	assert.ok(stripTerminalSequences(result).endsWith(ELLIPSIS));
});

test("fitCell below the ellipsis width truncates without overflowing (T-15)", () => {
	// Too narrow for the 3-col ellipsis: fitCell drops it rather than overflow width.
	const text = "abcdef";
	for (let width = 0; width < ELLIPSIS.length; width++) {
		const result = fitCell(text, width);
		assert.ok(
			visibleWidth(result) <= Math.max(width, 0),
			`width=${width} produced ${JSON.stringify(result)} (${visibleWidth(result)} cols)`,
		);
		assert.equal(
			result.includes("\x1b[0m"),
			false,
			`width=${width}: full reset leaks`,
		);
	}
});

test("fitCell fits wide text by columns", () => {
	const result = fitCell("日本語テキスト", 5);
	assert.ok(visibleWidth(result) <= 5);
	assert.equal(stripTerminalSequences(result), `日${ELLIPSIS}`);
});

test("joinParts drops falsy parts and joins with the default separator (T-10)", () => {
	assert.equal(
		joinParts(["a", undefined, "b", false, null, "", "c"]),
		"a · b · c",
	);
});

test("joinParts supports a custom separator and yields an empty string when nothing is present (T-10)", () => {
	assert.equal(joinParts(["a", "b"], "-"), "a-b");
	assert.equal(joinParts([undefined, null, false, ""]), "");
	assert.equal(joinParts([]), "");
});

test("pickFitting returns the first candidate that fits (T-11)", () => {
	const candidates = ["a fairly long option", "shorter one", "tiny"];
	assert.equal(pickFitting(candidates, 30), "a fairly long option");
	assert.equal(pickFitting(candidates, 15), "shorter one");
	assert.equal(pickFitting(candidates, 5), "tiny");
});

test("pickFitting force-fits the last candidate when none fit (T-11)", () => {
	const candidates = ["aaaaaaaaaa", "bbbbbbbb", "cccccc"];
	const result = pickFitting(candidates, 5);
	assert.ok(visibleWidth(result) <= 5, `got ${JSON.stringify(result)}`);
	assert.ok(
		stripTerminalSequences(result).startsWith("c"),
		"must derive from the last candidate",
	);
});

test("pickFitting of no candidates is an empty string, where splash's copy threw", () => {
	assert.equal(pickFitting([], 5), "");
	assert.equal(pickFitting([], 0), "");
});
