import assert from "node:assert/strict";
import { test } from "node:test";
import {
	availableClassifiers,
	CircuitBreaker,
	JEV_MODELS,
	modelName,
	selectJevModel,
} from "../src/classifier/jev.js";
import { fakeRegistry, jevModel, otherModel } from "./classifier-harness.js";

test("JEV_MODELS lists pi's documented provider chain in order", () => {
	assert.deepEqual(
		JEV_MODELS.map((entry) => `${entry.provider}/${entry.id}`),
		[
			"typesafe/jev-latest",
			"openrouter/typesafe/jev-1.13",
			"cloudflare-workers-ai/typesafe/jev",
			"vercel-ai-gateway/typesafe-ai/jev",
			"opencode/jev-1.13",
		],
	);
	assert.equal(modelName(jevModel), "typesafe/jev-latest");
});

test("selectJevModel prefers the configured model, then the known list, skipping unconfigured providers", () => {
	const registry = fakeRegistry({
		configured: ["openrouter", "typesafe"],
		models: [...JEV_MODELS, { provider: "local", id: "jev-local" }],
	});
	assert.equal(selectJevModel(registry)?.provider, "typesafe");
	assert.equal(
		selectJevModel(
			fakeRegistry({ configured: ["openrouter"], models: [...JEV_MODELS] }),
		)?.id,
		"typesafe/jev-1.13",
	);
	assert.equal(
		selectJevModel(registry, { provider: "local", model: "jev-local" })
			?.provider,
		"typesafe",
		"unconfigured preferred model is skipped",
	);
	const local = fakeRegistry({
		configured: ["local"],
		models: [{ provider: "local", id: "jev-local" }],
	});
	assert.equal(
		selectJevModel(local, { provider: "local", model: "jev-local" })?.id,
		"jev-local",
	);
	assert.equal(selectJevModel(fakeRegistry({ configured: [] })), undefined);
});

test("availableClassifiers lists credentialed classifiers, known Jev models first, then the rest by name", () => {
	const models = [
		otherModel("zeta", "z"),
		otherModel("opencode", "jev-1.13"),
		otherModel("alpha", "a"),
		otherModel("typesafe", "jev-latest"),
		otherModel("nocreds", "x"),
	];
	const registry = fakeRegistry({ models });
	registry.getProviderAuthStatus = (provider: string) => ({
		configured: provider !== "nocreds",
	});
	assert.deepEqual(
		availableClassifiers(registry).map((model) => modelName(model)),
		["typesafe/jev-latest", "opencode/jev-1.13", "alpha/a", "zeta/z"],
	);
});

test("circuit breaker opens on timeouts, admits one probe after the cooldown, and closes on success", () => {
	let now = 0;
	const breaker = new CircuitBreaker(30_000, () => now);
	assert.equal(breaker.state(), "closed");
	assert.equal(breaker.allow(), true);
	breaker.recordTimeout();
	assert.equal(breaker.state(), "open");
	assert.equal(breaker.allow(), false);
	assert.equal(breaker.opens, 1);
	now = 29_999;
	assert.equal(breaker.allow(), false);
	now = 30_000;
	assert.equal(breaker.state(), "half-open");
	assert.equal(breaker.allow(), true, "one probe");
	assert.equal(breaker.allow(), false, "no second probe while probing");
	breaker.recordTimeout();
	assert.equal(breaker.state(), "open");
	assert.equal(breaker.opens, 2);
	now = 70_000;
	assert.equal(breaker.allow(), true);
	breaker.recordSuccess();
	assert.equal(breaker.state(), "closed");
	assert.equal(breaker.allow(), true);
	breaker.recordFailure();
	assert.equal(
		breaker.state(),
		"closed",
		"non-timeout failures never open a closed circuit",
	);
	breaker.recordTimeout();
	now = 100_000;
	assert.equal(breaker.allow(), true);
	breaker.recordFailure();
	assert.equal(breaker.state(), "open", "a failed probe restarts the cooldown");
	breaker.reset();
	assert.deepEqual([breaker.state(), breaker.opens], ["closed", 0]);
});

test("the cooldown can be a function of the current state, for a host that scales it", () => {
	let now = 0;
	let cooldown = 1_000;
	const breaker = new CircuitBreaker(
		() => cooldown,
		() => now,
	);
	breaker.recordTimeout();
	now = 999;
	assert.equal(breaker.allow(), false);
	now = 1_000;
	assert.equal(breaker.allow(), true);
	cooldown = 5_000;
	breaker.recordTimeout();
	now = 5_999;
	assert.equal(breaker.allow(), false);
	now = 6_000;
	assert.equal(breaker.allow(), true);
});
