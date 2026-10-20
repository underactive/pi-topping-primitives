import assert from "node:assert/strict";
import { test } from "node:test";
// Source-level type oracle; the compiled-entry oracle is tests/exports/models.test.ts.
import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { ThinkingLevel as ActivityThinkingLevel } from "../src/activity-tui/thinking.js";
import type { ThinkingLevel } from "../src/models/refs.js";
import {
	COMMON_THINKING_LEVELS,
	composeModelKey,
	isModelRef,
	isThinkingLevel,
	modelRefLabel,
	parseModelKey,
	parseRef,
	shortModelName,
	THINKING_LEVELS,
} from "../src/models/refs.js";

type Assert<T extends true> = T;
export type LevelUnionsAgree = [
	Assert<ThinkingLevel extends ModelThinkingLevel ? true : false>,
	Assert<ModelThinkingLevel extends ThinkingLevel ? true : false>,
	Assert<ThinkingLevel extends ActivityThinkingLevel ? true : false>,
	Assert<ActivityThinkingLevel extends ThinkingLevel ? true : false>,
];

test("THINKING_LEVELS and COMMON_THINKING_LEVELS are frozen canonical tables", () => {
	assert.deepEqual(THINKING_LEVELS, [
		"off",
		"minimal",
		"low",
		"medium",
		"high",
		"xhigh",
		"max",
	]);
	assert.deepEqual(COMMON_THINKING_LEVELS, ["off", "low", "medium", "high"]);
	assert.ok(Object.isFrozen(THINKING_LEVELS));
	assert.ok(Object.isFrozen(COMMON_THINKING_LEVELS));
});

test("isThinkingLevel accepts only canonical strings, including distinct extended levels", () => {
	for (const level of THINKING_LEVELS)
		assert.equal(isThinkingLevel(level), true);
	for (const value of [
		undefined,
		null,
		0,
		true,
		{},
		[],
		["off"],
		"",
		"HIGH",
		"unset",
	])
		assert.equal(isThinkingLevel(value), false);
});

test("isModelRef rejects empty or non-string fields and ignores extra keys", () => {
	for (const value of [
		null,
		undefined,
		false,
		"p/id",
		{},
		{ provider: "p" },
		{ provider: "", id: "id" },
		{ provider: "p", id: "" },
		{ provider: 1, id: "id" },
		{ provider: "p", id: 1 },
	])
		assert.equal(isModelRef(value), false);
	assert.equal(isModelRef({ provider: "p", id: "id", extra: 1 }), true);
});

test("parseRef splits the first slash, accepts no slash, and preserves empty input", () => {
	assert.deepEqual(parseRef("p/ns/id"), { provider: "p", id: "ns/id" });
	assert.deepEqual(parseRef("p"), { provider: "p", id: "" });
	assert.deepEqual(parseRef(""), { provider: "", id: "" });
	const ref = { provider: "p", id: "ns/id" };
	assert.deepEqual(parseRef(modelRefLabel(ref)), ref);
});

test("parseModelKey prefers slash when both separators are present", () => {
	assert.deepEqual(parseModelKey("provider:model/variant"), {
		provider: "provider:model",
		id: "variant",
	});
});

test("parseModelKey falls back to colon when slash is absent", () => {
	assert.deepEqual(parseModelKey("provider:model"), {
		provider: "provider",
		id: "model",
	});
});

test("parseModelKey rejects a missing provider separator", () => {
	for (const key of ["/model", ":model", "", "provider", "/model:variant"])
		assert.equal(parseModelKey(key), undefined);
});

test("composeModelKey emits canonical provider/id", () => {
	assert.equal(composeModelKey("provider", "model"), "provider/model");
});

test("parseModelKey preserves slashes inside model ids", () => {
	assert.deepEqual(parseModelKey("openrouter/anthropic/claude-sonnet-4"), {
		provider: "openrouter",
		id: "anthropic/claude-sonnet-4",
	});
});

test("parseModelKey round-trips namespaced ids", () => {
	assert.deepEqual(
		parseModelKey(composeModelKey("openrouter", "anthropic/claude-sonnet-4")),
		{
			provider: "openrouter",
			id: "anthropic/claude-sonnet-4",
		},
	);
});

test("parseModelKey retains sensei's trailing-separator acceptance", () => {
	assert.deepEqual(parseModelKey("provider/"), {
		provider: "provider",
		id: "",
	});
	assert.deepEqual(parseModelKey("provider:"), {
		provider: "provider",
		id: "",
	});
	assert.equal(isModelRef(parseModelKey("provider/")), false);
});

test("shortModelName retains origin family, namespace, version and attribute behavior", () => {
	const examples = [
		["claude-opus-4-6", "opus"],
		["Claude-Sonnet-4", "sonnet"],
		["claude-haiku-4-5", "haiku"],
		["deepseek-v4-pro", "deepseek"],
		["accounts/models/Gemini-2.5-flash", "gemini"],
		["qwen3-coder", "qwen"],
		["deep-seek-r1-k2-instruct", "deep-seek"],
		["mini", "mini"],
		["", ""],
	] as const;
	for (const [id, expected] of examples)
		assert.equal(shortModelName({ provider: "unused", id }), expected, id);
});
