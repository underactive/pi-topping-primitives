import assert from "node:assert/strict";
import { test } from "node:test";
import {
	sanitizedText,
	sanitizeLabel,
	sanitizeTerminalBytes,
	stripControlChars,
} from "../src/text/index.js";

/*
 * One input table through all four sanitisers, so their differences are pinned side by side.
 * Each row is what the vendored copy did: stripControlChars and sanitizedText from pi-topping
 * (src/util.ts), sanitizeTerminalBytes from persona-audit (AuditProgress.ts) and sanitizeLabel
 * from statusline (src/utils.ts).
 */
interface Row {
	name: string;
	input: string;
	stripControlChars: string;
	sanitizedText: string;
	sanitizeTerminalBytes: string;
	sanitizeLabel: string;
}

const ROWS: Row[] = [
	{
		name: "plain text passes through",
		input: "plain text",
		stripControlChars: "plain text",
		sanitizedText: "plain text",
		sanitizeTerminalBytes: "plain text",
		sanitizeLabel: "plain text",
	},
	{
		name: "a zero-width space is invisible format (Cf): two delete it, bytes keeps it, label turns it into a gap",
		input: "a\u200bb",
		stripControlChars: "ab",
		sanitizedText: "ab",
		sanitizeTerminalBytes: "a\u200bb",
		sanitizeLabel: "a b",
	},
	{
		name: "a C1 CSI introducer: label strips the whole sequence, the rest only the byte",
		input: "\u009b31m",
		stripControlChars: "31m",
		sanitizedText: "31m",
		sanitizeTerminalBytes: "31m",
		sanitizeLabel: "",
	},
	{
		name: "an OSC 8 opener: only label understands the sequence; the others leave its text",
		input: "\x1b]8;;x\x07",
		stripControlChars: "]8;;x",
		sanitizedText: "]8;;x",
		sanitizeTerminalBytes: "]8;;x",
		sanitizeLabel: "",
	},
	{
		name: "an SGR colour pair: only label removes the whole escape",
		input: "\x1b[31mred\x1b[0m",
		stripControlChars: "[31mred[0m",
		sanitizedText: "[31mred[0m",
		sanitizeTerminalBytes: "[31mred[0m",
		sanitizeLabel: "red",
	},
	{
		name: "tab is deleted by three and becomes a gap in a label",
		input: "a\tb",
		stripControlChars: "ab",
		sanitizedText: "ab",
		sanitizeTerminalBytes: "ab",
		sanitizeLabel: "a b",
	},
	{
		name: "newline behaves like tab",
		input: "x\ny",
		stripControlChars: "xy",
		sanitizedText: "xy",
		sanitizeTerminalBytes: "xy",
		sanitizeLabel: "x y",
	},
	{
		name: "DEL and a C1 control are control characters to all four",
		input: "a\u007fb\u0085c",
		stripControlChars: "abc",
		sanitizedText: "abc",
		sanitizeTerminalBytes: "abc",
		sanitizeLabel: "a b c",
	},
	{
		name: "a no-break space is a space separator (Zs), not a control: every sanitiser keeps it",
		input: "a\u00a0b",
		stripControlChars: "a\u00a0b",
		sanitizedText: "a\u00a0b",
		sanitizeTerminalBytes: "a\u00a0b",
		sanitizeLabel: "a\u00a0b",
	},
	{
		name: "a right-to-left override (Cf): two delete it, bytes keeps it, label turns it into a gap",
		input: "a\u202eb",
		stripControlChars: "ab",
		sanitizedText: "ab",
		sanitizeTerminalBytes: "a\u202eb",
		sanitizeLabel: "a b",
	},
	{
		name: "a soft hyphen (Cf) is outside label's list: label keeps it, and so does bytes",
		input: "a\u00adb",
		stripControlChars: "ab",
		sanitizedText: "ab",
		sanitizeTerminalBytes: "a\u00adb",
		sanitizeLabel: "a\u00adb",
	},

	{
		name: "a byte-order mark leads: label leaves a gap, and does not trim it",
		input: "\ufeffbom",
		stripControlChars: "bom",
		sanitizedText: "bom",
		sanitizeTerminalBytes: "\ufeffbom",
		sanitizeLabel: " bom",
	},
	{
		name: "only sanitizedText trims; only label collapses runs of spaces",
		input: "  a    b  ",
		stripControlChars: "  a    b  ",
		sanitizedText: "a    b",
		sanitizeTerminalBytes: "  a    b  ",
		sanitizeLabel: " a b ",
	},
	{
		name: "a line separator (Zl) is neither control nor format: three keep it, label turns it into a gap",
		input: "a\u2028b",
		stripControlChars: "a\u2028b",
		sanitizedText: "a\u2028b",
		sanitizeTerminalBytes: "a\u2028b",
		sanitizeLabel: "a b",
	},
];

for (const row of ROWS) {
	test(`sanitisers on ${row.name}`, () => {
		assert.equal(stripControlChars(row.input), row.stripControlChars);
		assert.equal(sanitizedText(row.input), row.sanitizedText);
		assert.equal(sanitizeTerminalBytes(row.input), row.sanitizeTerminalBytes);
		assert.equal(sanitizeLabel(row.input), row.sanitizeLabel);
	});
}

test("sanitizedText answers an empty string for anything that is not a string", () => {
	for (const value of [undefined, null, 42, true, {}, ["a"], Symbol.for("x")]) {
		assert.equal(sanitizedText(value), "", String(typeof value));
	}
});

test("sanitizedText never returns surrounding whitespace, whatever the controls hide", () => {
	assert.equal(sanitizedText("\t\u200b hi \u0000\n"), "hi");
	assert.equal(sanitizedText("\u200b\u200b"), "");
});

test("sanitizeLabel keeps a trailing label space that separates it from its value", () => {
	assert.equal(sanitizeLabel("TOK "), "TOK ");
	assert.equal(`${sanitizeLabel("TOK ")}42`, "TOK 42");
});

test("the sanitisers hold no state between calls", () => {
	for (let i = 0; i < 4; i++) {
		assert.equal(sanitizeTerminalBytes("a\u0001b"), "ab");
		assert.equal(sanitizeLabel("a\u0001b"), "a b");
		assert.equal(stripControlChars("a\u200bb"), "ab");
	}
});
