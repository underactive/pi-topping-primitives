import assert from "node:assert/strict";
import { test } from "node:test";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import {
	CHANNELS,
	type Channel,
	type ChannelPayloads,
	ENTRY_TYPES,
	type EntryPayloads,
	type EventBusLike,
	emit,
	type ParsedChannelPayloads,
	type ParsedRoutedModel,
	PI_VIRTUAL_MODEL_API,
	parseEmbeddedAnnouncement,
	parseRoutedModel,
	type RoutedModelAnnouncementV1,
	subscribe,
	WORKING_STATUS_SLIDE_MS,
} from "../src/contracts/index.js";

const routedModel: RoutedModelAnnouncementV1 = {
	version: 1,
	provider: "anthropic",
	modelId: "claude-sonnet-4",
	model: "claude-sonnet-4",
	name: "Claude Sonnet 4",
	thinkingLevel: "high",
	reason: "user",
	cause: "explicit selection",
	tier: "primary",
	toolSignal: "none",
	hold: "steady",
	ts: 123,
};

test("contract tables keep the permanent channel and entry names", () => {
	assert.deepEqual(CHANNELS, {
		routedModel: "pi-topping-routesense:routed-model",
		workingStatusEmbedded: "pi-topping-statusline:working-status-embedded",
	});
	assert.deepEqual(ENTRY_TYPES, {
		compactSavings: "pi-topping-compact/savings",
		compactCompactionSavings: "pi-topping-compact/compaction-savings",
		compactCompaction: "pi-topping-compact/compaction",
		browser: "pi-topping-web-tools/browser",
		splashLocalChanges: "pi-topping-splash:local-changes",
	});
	assert.equal(PI_VIRTUAL_MODEL_API, "pi-virtual");
	assert.equal(WORKING_STATUS_SLIDE_MS, 300);
	assert.ok(Object.isFrozen(CHANNELS));
	assert.ok(Object.isFrozen(ENTRY_TYPES));
});

test("retired wire names stay absent from the permanent name tables", () => {
	const names: readonly string[] = [
		...Object.values(CHANNELS),
		...Object.values(ENTRY_TYPES),
	];
	assert.ok(
		!names.includes("pi-topping-statusline:compaction-progress-embedded"),
	);
	assert.ok(!names.includes("pi-topping-compact:compaction-progress"));
	assert.ok(!names.includes("pi-prompt-cache/savings"));
});

test("parseRoutedModel returns only the sanitised stable fields", () => {
	assert.deepEqual(parseRoutedModel(routedModel), {
		provider: "anthropic",
		modelId: "claude-sonnet-4",
		reason: "user",
		thinkingLevel: "high",
	});
});

test("parseRoutedModel omits an absent or empty thinking level", () => {
	const withoutThinking = { ...routedModel };
	delete (withoutThinking as Partial<RoutedModelAnnouncementV1>).thinkingLevel;
	const emptyThinking = { ...routedModel, thinkingLevel: " \u200b\u0000 " };
	const expected: ParsedRoutedModel = {
		provider: "anthropic",
		modelId: "claude-sonnet-4",
		reason: "user",
	};

	assert.deepEqual(parseRoutedModel(withoutThinking), expected);
	assert.deepEqual(parseRoutedModel(emptyThinking), expected);
	assert.deepEqual(
		Object.keys(parseRoutedModel(withoutThinking) ?? {}).sort(),
		["modelId", "provider", "reason"],
	);
});

test("parseRoutedModel accepts each case-sensitive route reason", () => {
	for (const reason of ["user", "continuation", "retry", "direct"] as const) {
		assert.equal(parseRoutedModel({ ...routedModel, reason })?.reason, reason);
	}
});

test("parseRoutedModel strips control and format characters from text fields", () => {
	assert.deepEqual(
		parseRoutedModel({
			...routedModel,
			provider: "\u0000  anthro\u200bpic \u007f",
			modelId: " \u200dclaude-sonnet-4\u0009 ",
			reason: "\u000b retry\u200c ",
			thinkingLevel: "\u001f high\u2060 ",
		}),
		{
			provider: "anthropic",
			modelId: "claude-sonnet-4",
			reason: "retry",
			thinkingLevel: "high",
		},
	);
});

test("parseRoutedModel drops unrecognised and nested fields", () => {
	assert.deepEqual(
		parseRoutedModel({
			...routedModel,
			extra: { nested: "value" },
			nested: [1, 2],
		}),
		{
			provider: "anthropic",
			modelId: "claude-sonnet-4",
			reason: "user",
			thinkingLevel: "high",
		},
	);
});

