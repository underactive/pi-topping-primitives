// Navigation, toggles, gates, text editing and the Enter/Escape rules. Ported from
// pi-topping (arrow clamp, screenful paging, gates, disabledUnlessAnyOf), routesense
// (text editing, onChange rebuilds, hidden rows) and statusline (editing semantics).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MenuSection } from "../src/menu/types.js";
import {
	fakeTui,
	KEY,
	lineWith,
	makeMenu,
	plain,
	press,
	selectedLine,
	type,
	type Values,
} from "./menu-harness.js";

test("up and down stop at the first and last rows", async () => {
	const { menu } = makeMenu();
	assert.ok(selectedLine(menu).includes("Item A"));
	await press(menu, KEY.up);
	assert.ok(selectedLine(menu).includes("Item A"));
	await press(menu, KEY.down, KEY.down);
	assert.ok(selectedLine(menu).includes("Item C"));
	await press(menu, KEY.down);
	assert.ok(selectedLine(menu).includes("Item C"));
	assert.ok(plain(menu).at(-1)?.includes("[ 3/3 ]"));
});

test("cycle rows wrap in both directions and space does not toggle them", async () => {
	const { menu, results } = makeMenu({
		sections: [
			{
				title: "S",
				items: [
					{
						kind: "cycle",
						id: "color",
						label: "Color",
						value: "accent",
						values: ["accent", "border", "both"],
					},
					{ kind: "toggle", id: "enabled", label: "Enabled", value: true },
				],
			},
		],
	});
	await press(menu, KEY.right);
	assert.ok(lineWith(menu, "Color").includes("‹ border ›"));
	await press(menu, KEY.space);
	assert.ok(lineWith(menu, "Color").includes("‹ border ›"));
	await press(menu, KEY.left, KEY.left);
	assert.ok(
		lineWith(menu, "Color").includes("‹ both ›"),
		"left past the first value wraps to the last",
	);
	await press(menu, KEY.right);
	assert.ok(
		lineWith(menu, "Color").includes("‹ accent ›"),
		"right past the last value wraps to the first",
	);
	await press(menu, KEY.down, KEY.space, KEY.enter);
	assert.deepEqual(results[0]?.values, { color: "accent", enabled: false });
});

test("cycle labels change what renders, not what is published", async () => {
	const { menu, results } = makeMenu({
		sections: [
			{
				title: "S",
				items: [
					{
						kind: "cycle",
						id: "color",
						label: "Color",
						value: "default",
						values: ["default", "accent"],
						labels: { default: "thinkingLevel" },
					},
				],
			},
		],
	});
	assert.ok(lineWith(menu, "Color").includes("‹ thinkingLevel ›"));
	assert.ok(!plain(menu).some((line) => line.includes("‹ default ›")));
	await press(menu, KEY.right);
	assert.ok(lineWith(menu, "Color").includes("‹ accent ›"));
	await press(menu, KEY.left, KEY.enter);
	assert.equal(results[0]?.values.color, "default");
});

function manyRows(
	count: number,
	disabled: readonly number[] = [],
): MenuSection[] {
	return [
		{
			title: "Many",
			items: Array.from({ length: count }, (_, index) => ({
				kind: "toggle" as const,
				id: `item-${index}`,
				label: `Item ${index}`,
				value: true,
				disabled: disabled.includes(index),
			})),
		},
	];
}

function selectedIndex(menu: ReturnType<typeof makeMenu>["menu"]): number {
	return Number.parseInt(
		/Item (\d+)/.exec(selectedLine(menu))?.[1] ?? "-1",
		10,
	);
}

test("page keys move one visible screenful and stop at the ends", async () => {
	const tui = fakeTui(15);
	const { menu } = makeMenu({ sections: manyRows(20) }, { tui });
	const visibleRows = plain(menu).filter((line) =>
		/Item \d+/.test(line),
	).length;
	assert.ok(visibleRows > 1 && visibleRows < 20, "the fixture must scroll");
	await press(menu, KEY.pageUp);
	assert.equal(selectedIndex(menu), 0);
	await press(menu, KEY.pageDown);
	assert.equal(
		selectedIndex(menu),
		visibleRows,
		"one page is one screenful of rows",
	);
	await press(menu, KEY.pageDown, KEY.pageDown, KEY.pageDown);
	assert.equal(selectedIndex(menu), 19);
	await press(menu, KEY.pageUp);
	assert.equal(selectedIndex(menu), 19 - visibleRows);
});

