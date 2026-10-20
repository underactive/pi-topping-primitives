import assert from "node:assert/strict";
import { test } from "node:test";
import type { ThinkingLevel } from "../src/models/refs.js";
import {
	defaultThinkingForModel,
	thinkingOptionsForModel,
} from "../src/models/thinking.js";

test("thinkingOptionsForModel filters unknown strings and duplicates into canonical order", () => {
	assert.deepEqual(
		thinkingOptionsForModel([
			"high",
			"unknown",
			"off",
			"medium",
			"high",
			"max",
			"xhigh",
		]),
		["off", "medium", "high", "xhigh", "max"],
	);
	assert.deepEqual(thinkingOptionsForModel([]), []);
	assert.deepEqual(thinkingOptionsForModel(undefined), []);
});

test("thinkingOptionsForModel falls back on undefined, empty, and unknown-only input", () => {
	const fallback = Object.freeze(["high", "off"] as const);
	for (const input of [undefined, [], ["unknown"]]) {
		const result = thinkingOptionsForModel(input, { fallback });
		assert.deepEqual(result, fallback);
		assert.notEqual(result, fallback);
		result.push("medium");
		assert.deepEqual(fallback, ["high", "off"]);
	}
});

test("thinkingOptionsForModel ignores fallback for non-empty supported input without mutation", () => {
	const levels = Object.freeze(["high", "off"]);
	assert.deepEqual(thinkingOptionsForModel(levels, { fallback: ["medium"] }), [
		"off",
		"high",
	]);
	assert.deepEqual(levels, ["high", "off"]);
});

test("defaultThinkingForModel prefers an offered saved override", () => {
	assert.equal(
		defaultThinkingForModel("p/id", { "p/id": "xhigh" }, "low", [
			"low",
			"medium",
			"xhigh",
		]),
		"xhigh",
	);
});

test("defaultThinkingForModel skips stale overrides and then prefers the current level", () => {
	const overrides: Readonly<Record<string, ThinkingLevel>> = Object.freeze({
		"p/id": "max",
	});
	assert.equal(
		defaultThinkingForModel("p/id", overrides, "low", [
			"low",
			"medium",
			"high",
		]),
		"low",
	);
	assert.equal(
		defaultThinkingForModel("other/id", overrides, "high", [
			"low",
			"medium",
			"high",
		]),
		"high",
	);
});

test("defaultThinkingForModel prefers medium when saved and current are unavailable", () => {
	assert.equal(
		defaultThinkingForModel("p/id", {}, "off", ["high", "medium", "low"]),
		"medium",
	);
});

test("defaultThinkingForModel picks the first canonical level if medium is unavailable", () => {
	assert.equal(
		defaultThinkingForModel("p/id", {}, "off", ["high", "low"]),
		"low",
	);
});

test("defaultThinkingForModel returns medium when no supported options remain", () => {
	for (const input of [[], undefined, ["unknown"]])
		assert.equal(
			defaultThinkingForModel("p/id", { "p/id": "max" }, "high", input),
			"medium",
		);
});
