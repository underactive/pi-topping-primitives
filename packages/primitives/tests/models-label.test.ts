import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";

import {
	MODEL_LIST_LAYOUT,
	modelThinkingPaneWidths,
	smartTruncateModelLabel,
} from "../src/models/label.js";

test("smartTruncateModelLabel keeps last segment, first segment, and collapses skipped runs", () => {
	const result = smartTruncateModelLabel(
		"openai/accounts/org-1/models/gpt-4o-mini",
		20,
	);
	assert.ok(
		result.endsWith("gpt-4o-mini"),
		`last segment should survive, got: ${result}`,
	);
	assert.ok(
		result.startsWith("openai/"),
		`first segment should be kept, got: ${result}`,
	);
	const ellipsisCount = (result.match(/\u2026/g) ?? []).length;
	assert.equal(
		ellipsisCount,
		1,
		`expected exactly 1 ellipsis, got ${ellipsisCount}: ${result}`,
	);
	assert.ok(
		visibleWidth(result) <= 20,
		`expected width <= 20, got ${visibleWidth(result)}: ${result}`,
	);
});

test("smartTruncateModelLabel falls back to skeleton when even minimal segments don't fit", () => {
	const result = smartTruncateModelLabel(
		"openai/accounts/org-1/models/gpt-4o-mini",
		10,
	);
	assert.ok(
		result.startsWith("\u2026/"),
		`expected skeleton prefix, got: ${result}`,
	);
	const suffix = result.slice("\u2026/".length);
	assert.ok(
		suffix.length < "gpt-4o-mini".length,
		`expected model name truncated, got suffix: ${suffix}`,
	);
	assert.ok(
		visibleWidth(result) <= 10,
		`expected width <= 10, got ${visibleWidth(result)}: ${result}`,
	);
});

test("smartTruncateModelLabel returns already-fitting input unchanged", () => {
	const input = "anthropic/claude-opus-4-6";
	assert.equal(smartTruncateModelLabel(input, 40), input);
});

test("smartTruncateModelLabel returns exact-fit input unchanged with no ellipsis", () => {
	const input = "anthropic/claude-opus-4-6";
	const result = smartTruncateModelLabel(input, visibleWidth(input));
	assert.equal(result, input);
	assert.ok(!result.includes("\u2026"));
});

test("smartTruncateModelLabel falls back to plain end-truncation for single-segment labels", () => {
	const result = smartTruncateModelLabel(
		"tinyllama-extremely-long-model-name",
		10,
	);
	assert.ok(
		result.endsWith("\u2026"),
		`expected end-truncation ellipsis, got: ${result}`,
	);
	assert.ok(
		visibleWidth(result) <= 10,
		`expected width <= 10, got ${visibleWidth(result)}: ${result}`,
	);
});

test("smartTruncateModelLabel strips ANSI codes on hard-truncation paths", () => {
	const ansiName = "\x1b[31mgpt-4o-mini\x1b[39m";
	const input = `openai/accounts/org-1/models/${ansiName}`;
	const result = smartTruncateModelLabel(input, 10);
	// biome-ignore lint/suspicious/noControlCharactersInRegex: asserting stripped SGR escapes
	assert.doesNotMatch(result, /\x1b\[[0-9;]*m/);
	assert.ok(
		visibleWidth(result) <= 10,
		`expected width <= 10, got ${visibleWidth(result)}: ${result}`,
	);
});

test("MODEL_LIST_LAYOUT is frozen and delegates to smart truncation", () => {
	assert.ok(Object.isFrozen(MODEL_LIST_LAYOUT));
	const text = "openai/accounts/org-1/models/gpt-4o-mini";
	assert.equal(
		MODEL_LIST_LAYOUT.truncatePrimary?.({
			text,
			maxWidth: 20,
			columnWidth: 20,
			item: { label: text, value: text },
			isSelected: false,
		}),
		smartTruncateModelLabel(text, 20),
	);
});

test("modelThinkingPaneWidths preserves persona-audit's default allocation", () => {
	assert.deepEqual(modelThinkingPaneWidths(60), { left: 47, right: 12 });
	assert.deepEqual(modelThinkingPaneWidths(3), { left: 1, right: 1 });
});

test("modelThinkingPaneWidths sums exactly for widths 3..200 with long level labels", () => {
	for (let width = 3; width <= 200; width++) {
		for (const options of [
			undefined,
			{ levelWidthLabels: ["off", "an-extremely-long-thinking-level"] },
			{
				levelWidthLabels: [],
				levelPaneTitle: "Reasoning effort",
				marker: "❯ ",
			},
		]) {
			const { left, right } = modelThinkingPaneWidths(width, options);
			assert.ok(left >= 1 && right >= 1);
			assert.equal(left + right + 1, width);
		}
	}
});

test("modelThinkingPaneWidths measures custom title, marker and labels by visible width", () => {
	assert.equal(
		modelThinkingPaneWidths(100, {
			levelWidthLabels: ["off"],
			levelPaneTitle: "Reasoning effort",
		}).right,
		17,
	);
	assert.equal(
		modelThinkingPaneWidths(100, {
			levelWidthLabels: ["wide"],
			levelPaneTitle: "",
			marker: "--> ",
		}).right,
		11,
	);
	assert.equal(
		modelThinkingPaneWidths(100, {
			levelWidthLabels: ["\x1b[31m界界界\x1b[0m"],
			levelPaneTitle: "",
		}).right,
		11,
	);
});