test("paging lands on the nearest enabled row when the target is disabled", async () => {
	const fresh = makeMenu({ sections: manyRows(25) });
	fresh.menu.handleInput(KEY.pageDown);
	assert.equal(
		fresh.menu.snapshot().cursorId,
		"item-10",
		"before any render a page is ten rows",
	);

	const probe = makeMenu({ sections: manyRows(25) }, { tui: fakeTui(20) });
	const page = plain(probe.menu).filter((line) => /Item \d+/.test(line)).length;
	assert.ok(page > 1 && page < 25);
	const { menu } = makeMenu(
		{ sections: manyRows(25, [page, page + 1]) },
		{ tui: fakeTui(20) },
	);
	menu.render(64);
	await press(menu, KEY.pageDown);
	assert.equal(
		selectedIndex(menu),
		page + 2,
		"the landing row is disabled, so the page lands on the next enabled one",
	);
	await press(menu, KEY.pageDown, KEY.pageDown, KEY.pageDown);
	assert.equal(selectedIndex(menu), 24, "stops at the last row");
	await press(menu, KEY.pageUp);
	assert.equal(selectedIndex(menu), 24 - page);
	for (let index = 0; index < 5; index++) await press(menu, KEY.pageUp);
	assert.equal(selectedIndex(menu), 0);

	const natural = makeMenu({ sections: manyRows(5) });
	natural.menu.render(64);
	await press(natural.menu, KEY.pageDown);
	assert.equal(
		selectedIndex(natural.menu),
		4,
		"once everything fits, a page is the whole list",
	);
});

test("space toggles the selected row and fires onChange with the new value", async () => {
	const seen: string[] = [];
	const { menu } = makeMenu({
		onChange: (id, values) => {
			seen.push(`${id}=${String(values[id])}`);
		},
	});
	assert.ok(lineWith(menu, "Item A").includes("ON"));
	await press(menu, KEY.space);
	assert.ok(lineWith(menu, "Item A").includes("OFF"));
	assert.deepEqual(seen, ["a=false"]);
});

test("a gated cycle row: space unchecks to the disabled value, blocks arrows, and re-checking restores them", async () => {
	const { menu, results } = makeMenu({
		sections: [
			{
				title: "S",
				items: [
					{
						kind: "cycle",
						id: "color",
						label: "Border color",
						value: "accent",
						values: ["accent", "border", "both"],
						gate: {
							id: "colorEnabled",
							enabled: true,
							disabledValue: "border",
						},
					},
				],
			},
		],
	});
	assert.ok(lineWith(menu, "Border color").includes("[■]"));
	await press(menu, KEY.right, KEY.right);
	assert.ok(lineWith(menu, "Border color").includes("‹ both ›"));
	await press(menu, KEY.space);
	assert.ok(lineWith(menu, "Border color").includes("[ ]"));
	assert.ok(lineWith(menu, "Border color").includes("‹ border ›"));
	await press(menu, KEY.right, KEY.left);
	assert.ok(
		lineWith(menu, "Border color").includes("‹ border ›"),
		"arrows must not change a gated-off row",
	);
	await press(menu, KEY.space, KEY.left);
	assert.ok(lineWith(menu, "Border color").includes("‹ accent ›"));
	await press(menu, KEY.enter);
	assert.deepEqual(results[0]?.values, { color: "accent", colorEnabled: true });
});

