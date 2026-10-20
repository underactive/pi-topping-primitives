import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fuzzyFilter } from "@earendil-works/pi-tui";
import { fuzzyRanked } from "../src/models/filter.js";
import { TwoPaneModelThinking } from "../src/models/picker.js";
import { fakeTheme, kittyDigit } from "./models-harness.js";

describe("fuzzyRanked (G-03, G-04)", () => {
	const models = [
		"anthropic/claude-sonnet",
		"anthropic/claude-opus",
		"openai/gpt-4o",
		"google/gemini-pro",
	];
	const identity = (s: string) => s;

	it("returns the original order for an empty query", () => {
		assert.deepEqual(fuzzyRanked(models, "", identity), models);
	});
	it("drops items that do not match", () => {
		assert.deepEqual(fuzzyRanked(models, "zzzz", identity), []);
	});
	it("partitions literal-substring matches to the front (doc's own example)", () => {
		const ranked = fuzzyRanked(models, "opus", identity);
		assert.ok(ranked.includes("anthropic/claude-opus"));
		assert.equal(
			ranked[0],
			"anthropic/claude-opus",
			`got ${JSON.stringify(ranked)}`,
		);
		if (ranked.includes("anthropic/claude-sonnet")) {
			assert.ok(
				ranked.indexOf("anthropic/claude-opus") <
					ranked.indexOf("anthropic/claude-sonnet"),
				"scattered fuzzy match must not outrank the literal one",
			);
		}
	});
	it("keeps literal matches in stable original order", () => {
		const items = ["bb-opus-first", "aa-opus-second", "cc-opus-third"];
		assert.deepEqual(fuzzyRanked(items, "opus", identity), items);
	});
	it("splits the query on whitespace (README: 'anth opus')", () => {
		const ranked = fuzzyRanked(models, "anth opus", identity);
		assert.ok(
			ranked.includes("anthropic/claude-opus"),
			`got ${JSON.stringify(ranked)}`,
		);
		assert.equal(ranked.includes("openai/gpt-4o"), false);
	});
	it("gap pass (observed): the substring partition is case-insensitive", () => {
		const items = ["Anthropic/Claude-Sonnet", "Anthropic/Claude-Opus"];
		const ranked = fuzzyRanked(items, "opus", identity);
		assert.equal(
			ranked[0],
			"Anthropic/Claude-Opus",
			`got ${JSON.stringify(ranked)}`,
		);
	});
	it("works through a key extractor", () => {
		const objects = models.map((name) => ({ name }));
		const ranked = fuzzyRanked(objects, "gemini", (o) => o.name);
		assert.equal(ranked.length, 1);
		assert.equal(ranked[0]?.name, "google/gemini-pro");
	});
});

describe("default printable through TwoPaneModelThinking.handleInput", () => {
	function picker() {
		return new TwoPaneModelThinking({
			theme: fakeTheme(),
			refs: [{ provider: "p", id: "model" }],
			levelOptions: () => ["off"] as const,
		});
	}

	it("accepts a single character and multi-character printable paste", () => {
		// Preserve splash's exhaustive positive ASCII range and Unicode fixtures.
		for (let point = 0x20; point <= 0x7e; point++) {
			const ascii = picker();
			const text = String.fromCodePoint(point);
			ascii.handleInput(text);
			assert.equal(ascii.snapshot().filter, text, String(point));
		}
		for (const text of ["\u00a0", "\u00ff", "界", "😀"]) {
			const unicode = picker();
			unicode.handleInput(text);
			assert.equal(unicode.snapshot().filter, text);
		}
		const subject = picker();
		subject.handleInput("a");
		subject.handleInput(" pasted 界😀 text");
		assert.equal(subject.snapshot().filter, "a pasted 界😀 text");
	});

	it("decodes kitty CSI-u digits, Unicode and shifted printable text", () => {
		const subject = picker();
		subject.handleInput(kittyDigit(7));
		subject.handleInput("\x1b[128512u");
		subject.handleInput("\x1b[97:65;2u");
		assert.equal(subject.snapshot().filter, "7😀A");
	});

	it("rejects C0, DEL and C1 bytes embedded anywhere in pasted text", () => {
		for (const point of [
			...Array.from({ length: 32 }, (_, i) => i),
			...Array.from({ length: 33 }, (_, i) => i + 0x7f),
		]) {
			for (const text of [
				`safe${String.fromCodePoint(point)}`,
				`${String.fromCodePoint(point)}safe`,
			]) {
				const subject = picker();
				subject.handleInput(text);
				assert.equal(subject.snapshot().filter, "", JSON.stringify(text));
			}
		}
	});

	it("does not append empty input, standalone control bytes or terminal control sequences", () => {
		for (const text of [
			"",
			...Array.from({ length: 32 }, (_, i) => String.fromCodePoint(i)),
			...Array.from({ length: 33 }, (_, i) => String.fromCodePoint(i + 0x7f)),
			"\x1b[31m",
			"\x1b[2J",
			"\x1b]0;title\x07",
			"\x1b[200~paste\x1b[201~",
			"\x1b[97;5u",
			"\x1b[97;3u",
			"\x1b[97;9u",
			"\x1b[99999999u",
		]) {
			const subject = picker();
			subject.handleInput(text);
			assert.equal(subject.snapshot().filter, "", JSON.stringify(text));
		}
	});

	it("validates decoded kitty DEL and C1 payloads instead of inserting control characters", () => {
		for (let point = 0x7f; point <= 0x9f; point++) {
			const subject = picker();
			subject.handleInput(`\x1b[${point}u`);
			assert.equal(subject.snapshot().filter, "", String(point));
		}
	});

	it("honours the host printable override instead of the default decoder", () => {
		const subject = new TwoPaneModelThinking({
			theme: fakeTheme(),
			refs: [],
			levelOptions: () => ["off"] as const,
			printable: (data) => (data === "accept" ? "replacement" : undefined),
		});
		subject.handleInput("ignored");
		assert.equal(subject.snapshot().filter, "");
		subject.handleInput("accept");
		assert.equal(subject.snapshot().filter, "replacement");
	});
});

describe("fuzzyRanked stable partition", () => {
	it("preserves fuzzy ranking within literal and scattered partitions, without mutating items", () => {
		const items = [
			"anthropic/claude-sonnet",
			"anthropic/claude-opus",
			"local/opus",
			"other/o-p-u-s",
		];
		const original = [...items];
		const matches = fuzzyFilter(items, "opus", (item) => item);
		assert.deepEqual(
			fuzzyRanked(items, "opus", (item) => item),
			[
				...matches.filter((item) => item.includes("opus")),
				...matches.filter((item) => !item.includes("opus")),
			],
		);
		assert.deepEqual(items, original);
	});
	it("splits slash-delimited tokens and ignores surrounding whitespace", () => {
		const items = [
			"anthropic/claude-opus",
			"openai/gpt-4o",
			"anthropic/claude-sonnet",
		];
		assert.equal(
			fuzzyRanked(items, "  ANTH/OPUS  ", (item) => item)[0],
			"anthropic/claude-opus",
		);
		assert.deepEqual(
			fuzzyRanked(items, "   ", (item) => item),
			items,
		);
	});
});
