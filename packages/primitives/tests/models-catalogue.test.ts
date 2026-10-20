import assert from "node:assert/strict";
import { test } from "node:test";
import {
	getModelCatalogue,
	registryLevelOptions,
	validateSavedChoice,
} from "../src/models/catalogue.js";
import type { ModelRef } from "../src/models/refs.js";
import { fakeRegistry } from "./models-harness.js";

function fixtures() {
	return fakeRegistry([
		{
			provider: "openai",
			id: "o5",
			reasoning: true,
			thinkingLevelMap: { minimal: null, xhigh: "xhigh", max: "max" },
		},
		{ provider: "local", id: "tinyllama" },
		{ provider: "anthropic", id: "claude-opus-4-6", reasoning: true },
	]);
}

test("getModelCatalogue returns sorted available refs", () => {
	assert.deepEqual(getModelCatalogue(fixtures()).availableRefs(), [
		{ provider: "anthropic", id: "claude-opus-4-6" },
		{ provider: "local", id: "tinyllama" },
		{ provider: "openai", id: "o5" },
	]);
});

test("getModelCatalogue uses registry reasoning and level maps in canonical order", () => {
	const catalogue = getModelCatalogue(fixtures());
	assert.deepEqual(
		catalogue.thinkingLevelsFor({
			provider: "anthropic",
			id: "claude-opus-4-6",
		}),
		["off", "minimal", "low", "medium", "high"],
	);
	assert.deepEqual(
		catalogue.thinkingLevelsFor({ provider: "openai", id: "o5" }),
		["off", "low", "medium", "high", "xhigh", "max"],
	);
	assert.deepEqual(
		catalogue.thinkingLevelsFor({ provider: "local", id: "tinyllama" }),
		["off"],
	);
});

test("getModelCatalogue deduplicates identical provider/id with first levels winning", () => {
	const catalogue = getModelCatalogue(
		fakeRegistry([
			{ provider: "p", id: "ns/id" },
			{ provider: "p", id: "ns/id", reasoning: true },
		]),
	);
	assert.deepEqual(catalogue.availableRefs(), [{ provider: "p", id: "ns/id" }]);
	assert.deepEqual(
		catalogue.thinkingLevelsFor({ provider: "p", id: "ns/id" }),
		["off"],
	);
});

test("getModelCatalogue copies result arrays and ref objects, not just the outer list", () => {
	const catalogue = getModelCatalogue(fixtures());
	const refs = catalogue.availableRefs();
	const first = refs[0];
	assert.ok(first);
	first.provider = "changed";
	first.id = "changed";
	refs.push({ provider: "extra", id: "extra" });
	const again = catalogue.availableRefs();
	assert.equal(again.length, 3);
	assert.deepEqual(again[0], { provider: "anthropic", id: "claude-opus-4-6" });
	assert.notEqual(refs, again);
	assert.notEqual(first, again[0]);
});

test("getModelCatalogue copies known and unknown level arrays", () => {
	const catalogue = getModelCatalogue(fixtures());
	const ref = { provider: "openai", id: "o5" };
	const levels = catalogue.thinkingLevelsFor(ref);
	levels.splice(0, levels.length, "minimal");
	assert.deepEqual(catalogue.thinkingLevelsFor(ref), [
		"off",
		"low",
		"medium",
		"high",
		"xhigh",
		"max",
	]);
	const missing = { provider: "unknown", id: "missing" };
	catalogue.thinkingLevelsFor(missing).push("high");
	assert.deepEqual(catalogue.thinkingLevelsFor(missing), []);
});

test("getModelCatalogue builds once per registry object and caches by identity", () => {
	const registry = fixtures();
	const catalogue = getModelCatalogue(registry);
	assert.equal(getModelCatalogue(registry), catalogue);
	assert.equal(getModelCatalogue(registry), catalogue);
	assert.equal(registry.calls.available, 1);
	const other = fixtures();
	assert.notEqual(getModelCatalogue(other), catalogue);
	assert.equal(other.calls.available, 1);
});

