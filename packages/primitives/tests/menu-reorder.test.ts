// Reorder rows, ported from pi-topping: grab, move, release, the published group value,
// group boundaries, and agreement between the scrolling window and the natural body.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MenuConfig } from "../src/menu/types.js";
import {
	fakeTui,
	KEY,
	makeMenu,
	plain,
	press,
	selectedLine,
	type Values,
} from "./menu-harness.js";

function reorderConfig(): Partial<MenuConfig<Values>> {
	return {
		sections: [
			{
				title: "S1",
				items: [{ kind: "toggle", id: "before", label: "Before", value: true }],
			},
			{
				title: "Order",
				items: ["one", "two", "three"].map((id) => ({
					kind: "reorder" as const,
					id,
					label: `Row ${id}`,
					group: "order",
				})),
			},
			{
				title: "S2",
				items: [{ kind: "toggle", id: "after", label: "After", value: true }],
			},
		],
	};
}

function rowOrder(lines: string[]): string[] {
	return lines.flatMap((line) => {
		const match = /Row (one|two|three)/.exec(line);
		return match?.[1] ? [match[1]] : [];
	});
}

test("reorder rows publish their group order and show the arrow affordance only while grabbed", async () => {
	const { menu, results } = makeMenu(reorderConfig());
	assert.ok(!plain(menu).some((line) => line.includes("↑ ↓")));
	assert.equal(menu.snapshot().values.order, "one,two,three");

	await press(menu, KEY.down, KEY.space);
	const grabbed = plain(menu).filter((line) => line.includes("↑ ↓"));
	assert.equal(grabbed.length, 1);
	assert.ok(grabbed[0]?.includes("Row one") && grabbed[0]?.includes("[■]"));

	await press(menu, KEY.down);
	assert.deepEqual(rowOrder(plain(menu)), ["two", "one", "three"]);
	assert.equal(menu.snapshot().values.order, "two,one,three");

	await press(menu, KEY.space);
	assert.ok(!plain(menu).some((line) => line.includes("↑ ↓")));
	// Enter on a reorder row grabs it, so apply from the row below the group.
	await press(menu, KEY.down, KEY.down, KEY.enter);
	assert.equal(results[0]?.values.order, "two,one,three");
	assert.ok(
		!("one" in (results[0]?.values ?? {})),
		"rows publish no per-row value",
	);
});

test("a grabbed row clamps at its group edges and cannot escape into neighbouring sections", async () => {
	const { menu } = makeMenu(reorderConfig());
	await press(menu, KEY.down, KEY.space);
	for (let index = 0; index < 5; index++) menu.handleInput(KEY.up);
	assert.deepEqual(rowOrder(plain(menu)), ["one", "two", "three"]);
	for (let index = 0; index < 5; index++) menu.handleInput(KEY.down);
	assert.deepEqual(rowOrder(plain(menu)), ["two", "three", "one"]);
	await press(menu, KEY.pageUp);
	assert.deepEqual(
		rowOrder(plain(menu)),
		["one", "two", "three"],
		"paging moves the grabbed row too",
	);
	await press(menu, KEY.space, KEY.down);
	assert.ok(
		selectedLine(menu).includes("Row two"),
		"the cursor stayed on the grabbed row",
	);
});

test("Enter grabs and releases like Space, and onChange does not fire on reorder moves", async () => {
	const seen: string[] = [];
	const { menu } = makeMenu({
		...reorderConfig(),
		onChange: (id) => {
			seen.push(id);
		},
	});
	await press(menu, KEY.down, KEY.enter, KEY.down, KEY.enter);
	assert.deepEqual(rowOrder(plain(menu)), ["two", "one", "three"]);
	assert.deepEqual(seen, []);
	assert.ok(!plain(menu).some((line) => line.includes("↑ ↓")));
});

test("reordering keeps the scrolling window and the natural-height body in sync, with spacers", async () => {
	const tui = fakeTui(40);
	const { menu } = makeMenu(
		{
			sections: [
				{
					title: "Order",
					items: [
						{ kind: "reorder", id: "one", label: "Row one", group: "order" },
						{ kind: "reorder", id: "two", label: "Row two", group: "order" },
						{
							kind: "reorder",
							id: "three",
							label: "Row three",
							group: "order",
							spacerBefore: true,
						},
					],
				},
				{
					title: "S2",
					items: [{ kind: "toggle", id: "after", label: "After", value: true }],
				},
			],
		},
		{ tui },
	);
	await press(menu, KEY.space, KEY.down);
	const natural = rowOrder(plain(menu));
	assert.deepEqual(natural, ["two", "one", "three"]);
	tui.terminal.rows = 10;
	menu.invalidate();
	const scrolled = rowOrder(plain(menu));
	assert.ok(
		scrolled.length > 0 && scrolled.length < natural.length,
		"the window must scroll",
	);
	assert.ok(scrolled.includes("one"), "the grabbed row stays in view");
	assert.ok(
		natural.join(",").includes(scrolled.join(",")),
		"the window is a contiguous slice of the natural order",
	);
});

test("a rebuild resets the grab and restores the sections' order", async () => {
	const { menu } = makeMenu({
		...reorderConfig(),
		onAction: () => reorderConfig().sections,
		sections: [
			...(reorderConfig().sections ?? []),
			{
				title: "Actions",
				items: [{ kind: "action", id: "refresh", label: "Refresh" }],
			},
		],
	});
	await press(menu, KEY.down, KEY.space, KEY.down);
	assert.equal(menu.snapshot().values.order, "two,one,three");
	await press(menu, KEY.space, KEY.down, KEY.down, KEY.down, KEY.enter);
	assert.deepEqual(rowOrder(plain(menu)), ["one", "two", "three"]);
	assert.equal(menu.snapshot().values.order, "one,two,three");
	assert.ok(!plain(menu).some((line) => line.includes("↑ ↓")));
});
