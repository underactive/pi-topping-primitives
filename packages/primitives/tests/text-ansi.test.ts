import assert from "node:assert/strict";
import { test } from "node:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { stripSgr } from "../src/text/index.js";

test("stripSgr removes colour and style escapes", () => {
	assert.equal(stripSgr("\x1b[31mred\x1b[0m"), "red");
	assert.equal(stripSgr("\x1b[38;2;1;2;3mx\x1b[39m"), "x");
	assert.equal(stripSgr("\x1b[1;4;38;5;196mx\x1b[22;24;39m"), "x");
	assert.equal(stripSgr("a\x1b[mb"), "ab");
	assert.equal(stripSgr("plain"), "plain");
	assert.equal(stripSgr(""), "");
});

test("stripSgr leaves an OSC 8 hyperlink envelope in place", () => {
	const link = "\x1b]8;;https://example.com\x07text\x1b]8;;\x07";
	assert.equal(stripSgr(link), link);
	assert.equal(stripSgr(`\x1b[31m${link}\x1b[39m`), link);
	// pi-tui's stripper is the one that removes the envelope too.
	assert.equal(stripTerminalSequences(link), "text");
});

test("stripSgr leaves other CSI sequences alone", () => {
	assert.equal(stripSgr("\x1b[2Jclear"), "\x1b[2Jclear");
	assert.equal(stripSgr("a\x1b[Kb"), "a\x1b[Kb");
	assert.equal(stripSgr("\x1b[1;1Hhome"), "\x1b[1;1Hhome");
});

test("stripSgr keeps no state between calls", () => {
	const text = "\x1b[31ma\x1b[39m\x1b[32mb\x1b[39m";
	for (let i = 0; i < 4; i++) assert.equal(stripSgr(text), "ab");
});
