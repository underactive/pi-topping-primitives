import assert from "node:assert/strict";
import { test } from "node:test";
import type { ClassifierContext } from "@earendil-works/pi-ai";
import {
	boolAnswer,
	choiceAnswer,
	scoreAnswer,
} from "../src/classifier/answers.js";
import {
	failureReason,
	isProbability,
	looksLikeTimeout,
	runClassification,
} from "../src/classifier/classify.js";
import {
	clampCooldownSeconds,
	clampTimeoutMs,
	DEFAULT_CIRCUIT_BREAKER_COOLDOWN_SECONDS,
	DEFAULT_CLASSIFIER_TIMEOUT_MS,
	isPinnedClassifier,
	preferredClassifier,
} from "../src/classifier/config.js";
import { fakeRegistry, jevModel, okResult } from "./classifier-harness.js";

const context: ClassifierContext = {
	state: { ask: "classify this" },
	questions: {
		tier: {
			type: "choice",
			instructions: "pick one",
			criteria: { SIMPLE: "easy", MEDIUM: "routine" },
		},
	},
};

test("runClassification passes the deadline and signal through and maps a successful answer", async () => {
	const registry = fakeRegistry();
	const controller = new AbortController();
	const result = await runClassification(registry, jevModel, context, {
		signal: controller.signal,
		timeoutMs: 3000,
	});
	assert.deepEqual(registry.calls[0]?.options, {
		signal: controller.signal,
		timeoutMs: 3000,
		maxRetries: 0,
	});
	assert.deepEqual(registry.calls[0]?.context, context);
	assert.ok(result.ok);
	assert.deepEqual(Object.keys(result.answers), ["tier"]);
	assert.equal(result.cost, 0.00001);
	assert.equal(result.model, "typesafe/jev-latest");
});

test("runClassification reports unknown answers, errors, timeouts, and aborts", async () => {
	const errored = await runClassification(
		fakeRegistry({
			classify: async () =>
				okResult("MEDIUM", 0.9, {
					stopReason: "error",
					errorMessage: "System One API error: 500",
				}),
		}),
		jevModel,
		context,
		{ timeoutMs: 3000 },
	);
	assert.deepEqual(
		[errored.ok, !errored.ok && errored.kind, !errored.ok && errored.reason],
		[false, "error", "System One API error: 500"],
	);
	assert.equal(errored.cost, 0.00001);

	const timedOut = await runClassification(
		fakeRegistry({
			classify: async () =>
				okResult("MEDIUM", 0.9, {
					stopReason: "error",
					errorMessage: "request timed out after 3000ms",
				}),
		}),
		jevModel,
		context,
		{ timeoutMs: 3000 },
	);
	assert.deepEqual(
		[timedOut.ok, !timedOut.ok && timedOut.kind],
		[false, "timeout"],
	);

	let clock = 0;
	const slow = await runClassification(
		fakeRegistry({
			classify: async () => {
				clock += 3500;
				return okResult("MEDIUM", 0.9, {
					stopReason: "error",
					errorMessage: "boom",
				});
			},
		}),
		jevModel,
		context,
		{ timeoutMs: 3000, now: () => clock },
	);
	assert.deepEqual(
		[slow.ok, !slow.ok && slow.kind, !slow.ok && slow.latencyMs],
		[false, "timeout", 3500],
	);

	const aborted = await runClassification(
		fakeRegistry({
			classify: async () => okResult("MEDIUM", 0.9, { stopReason: "aborted" }),
		}),
		jevModel,
		context,
		{ timeoutMs: 3000 },
	);
	assert.deepEqual(
		[aborted.ok, !aborted.ok && aborted.kind],
		[false, "aborted"],
	);
	assert.equal(aborted.cost, 0);

	const thrown = await runClassification(
		fakeRegistry({
			classify: async () => {
				throw new Error("socket hang up");
			},
		}),
		jevModel,
		context,
		{ timeoutMs: 3000 },
	);
	assert.deepEqual(
		[thrown.ok, !thrown.ok && thrown.kind, !thrown.ok && thrown.reason],
		[false, "error", "socket hang up"],
	);
	assert.equal(thrown.cost, 0);
});

