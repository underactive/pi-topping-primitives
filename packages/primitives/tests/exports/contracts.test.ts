import assert from "node:assert/strict";
import { test } from "node:test";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import * as contractsNs from "@underactive/pi-topping-primitives/contracts";

const routedModel: contractsNs.RoutedModelAnnouncementV1 = {
	version: 1,
	provider: "anthropic",
	modelId: "claude-sonnet-4",
	model: "claude-sonnet-4",
	name: "Claude Sonnet 4",
	thinkingLevel: "high",
	reason: "user",
	cause: "explicit selection",
	ts: 123,
};

test("compiled contracts parse a version-1 routed-model announcement", () => {
	assert.deepEqual(contractsNs.parseRoutedModel(routedModel), {
		provider: "anthropic",
		modelId: "claude-sonnet-4",
		reason: "user",
		thinkingLevel: "high",
	});
});

test("compiled contracts emit and subscribe through pi's event bus", () => {
	const events = createEventBus();
	let received: contractsNs.ParsedRoutedModel | undefined;
	contractsNs.subscribe(events, contractsNs.CHANNELS.routedModel, (payload) => {
		received = payload;
	});
	contractsNs.emit(events, contractsNs.CHANNELS.routedModel, routedModel);
	assert.deepEqual(received, {
		provider: "anthropic",
		modelId: "claude-sonnet-4",
		reason: "user",
		thinkingLevel: "high",
	});
});

test("two compiled contract copies interoperate through one event bus", async () => {
	const events = createEventBus();
	let received: contractsNs.ParsedRoutedModel | undefined;
	contractsNs.subscribe(events, contractsNs.CHANNELS.routedModel, (payload) => {
		received = payload;
	});

	const secondCopy = (await import(
		new URL("../../dist/contracts/index.js?copy=2", import.meta.url).href
	)) as typeof contractsNs;
	assert.notStrictEqual(secondCopy.emit, contractsNs.emit);
	secondCopy.emit(events, secondCopy.CHANNELS.routedModel, routedModel);
	assert.deepEqual(received, {
		provider: "anthropic",
		modelId: "claude-sonnet-4",
		reason: "user",
		thinkingLevel: "high",
	});
});

test("compiled emit rejects a payload for the wrong channel at typecheck time", () => {
	const events = createEventBus();
	const wrongPayload = { embedded: true };
	// @ts-expect-error A routed-model channel cannot be emitted with an embed payload.
	contractsNs.emit(events, contractsNs.CHANNELS.routedModel, wrongPayload);
});
