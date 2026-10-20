import assert from "node:assert/strict";
import { test } from "node:test";
import * as text from "@underactive/pi-topping-primitives/text";

test("compiled ./text fits a wide string through pi-tui's ruler", () => {
	assert.equal(text.fitCell("日本語テキスト", 5), "日\x1b[39m...");
	assert.equal(text.padCenter("日本", 8), "  日本  ");
	assert.equal(text.padRight("ab", 4), "ab  ");
});

test("compiled ./text sanitises and formats", () => {
	assert.equal(text.sanitizeLabel("a\tb"), "a b");
	assert.equal(text.stripControlChars("a\u200bb"), "ab");
	assert.equal(text.sanitizeTerminalBytes("a\tb"), "ab");
	assert.equal(text.stripSgr("\x1b[31mred\x1b[39m"), "red");
	assert.equal(text.formatCostUsd(0.1234), "$0.123");
	assert.equal(text.formatDurationCompact(65_000), "1m05s");
	assert.equal(text.pickFitting([], 4), "");
});
