// Ported from routesense test/menu.test.ts (rebuild, cursor, hidden and disabled cases)
// and pi-topping tests/menu.test.ts (Record labels, reorder groups), against the pure model.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildInitialValues,
	firstEnabledIndex,
	flattenSections,
	moveCursor,
	rebuildMenu,
	resolveCycleValueLabel,
} from "../src/menu/model.js";
import type { MenuSection } from "../src/menu/types.js";

test("flattenSections skips hidden rows and records each row's section index", () => {
	const sections: MenuSection[] = [
		{
			title: "S",
			items: [
				{ kind: "action", id: "header", label: "Header" },
				{
					kind: "text",
					id: "detail",
					label: "Detail",
					value: "kept",
					hidden: true,
				},
			],
		},
		{
			title: "T",
			items: [{ kind: "toggle", id: "next", label: "Next", value: true }],
		},
	];
	const flat = flattenSections(sections);
	assert.deepEqual(
		flat.map((row) => [row.id, row.sectionIndex]),
		[
			["header", 0],
			["next", 1],
		],
	);
});

test("buildInitialValues seeds numbers as numbers, gate ids as booleans and reorder groups as joined ids", () => {
	const sections: MenuSection[] = [
		{
			title: "S",
			items: [
				{ kind: "toggle", id: "on", label: "On", value: true },
				{
					kind: "number",
					id: "bound",
					label: "Bound",
					value: 80,
					min: 1,
					max: 100,
				},
				{
					kind: "cycle",
					id: "color",
					label: "Color",
					value: "accent",
					values: ["accent", "border"],
					gate: { id: "colorEnabled", enabled: false },
				},
				{
					kind: "cycle",
					id: "sep",
					label: "Sep",
					value: "thin",
					values: ["thin"],
					gate: { id: "sepEnabled" },
				},
				{ kind: "action", id: "go", label: "Go" },
				{
					kind: "text",
					id: "hidden",
					label: "Hidden",
					value: "kept",
					hidden: true,
				},
				{ kind: "pick", id: "model", label: "Model", value: "session" },
				{ kind: "reorder", id: "one", label: "One", group: "order" },
				{ kind: "reorder", id: "two", label: "Two", group: "order" },
			],
		},
	];
	const values = buildInitialValues({ sections });
	assert.deepEqual(values, {
		on: true,
		bound: 80,
		color: "accent",
		colorEnabled: false,
		sep: "thin",
		sepEnabled: true,
		hidden: "kept",
		model: "session",
		order: "one,two",
	});
	assert.equal(typeof values.bound, "number");
	assert.ok(!("go" in values), "action rows hold no value");
	assert.ok(!("one" in values), "reorder rows publish only their group");
});

test("resolveCycleValueLabel looks labels up by value and falls back to the raw value", () => {
	const item = { labels: { "openai-completions": "OpenAI Completions" } };
	assert.equal(
		resolveCycleValueLabel(item, "openai-completions"),
		"OpenAI Completions",
	);
	assert.equal(
		resolveCycleValueLabel(item, "anthropic-messages"),
		"anthropic-messages",
	);
	assert.equal(resolveCycleValueLabel({}, "a"), "a");
	assert.equal(resolveCycleValueLabel({ labels: {} }, "toString"), "toString");
});

test("firstEnabledIndex skips a disabled first row and reads 0 when every row is disabled", () => {
	const enabledSecond = flattenSections([
		{
			title: "S",
			items: [
				{ kind: "toggle", id: "a", label: "A", value: true, disabled: true },
				{ kind: "toggle", id: "b", label: "B", value: true },
			],
		},
	]);
	assert.equal(firstEnabledIndex(enabledSecond), 1);
	const allDisabled = flattenSections([
		{
			title: "S",
			items: [
				{ kind: "toggle", id: "a", label: "A", value: true, disabled: true },
			],
		},
	]);
	assert.equal(firstEnabledIndex(allDisabled), 0);
	assert.equal(firstEnabledIndex([]), 0);
});

test("moveCursor stops at the ends and skips statically disabled rows", () => {
	const flat = flattenSections([
		{
			title: "S",
			items: [
				{ kind: "toggle", id: "a", label: "A", value: true },
				{ kind: "toggle", id: "b", label: "B", value: true, disabled: true },
				{ kind: "toggle", id: "c", label: "C", value: true },
			],
		},
	]);
	assert.equal(moveCursor(flat, 0, 1), 2, "down from a skips disabled b");
	assert.equal(moveCursor(flat, 2, 1), 2, "down from the last row stays");
	assert.equal(moveCursor(flat, 0, -1), 0, "up from the first row stays");
	assert.equal(moveCursor(flat, 2, -1), 0);
	assert.equal(moveCursor([], 0, 1), 0);
});

test("moveCursor stays put when every row is disabled, and treats dependency gating as reachable", () => {
	const flat = flattenSections([
		{
			title: "S",
			items: [
				{ kind: "toggle", id: "a", label: "A", value: true, disabled: true },
				{ kind: "toggle", id: "b", label: "B", value: true, disabled: true },
			],
		},
	]);
	assert.equal(moveCursor(flat, 0, 1), 0);
	const gated = flattenSections([
		{
			title: "S",
			items: [
				{ kind: "toggle", id: "a", label: "A", value: true },
				{
					kind: "toggle",
					id: "b",
					label: "B",
					value: false,
					disabledUnlessAnyOf: ["a"],
				},
			],
		},
	]);
	assert.equal(
		moveCursor(gated, 0, 1),
		1,
		"a dependency-gated row can still be reached",
	);
});

