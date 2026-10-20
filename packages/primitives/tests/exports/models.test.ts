import assert from "node:assert/strict";
import { test } from "node:test";
import type { Api, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { ThinkingLevel as ActivityThinkingLevel } from "@underactive/pi-topping-primitives/activity-tui";
import * as models from "@underactive/pi-topping-primitives/models";

type Assert<T extends true> = T;
export type LevelUnionsAgree = [
	Assert<models.ThinkingLevel extends ModelThinkingLevel ? true : false>,
	Assert<ModelThinkingLevel extends models.ThinkingLevel ? true : false>,
	Assert<models.ThinkingLevel extends ActivityThinkingLevel ? true : false>,
	Assert<ActivityThinkingLevel extends models.ThinkingLevel ? true : false>,
];

test("compiled ./models builds a picker through the cached registry bridge", () => {
	const model: Model<Api> = {
		provider: "probe",
		id: "model",
		name: "Model",
		api: "openai-completions",
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8192,
		maxTokens: 1024,
	};
	const registry = { getAvailable: () => [model] };
	const picker = new models.TwoPaneModelThinking({
		theme: {
			fg: (_color, text) => text,
			bg: (_color, text) => text,
			bold: (text) => text,
		},
		refs: models.getModelCatalogue(registry).availableRefs(),
		levelOptions: models.registryLevelOptions(registry),
	});
	assert.ok(picker.render(60).some((line) => line.includes("probe/model")));
	assert.equal(picker.handleInput("\r"), "confirm");
	assert.deepEqual(picker.getSelected(), {
		ref: { provider: "probe", id: "model" },
		thinking: "off",
	});
	for (const table of [
		models.THINKING_LEVELS,
		models.COMMON_THINKING_LEVELS,
		models.MODEL_LIST_LAYOUT,
	])
		assert.ok(Object.isFrozen(table));
});