test("a disabledUnlessAnyOf toggle is reachable, inert, shows a forced ON and keeps its stored value", async () => {
	const { menu, results } = makeMenu({
		sections: [
			{
				title: "Word Packs",
				items: [
					{ kind: "toggle", id: "pack:one", label: "Pack One", value: false },
					{ kind: "toggle", id: "pack:two", label: "Pack Two", value: false },
					{
						kind: "toggle",
						id: "includeDefault",
						label: "Include default text",
						value: false,
						spacerBefore: true,
						disabledUnlessAnyOf: ["pack:one", "pack:two"],
					},
				],
			},
		],
	});
	const lines = plain(menu, 80);
	const packTwo = lines.findIndex((line) => line.includes("Pack Two"));
	const toggle = lines.findIndex((line) => line.includes("Include default"));
	assert.equal(
		toggle,
		packTwo + 2,
		"the spacer puts one blank row before the gated toggle",
	);
	assert.match(lines[toggle - 1] ?? "", /^║\s+║$/);
	assert.ok(
		lines[toggle]?.includes("[■]") && lines[toggle]?.includes("ON"),
		"forced ON while gated off",
	);

	await press(menu, KEY.down, KEY.down);
	assert.ok(
		selectedLine(menu, 80).includes("Include default"),
		"a gated row can be reached",
	);
	await press(menu, KEY.space);
	assert.ok(
		lineWith(menu, "Include default", 80).includes("ON"),
		"space does nothing while gated off",
	);

	await press(menu, KEY.up, KEY.space, KEY.down);
	assert.ok(
		lineWith(menu, "Include default", 80).includes("OFF"),
		"once a pack is on, the real false shows",
	);
	await press(menu, KEY.space);
	assert.ok(lineWith(menu, "Include default", 80).includes("ON"));
	await press(menu, KEY.up, KEY.space, KEY.down, KEY.space);
	await press(menu, KEY.enter);
	assert.equal(
		results[0]?.values.includeDefault,
		true,
		"the forced display never coerces the value",
	);
	assert.equal(results[0]?.values["pack:two"], false);
});

test("text editing: Enter opens, keys type, Backspace deletes, Enter commits and fires onChange", async () => {
	const seen: string[] = [];
	const { menu } = makeMenu({
		sections: [
			{
				title: "S",
				items: [
					{
						kind: "text",
						id: "name",
						label: "Name",
						value: "",
						placeholder: "...",
					},
				],
			},
		],
		onChange: (id, values) => {
			seen.push(`${id}=${String(values[id])}`);
		},
	});
	assert.ok(
		lineWith(menu, "Name").includes("..."),
		"placeholder shows for an empty value",
	);
	await press(menu, KEY.enter);
	assert.equal(menu.snapshot().editing, true);
	assert.ok(plain(menu).at(-2)?.includes("⏎ commit"));
	type(menu, "hi!");
	assert.ok(lineWith(menu, "Name").includes("hi!█"));
	await press(menu, KEY.backspace, KEY.enter);
	assert.equal(menu.snapshot().editing, false);
	assert.deepEqual(seen, ["name=hi"]);
	assert.equal(menu.snapshot().values.name, "hi");
});

test("text editing: Escape or Ctrl+C discards the buffer and escape sequences never land in it", async () => {
	const { menu, results } = makeMenu({
		sections: [
			{
				title: "S",
				items: [{ kind: "text", id: "name", label: "Name", value: "keep" }],
			},
		],
		buttons: [{ id: "ok", label: "OK" }],
	});
	await press(menu, KEY.enter);
	type(menu, "ZZZ");
	await press(menu, KEY.escape);
	assert.equal(
		results.length,
		0,
		"escape during an edit must not close the menu",
	);
	assert.equal(menu.snapshot().values.name, "keep");

	await press(menu, KEY.enter);
	type(menu, "x");
	await press(menu, KEY.ctrlC);
	assert.equal(menu.snapshot().values.name, "keep");

	await press(menu, KEY.enter, KEY.up, KEY.tab, KEY.pageDown, KEY.enter);
	assert.equal(menu.snapshot().values.name, "keep");
	assert.equal(menu.snapshot().focus, "body", "tab is ignored while editing");
});

test("Escape and Ctrl+C close with applied:false and the current draft, not the initial values", async () => {
	const escaped = makeMenu();
	await press(escaped.menu, KEY.space, KEY.escape);
	assert.deepEqual(escaped.results[0], {
		applied: false,
		values: { a: false, b: false, c: true },
	});

	const interrupted = makeMenu();
	await press(interrupted.menu, KEY.down, KEY.space, KEY.ctrlC);
	assert.deepEqual(interrupted.results[0], {
		applied: false,
		values: { a: true, b: true, c: true },
	});
});