test("parseRoutedModel rejects wrong versions and malformed inputs", () => {
	for (const data of [
		{ ...routedModel, version: 2 },
		{ ...routedModel, version: "1" },
		{ provider: "anthropic", modelId: "claude", reason: "user" },
		undefined,
		null,
		"payload",
		1,
		[],
		{},
		{ ...routedModel, provider: "" },
		{ ...routedModel, provider: "\u200b\u0000 " },
		{ ...routedModel, provider: 42 },
		{ ...routedModel, modelId: "" },
		{ ...routedModel, modelId: null },
		{ ...routedModel, reason: "" },
		{ ...routedModel, reason: "User" },
		{ ...routedModel, reason: "later" },
		{ ...routedModel, reason: false },
	]) {
		assert.equal(
			parseRoutedModel(data),
			undefined,
			`accepted ${JSON.stringify(data)}`,
		);
	}
});

test("parseEmbeddedAnnouncement accepts either boolean and discards extras", () => {
	assert.deepEqual(parseEmbeddedAnnouncement({ embedded: true }), {
		embedded: true,
	});
	assert.deepEqual(parseEmbeddedAnnouncement({ embedded: false }), {
		embedded: false,
	});
	assert.deepEqual(
		parseEmbeddedAnnouncement({ embedded: true, version: 2, extra: "ignored" }),
		{
			embedded: true,
		},
	);
});

test("parseEmbeddedAnnouncement rejects non-records and non-boolean values", () => {
	for (const data of [
		undefined,
		null,
		"true",
		[],
		{},
		{ embedded: "true" },
		{ embedded: 1 },
		{ embedded: null },
	]) {
		assert.equal(parseEmbeddedAnnouncement(data), undefined);
	}
});

test("emit forwards the exact payload object without copying", () => {
	let emitted: unknown;
	const events: EventBusLike = {
		emit(_channel, payload) {
			emitted = payload;
		},
		on() {
			return () => {};
		},
	};

	emit(events, CHANNELS.routedModel, routedModel);
	assert.strictEqual(emitted, routedModel);

	// @ts-expect-error A routed-model channel cannot be emitted with an embed payload.
	emit(events, CHANNELS.routedModel, { embedded: true });
});

test("subscribe parses on the real pi event bus, filters bad payloads and unsubscribes", () => {
	const events = createEventBus();
	const eventsMatchContract: EventBusLike = events;
	const received: ParsedRoutedModel[] = [];
	const unsubscribe = subscribe(
		eventsMatchContract,
		CHANNELS.routedModel,
		(payload) => {
			received.push(payload);
		},
	);

	emit(eventsMatchContract, CHANNELS.routedModel, routedModel);
	events.emit(CHANNELS.routedModel, { ...routedModel, version: 2 });
	events.emit("some-other-channel", routedModel);
	assert.deepEqual(received, [
		{
			provider: "anthropic",
			modelId: "claude-sonnet-4",
			reason: "user",
			thinkingLevel: "high",
		},
	]);

	unsubscribe();
	emit(eventsMatchContract, CHANNELS.routedModel, routedModel);
	assert.equal(received.length, 1);
});

test("subscribe allows independent subscribers on the same channel", () => {
	const events = createEventBus();
	const first: ParsedRoutedModel[] = [];
	const second: ParsedRoutedModel[] = [];
	subscribe(events, CHANNELS.routedModel, (payload) => first.push(payload));
	subscribe(events, CHANNELS.routedModel, (payload) => second.push(payload));
	emit(events, CHANNELS.routedModel, routedModel);
	assert.equal(first.length, 1);
	assert.equal(second.length, 1);
});

test("subscribe returns the handler's promise through the bus wrapper", async () => {
	let capturedHandler: ((data: unknown) => void) | undefined;
	const events: EventBusLike = {
		emit() {},
		on(_channel, handler) {
			capturedHandler = handler;
			return () => {};
		},
	};
	const expected = Promise.resolve();
	subscribe(events, CHANNELS.routedModel, () => expected);
	assert.ok(capturedHandler);
	const wrapper = capturedHandler as (data: unknown) => unknown;
	assert.strictEqual(wrapper(routedModel), expected);
});

test("payload maps have exactly the permanent name-table keys", () => {
	type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <
		Value,
	>() => Value extends Right ? 1 : 2
		? true
		: false;
	type Assert<Condition extends true> = Condition;
	type ChannelKeysMatch = Assert<Equal<keyof ChannelPayloads, Channel>>;
	type ParsedChannelKeysMatch = Assert<
		Equal<keyof ParsedChannelPayloads, Channel>
	>;
	type EntryKeysMatch = Assert<
		Equal<keyof EntryPayloads, (typeof ENTRY_TYPES)[keyof typeof ENTRY_TYPES]>
	>;

	const typeChecks: [ChannelKeysMatch, ParsedChannelKeysMatch, EntryKeysMatch] =
		[true, true, true];
	assert.deepEqual(typeChecks, [true, true, true]);
});