test("rebuildMenu preserves the cursor by row id across a rebuild that shrinks the list", () => {
	const flat = flattenSections([
		{
			title: "S",
			items: ["a", "b", "c"].map((id) => ({
				kind: "toggle" as const,
				id,
				label: id,
				value: true,
			})),
		},
	]);
	const after: MenuSection[] = [
		{
			title: "S",
			items: [
				{ kind: "toggle", id: "x", label: "X", value: false },
				{ kind: "toggle", id: "c", label: "C", value: true },
			],
		},
	];
	const result = rebuildMenu(after, {
		flat,
		cursor: 2,
		values: {},
		scrollStart: 0,
	});
	assert.equal(result.flat[result.cursor]?.id, "c");
});

test("rebuildMenu clamps the cursor when the previous row id is gone and nudges off a disabled landing", () => {
	const flat = flattenSections([
		{
			title: "S",
			items: [
				{ kind: "toggle", id: "a", label: "A", value: true },
				{ kind: "toggle", id: "b", label: "B", value: true },
			],
		},
	]);
	const shrunk = rebuildMenu(
		[
			{
				title: "S",
				items: [{ kind: "toggle", id: "x", label: "X", value: true }],
			},
		],
		{ flat, cursor: 1, values: {}, scrollStart: 5 },
	);
	assert.equal(shrunk.cursor, 0);
	assert.equal(
		shrunk.scrollStart,
		0,
		"scrollStart is clamped to the new row count",
	);

	const nudged = rebuildMenu(
		[
			{
				title: "S",
				items: [
					{ kind: "toggle", id: "a", label: "A", value: true, disabled: true },
					{ kind: "toggle", id: "b", label: "B", value: true },
				],
			},
		],
		{ flat, cursor: 0, values: {}, scrollStart: 0 },
	);
	assert.equal(nudged.flat[nudged.cursor]?.id, "b");

	const empty = rebuildMenu([], {
		flat,
		cursor: 1,
		values: { a: true },
		scrollStart: 1,
	});
	assert.deepEqual(
		[empty.cursor, empty.scrollStart, empty.flat.length],
		[0, 0, 0],
	);
});

test("rebuildMenu keeps surviving drafts, drops removed keys and honours overwriteValues", () => {
	const before: MenuSection[] = [
		{
			title: "S",
			items: [
				{
					kind: "cycle",
					id: "client",
					label: "Client",
					value: "old",
					values: ["old", "new"],
				},
				{ kind: "text", id: "modelId", label: "Model", value: "old-model" },
				{
					kind: "cycle",
					id: "effort",
					label: "Effort",
					value: "low",
					values: ["low", "high"],
				},
				{ kind: "toggle", id: "gone", label: "Gone", value: true },
			],
		},
	];
	const after: MenuSection[] = [
		{
			title: "S",
			items: [
				{
					kind: "cycle",
					id: "client",
					label: "Client",
					value: "picked",
					values: ["old", "new", "picked"],
				},
				{ kind: "text", id: "modelId", label: "Model", value: "picked-model" },
				{
					kind: "cycle",
					id: "effort",
					label: "Effort",
					value: "medium",
					values: ["low", "medium", "high"],
				},
				{
					kind: "number",
					id: "fresh",
					label: "Fresh",
					value: 3,
					min: 0,
					max: 9,
				},
			],
		},
	];
	const previous = {
		flat: flattenSections(before),
		cursor: 0,
		values: {
			client: "draft",
			modelId: "draft-model",
			effort: "high",
			gone: false,
		},
		scrollStart: 0,
	};
	const result = rebuildMenu(after, previous, new Set(["client", "modelId"]));
	assert.deepEqual(result.values, {
		client: "picked",
		modelId: "picked-model",
		effort: "high",
		fresh: 3,
	});
	assert.ok(
		!("gone" in result.values),
		"a removed row cannot resurrect its value on apply",
	);
});

test("a draft edit made while a row was visible survives that row being hidden", () => {
	const visible: MenuSection[] = [
		{
			title: "S",
			items: [
				{ kind: "text", id: "detail", label: "Detail", value: "initial" },
			],
		},
	];
	const collapsed: MenuSection[] = [
		{
			title: "S",
			items: [
				{
					kind: "text",
					id: "detail",
					label: "Detail",
					value: "initial",
					hidden: true,
				},
			],
		},
	];
	const result = rebuildMenu(collapsed, {
		flat: flattenSections(visible),
		cursor: 0,
		values: { detail: "edited" },
		scrollStart: 0,
	});
	assert.equal(result.flat.length, 0);
	assert.equal(result.values.detail, "edited");
});

test("reorder groups survive a rebuild with the rebuilt sections' order, not a dragged one", () => {
	const rows = (ids: readonly string[]): MenuSection[] => [
		{
			title: "Order",
			items: ids.map((id) => ({
				kind: "reorder" as const,
				id,
				label: id,
				group: "order",
			})),
		},
	];
	const result = rebuildMenu(rows(["one", "two", "three"]), {
		flat: flattenSections(rows(["two", "one", "three"])),
		cursor: 0,
		values: { order: "two,one,three" },
		scrollStart: 0,
	});
	assert.equal(result.values.order, "one,two,three");
	assert.deepEqual(
		result.flat.map((row) => row.id),
		["one", "two", "three"],
	);

	const gateKept = rebuildMenu(
		[
			{
				title: "S",
				items: [
					{
						kind: "cycle",
						id: "c",
						label: "C",
						value: "a",
						values: ["a", "b"],
						gate: { id: "cOn", enabled: true },
					},
				],
			},
		],
		{ flat: [], cursor: 0, values: { c: "b", cOn: false }, scrollStart: 0 },
	);
	assert.deepEqual(
		gateKept.values,
		{ c: "b", cOn: false },
		"gate ids survive by key like any other value",
	);
});