test("Enter applies when there are no buttons, validates first, and does nothing on a toggle row when buttons exist", async () => {
	const applied = makeMenu();
	await press(applied.menu, KEY.space, KEY.enter);
	assert.deepEqual(applied.results[0], {
		applied: true,
		values: { a: false, b: false, c: true },
	});

	const blocked = makeMenu({
		validate: (values) => (values.a === false ? "A must stay on" : undefined),
	});
	await press(blocked.menu, KEY.space, KEY.enter);
	assert.equal(blocked.results.length, 0);
	assert.ok(
		plain(blocked.menu).some((line) => line.includes("A must stay on")),
	);
	await press(blocked.menu, KEY.space, KEY.enter);
	assert.equal(blocked.results[0]?.applied, true);

	const withButtons = makeMenu({
		buttons: [{ id: "apply", label: "Apply", applies: true }],
	});
	await press(withButtons.menu, KEY.enter, KEY.enter, KEY.down, KEY.enter);
	assert.equal(
		withButtons.results.length,
		0,
		"stray Enters on rows do nothing with a button bar",
	);

	const explicit = makeMenu({
		buttons: [{ id: "save", label: "Save" }],
		enterApplies: true,
	});
	await press(explicit.menu, KEY.enter);
	assert.equal(explicit.results[0]?.applied, true);
});

test("an empty menu applies on Enter and cancels on Escape", async () => {
	const applied = makeMenu({ sections: [] });
	await press(applied.menu, KEY.enter);
	assert.deepEqual(applied.results[0], { applied: true, values: {} });
	const cancelled = makeMenu({ sections: [] });
	await press(cancelled.menu, KEY.escape);
	assert.deepEqual(cancelled.results[0], { applied: false, values: {} });
	assert.ok(plain(applied.menu).at(-1)?.includes("[ 1/0 ]"));
});

test("hidden rows hold a value but take no line and no cursor position", async () => {
	const { menu, results } = makeMenu({
		sections: [
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
					{ kind: "toggle", id: "next", label: "Next", value: true },
				],
			},
		],
	});
	assert.ok(!plain(menu).some((line) => line.includes("Detail")));
	await press(menu, KEY.down);
	assert.ok(selectedLine(menu).includes("Next"));
	await press(menu, KEY.enter);
	assert.equal(results[0]?.values.detail, "kept");
});

test("an onChange rebuild changes the rows and keeps the cursor on the same row id", async () => {
	let rebuilds = 0;
	const { menu } = makeMenu({
		sections: [
			{
				title: "S",
				items: [
					{ kind: "toggle", id: "toggle", label: "Toggle", value: false },
					{ kind: "toggle", id: "target", label: "Target", value: true },
				],
			},
		],
		onChange: (id, values) => {
			if (id !== "toggle" || values.toggle !== true) return undefined;
			rebuilds++;
			return [
				{
					title: "S",
					items: [
						{ kind: "toggle", id: "toggle", label: "Toggle", value: true },
						{ kind: "toggle", id: "target", label: "Target", value: true },
						{ kind: "toggle", id: "extra", label: "Extra", value: false },
					],
				},
			];
		},
	});
	assert.ok(!plain(menu).some((line) => line.includes("Extra")));
	await press(menu, KEY.space);
	assert.equal(rebuilds, 1);
	assert.ok(plain(menu).some((line) => line.includes("Extra")));
	assert.ok(selectedLine(menu).includes("Toggle"));
	await press(menu, KEY.space);
	assert.equal(rebuilds, 1, "returning undefined does not rebuild");
	assert.ok(lineWith(menu, "Toggle").includes("OFF"));
});