test("failureReason collapses whitespace and caps long messages, looksLikeTimeout matches deadline wording", () => {
	assert.equal(failureReason(undefined), "unknown error");
	assert.equal(failureReason("  a\n\nb  "), "a b");
	assert.equal(failureReason("x".repeat(500)), `${"x".repeat(199)}…`);
	assert.equal(looksLikeTimeout("Request timed out"), true);
	assert.equal(looksLikeTimeout("deadline exceeded"), true);
	assert.equal(looksLikeTimeout("500 from upstream"), false);
	assert.equal(isProbability(0), true);
	assert.equal(isProbability(1), true);
	assert.equal(isProbability(1.5), false);
	assert.equal(isProbability(Number.NaN), false);
	assert.equal(isProbability("0.5"), false);
});

test("answer readers accept well-formed answers and reject malformed or missing ones", () => {
	const answers = {
		verdict: {
			type: "choice",
			choice: "apply",
			confidence: 0.8,
			probabilities: { apply: 0.8, reject: 0.2 },
		},
		needsTests: { type: "bool", probability: 0.42 },
		effort: { type: "score", score: 3, confidence: 0.9 },
		badChoice: {
			type: "choice",
			choice: "apply",
			confidence: 1.5,
			probabilities: {},
		},
		emptyChoice: {
			type: "choice",
			choice: "",
			confidence: 0.5,
			probabilities: {},
		},
		badBool: { type: "bool", probability: Number.NaN },
		badScore: {
			type: "score",
			score: Number.POSITIVE_INFINITY,
			confidence: 0.5,
		},
		other: {
			type: "choice",
			choice: "apply",
			confidence: 0.5,
			probabilities: { apply: 2 },
		},
	} as const;
	assert.deepEqual(choiceAnswer(answers, "verdict"), {
		choice: "apply",
		confidence: 0.8,
		probabilities: { apply: 0.8, reject: 0.2 },
	});
	assert.equal(
		choiceAnswer(answers, "badChoice"),
		undefined,
		"confidence outside [0,1]",
	);
	assert.equal(choiceAnswer(answers, "emptyChoice"), undefined, "empty choice");
	assert.equal(choiceAnswer(answers, "missing"), undefined);
	assert.deepEqual(boolAnswer(answers, "needsTests"), { probability: 0.42 });
	assert.equal(boolAnswer(answers, "badBool"), undefined);
	assert.deepEqual(scoreAnswer(answers, "effort"), {
		score: 3,
		confidence: 0.9,
	});
	assert.equal(scoreAnswer(answers, "badScore"), undefined);
	assert.deepEqual(
		choiceAnswer(answers, "other")?.probabilities,
		{},
		"out-of-range probabilities are dropped",
	);
	assert.equal(
		choiceAnswer(answers, "verdict")?.choice,
		"apply",
		"re-exported from the module index",
	);
	assert.equal(boolAnswer(answers, "needsTests")?.probability, 0.42);
	assert.equal(scoreAnswer(answers, "effort")?.score, 3);
});

test("config clamps and pin detection treat auto and partial selections as unpinned", () => {
	assert.equal(clampTimeoutMs(2500.6), 2501);
	assert.equal(clampTimeoutMs(0), 1);
	assert.equal(clampTimeoutMs("nope"), DEFAULT_CLASSIFIER_TIMEOUT_MS);
	assert.equal(clampTimeoutMs(undefined, 1234), 1234);
	assert.equal(clampCooldownSeconds(30.4), 30);
	assert.equal(clampCooldownSeconds(-5), 0);
	assert.equal(
		clampCooldownSeconds("nope"),
		DEFAULT_CIRCUIT_BREAKER_COOLDOWN_SECONDS,
	);
	assert.equal(isPinnedClassifier({ provider: "auto", model: "auto" }), false);
	assert.equal(
		isPinnedClassifier({ provider: "openrouter", model: "typesafe/jev-1.13" }),
		true,
	);
	assert.equal(
		isPinnedClassifier({ provider: "openrouter" }),
		false,
		"a half pin cannot resolve",
	);
	assert.equal(isPinnedClassifier(undefined), false);
	assert.deepEqual(
		preferredClassifier({ provider: "openrouter", model: "typesafe/jev-1.13" }),
		{
			provider: "openrouter",
			model: "typesafe/jev-1.13",
		},
	);
	assert.equal(
		preferredClassifier({ provider: "auto", model: "auto" }),
		undefined,
	);
});
