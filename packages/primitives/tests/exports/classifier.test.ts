import assert from "node:assert/strict";
import { test } from "node:test";
import type {
	ClassifierApi,
	ClassifierModel,
	ClassifierResult,
} from "@earendil-works/pi-ai";
import * as classifier from "@underactive/pi-topping-primitives/classifier";

test("compiled ./classifier exposes the frozen model chain and the auto sentinel", () => {
	assert.equal(classifier.AUTO_CLASSIFIER, "auto");
	assert.equal(classifier.DEFAULT_CLASSIFIER_TIMEOUT_MS, 3000);
	assert.equal(classifier.DEFAULT_CIRCUIT_BREAKER_COOLDOWN_SECONDS, 30);
	assert.ok(Object.isFrozen(classifier.JEV_MODELS));
	assert.equal(classifier.JEV_MODELS[0]?.provider, "typesafe");
	assert.equal(
		classifier.modelName({ provider: "typesafe", id: "jev-latest" }),
		"typesafe/jev-latest",
	);
});

test("compiled ./classifier selects a credentialed model and builds picker options", () => {
	const model: ClassifierModel<ClassifierApi> = {
		type: "classifier",
		id: "jev-latest",
		name: "Jev",
		api: "typesafe-system-one",
		provider: "typesafe",
		baseUrl: "https://api.typesafe.ai/v1/",
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 64_000,
	};
	const registry = {
		findOfType: (_type: "classifier", provider: string, id: string) =>
			provider === "typesafe" && id === "jev-latest" ? model : undefined,
		getProviderAuthStatus: () => ({ configured: true, source: "environment" }),
	};
	assert.equal(classifier.selectJevModel(registry)?.id, "jev-latest");
	assert.equal(
		classifier.selectJevModel({
			...registry,
			getProviderAuthStatus: () => ({ configured: false }),
		}),
		undefined,
	);

	const options = classifier.classifierPickerOptions(
		[model],
		"typesafe/jev-latest",
		"gone/model",
	);
	assert.deepEqual(
		options.map((option) => option.value),
		["auto", "typesafe/jev-latest", "gone/model"],
	);
	assert.equal(options[2]?.description, "unavailable");
});

test("compiled ./classifier opens its circuit on a timeout and admits one probe after the cooldown", () => {
	let now = 0;
	const breaker = new classifier.CircuitBreaker(30_000, () => now);
	assert.equal(breaker.state(), "closed");
	breaker.recordTimeout();
	assert.equal(breaker.allow(), false);
	now = 30_000;
	assert.equal(breaker.allow(), true);
	assert.equal(breaker.allow(), false);
	breaker.recordSuccess();
	assert.equal(breaker.state(), "closed");
});

test("compiled ./classifier normalizes a stopped result and reads its answers", async () => {
	const registry = {
		classify: async (): Promise<ClassifierResult> => ({
			api: "typesafe-system-one",
			provider: "typesafe",
			model: "jev-1.13.0",
			answers: {
				verdict: {
					type: "choice",
					choice: "apply",
					confidence: 0.8,
					probabilities: { apply: 0.8, reject: 0.2 },
				},
				needsTests: { type: "bool", probability: 0.42 },
			},
			stopReason: "stop",
			timestamp: 1,
		}),
	};
	const model = {
		provider: "typesafe",
		id: "jev-latest",
	} as ClassifierModel<ClassifierApi>;
	const outcome = await classifier.runClassification(
		registry,
		model,
		{ state: {}, questions: {} },
		{ timeoutMs: 3000 },
	);
	assert.ok(outcome.ok);
	if (!outcome.ok) return;
	assert.equal(
		classifier.choiceAnswer(outcome.answers, "verdict")?.choice,
		"apply",
	);
	assert.equal(
		classifier.boolAnswer(outcome.answers, "needsTests")?.probability,
		0.42,
	);
	assert.equal(classifier.choiceAnswer(outcome.answers, "missing"), undefined);
});