test("onAction returning a MenuRebuild overwrites the listed values and keeps the other drafts", async () => {
	const replace = async (
		menu: ReturnType<typeof makeMenu>["menu"],
		previous: string,
		next: string,
	) => {
		await press(menu, KEY.enter);
		for (let index = 0; index < previous.length; index++)
			menu.handleInput(KEY.backspace);
		type(menu, next);
		await press(menu, KEY.enter);
	};
	const { menu } = makeMenu({
		sections: [
			{
				title: "S",
				items: [
					{ kind: "action", id: "pick", label: "Pick" },
					{ kind: "text", id: "client", label: "Client", value: "old-client" },
					{ kind: "text", id: "modelId", label: "Model", value: "old-model" },
					{ kind: "text", id: "note", label: "Note", value: "old-note" },
				],
			},
		],
		onAction: (_id, values: Values) => {
			if (values.client !== "draft-client") return undefined;
			return {
				sections: [
					{
						title: "S",
						items: [
							{ kind: "action", id: "pick", label: "Pick" },
							{
								kind: "text",
								id: "client",
								label: "Client",
								value: "picked-client",
							},
							{
								kind: "text",
								id: "modelId",
								label: "Model",
								value: "picked-model",
							},
							{ kind: "text", id: "note", label: "Note", value: "fresh-note" },
						],
					},
				],
				overwriteValues: ["client", "modelId"],
			};
		},
	});
	await press(menu, KEY.down);
	await replace(menu, "old-client", "draft-client");
	await press(menu, KEY.down);
	await replace(menu, "old-model", "draft-model");
	await press(menu, KEY.down);
	await replace(menu, "old-note", "draft-note");
	await press(menu, KEY.up, KEY.up, KEY.up, KEY.enter);
	const lines = plain(menu, 80);
	assert.ok(lines.some((line) => line.includes("picked-client")));
	assert.ok(lines.some((line) => line.includes("picked-model")));
	assert.ok(lines.some((line) => line.includes("draft-note")));
	assert.ok(!lines.some((line) => line.includes("fresh-note")));
});

test("a last one-row section keeps its divider when the cursor lands on that row", async () => {
	const { menu } = makeMenu(
		{
			sections: [
				{
					title: "Heuristic scorer",
					items: Array.from({ length: 20 }, (_, index) => ({
						kind: "toggle" as const,
						id: `h-${index}`,
						label: `Heuristic ${index + 1}`,
						value: false,
					})),
				},
				{
					title: "Stats",
					items: [
						{
							kind: "cycle",
							id: "retention",
							label: "Stats retention",
							value: "forever",
							values: ["never", "forever"],
						},
					],
				},
			],
		},
		{ tui: fakeTui(24) },
	);
	for (let index = 0; index < 20; index++) menu.handleInput(KEY.down);
	const lines = plain(menu, 80);
	assert.ok(selectedLine(menu, 80).includes("Stats retention"));
	assert.ok(lines.some((line) => line.includes("─ Stats ─")));
	assert.equal(lines.length, 20, "85% of 24 rows");
});

test("moving up after reaching the bottom moves within the visible window instead of pinning the cursor", async () => {
	const { menu } = makeMenu({ sections: manyRows(40) }, { tui: fakeTui(40) });
	for (let index = 0; index < 39; index++) menu.handleInput(KEY.down);
	const atBottom = plain(menu, 60);
	assert.equal(atBottom.length, 34);
	const bottomMarker = atBottom.findIndex((line) => line.includes("❯"));
	assert.ok(atBottom[bottomMarker]?.includes("Item 39"));
	await press(menu, KEY.up);
	const after = plain(menu, 60);
	const movedMarker = after.findIndex((line) => line.includes("❯"));
	assert.ok(
		movedMarker < bottomMarker,
		"the cursor must not stay pinned to the bottom row",
	);
	assert.ok(after[movedMarker]?.includes("Item 38"));
});

test("a section starting near the window bottom keeps its heading instead of folding into the previous one", async () => {
	const { menu } = makeMenu(
		{
			sections: [
				{
					title: "Alpha",
					items: Array.from({ length: 4 }, (_, index) => ({
						kind: "toggle" as const,
						id: `a${index}`,
						label: `Alpha ${index}`,
						value: true,
					})),
				},
				{
					title: "Beta",
					items: [
						{
							kind: "toggle",
							id: "b",
							label: "Use NerdFont icons",
							value: true,
						},
					],
				},
			],
		},
		{ tui: fakeTui(12) },
	);
	await press(menu, KEY.down, KEY.down, KEY.down, KEY.down);
	const lines = plain(menu, 64);
	assert.equal(lines.length, 10);
	const divider = lines.findIndex((line) => line.includes("╟─ Beta "));
	const item = lines.findIndex((line) => line.includes("Use NerdFont icons"));
	assert.ok(item >= 0 && divider >= 0 && divider < item);
	assert.match(
		lines[divider - 1] ?? "",
		/^║\s+║$/,
		"a blank row separates the Beta heading from Alpha",
	);
	assert.ok(lines[item]?.includes("❯"));
});