test("getModelCatalogue snapshots registry data instead of retaining model aliases", () => {
	const model = fakeRegistry([
		{ provider: "p", id: "id", reasoning: true },
	]).getAvailable()[0];
	assert.ok(model);
	const registry = { getAvailable: () => [model] };
	const catalogue = getModelCatalogue(registry);
	model.provider = "changed";
	model.reasoning = false;
	assert.deepEqual(catalogue.availableRefs(), [{ provider: "p", id: "id" }]);
	assert.deepEqual(catalogue.thinkingLevelsFor({ provider: "p", id: "id" }), [
		"off",
		"minimal",
		"low",
		"medium",
		"high",
	]);
});

test("getModelCatalogue returns no levels for an unknown ref", () => {
	assert.deepEqual(
		getModelCatalogue(fixtures()).thinkingLevelsFor({
			provider: "nope",
			id: "missing",
		}),
		[],
	);
});

function savedFixtures() {
	return {
		live: {
			ref: { provider: "provider-a", id: "model-1" },
			thinking: "medium",
			hostData: 42,
		},
		available: [
			{ provider: "provider-a", id: "model-1" },
			{ provider: "provider-b", id: "model-2" },
		],
	};
}

test("validateSavedChoice preserves an exact choice and its generic host fields", () => {
	const { live, available } = savedFixtures();
	const result = validateSavedChoice(live, available);
	assert.deepEqual(result, { choice: live });
	assert.equal(result.choice, live);
	assert.equal(result.choice?.hostData, 42);
});

test("validateSavedChoice drops a retired ref without an undefined choice key", () => {
	const { available } = savedFixtures();
	const result = validateSavedChoice(
		{ ref: { provider: "gone", id: "retired" }, thinking: "high" },
		available,
	);
	assert.deepEqual(result, { dropped: "gone/retired" });
	assert.equal("choice" in result, false);
});

test("validateSavedChoice returns an empty object for no saved choice", () => {
	assert.deepEqual(
		validateSavedChoice(undefined, savedFixtures().available),
		{},
	);
});

test("validateSavedChoice preserves choices when the catalogue is empty", () => {
	const { live } = savedFixtures();
	assert.deepEqual(validateSavedChoice(live, []), { choice: live });
});

test("validateSavedChoice does not fall back to a bare id under another provider", () => {
	assert.deepEqual(
		validateSavedChoice(
			{ ref: { provider: "openai-codex", id: "gpt-5.4" }, thinking: "max" },
			[{ provider: "other-provider", id: "gpt-5.4" }],
		),
		{ dropped: "openai-codex/gpt-5.4" },
	);
});

test("registryLevelOptions bridges cached levels without fallback by default", () => {
	const registry = fixtures();
	const options = registryLevelOptions(registry);
	assert.deepEqual(options({ provider: "local", id: "tinyllama" }), ["off"]);
	assert.deepEqual(options({ provider: "nope", id: "missing" }), []);
	registryLevelOptions(registry);
	assert.equal(registry.calls.available, 1);
});

test("registryLevelOptions applies copied fallback on unknown and known empty levels", () => {
	const registry = fakeRegistry([
		{
			provider: "p",
			id: "no-levels",
			reasoning: true,
			thinkingLevelMap: {
				off: null,
				minimal: null,
				low: null,
				medium: null,
				high: null,
				xhigh: null,
				max: null,
			},
		},
	]);
	const fallback = Object.freeze(["off", "low", "medium", "high"] as const);
	const options = registryLevelOptions(registry, { fallback });
	for (const ref of [
		{ provider: "p", id: "no-levels" },
		{ provider: "nope", id: "missing" },
	] satisfies ModelRef[]) {
		assert.deepEqual(options(ref), fallback);
		options(ref).push("max");
		assert.deepEqual(options(ref), fallback);
	}
	assert.deepEqual(
		registryLevelOptions(registry)({ provider: "p", id: "no-levels" }),
		[],
	);
});
