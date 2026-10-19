// Number rows: pi-topping's typed editor and bash-gate's preset snapping, merged. Values
// are numbers end to end; the left-arrow wrap below the lowest preset is the pi-topping fix.
import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { MenuConfig, MenuValue } from "../src/menu/types.js";
import {
	FG,
	KEY,
	kittyDigit,
	lineWith,
	makeMenu,
	plain,
	press,
	stripAnsi,
	styledLineWith,
	type,
	type Values,
} from "./menu-harness.js";

const BOUND = {
	kind: "number" as const,
	id: "bound",
	label: "Upper bound",
	value: 80,
	min: 10,
	max: 1000,
	presets: [10, 80, 100, 200, 300, 1000],
	unit: "tps",
};

function numberMenu(overrides: Partial<MenuConfig<Values>> = {}) {
	return makeMenu({
		sections: [
			{
				title: "S",
				items: [
					{ ...BOUND },
					{ kind: "toggle", id: "other", label: "Other", value: true },
				],
			},
		],
		...overrides,
	});
}

const row = (menu: ReturnType<typeof makeMenu>["menu"]) =>
	lineWith(menu, "Upper bound");
const hintsRow = (menu: ReturnType<typeof makeMenu>["menu"]) =>
	plain(menu).at(-2) ?? "";
const errorShown = (menu: ReturnType<typeof makeMenu>["menu"]) =>
	plain(menu).some((line) =>
		line.includes("✗ Enter a whole number from 10 to 1000 tps"),
	);

test("number rows show their unit and step through presets with wrap-around at both ends", async () => {
	const { menu } = numberMenu();
	assert.ok(row(menu).includes("‹ 80 tps ›"));
	await press(menu, KEY.right);
	assert.ok(row(menu).includes("‹ 100 tps ›"));
	await press(menu, KEY.left, KEY.left);
	assert.ok(row(menu).includes("‹ 10 tps ›"));
	await press(menu, KEY.left);
	assert.ok(
		row(menu).includes("‹ 1000 tps ›"),
		"left from the first preset wraps to the last",
	);
	await press(menu, KEY.right);
	assert.ok(
		row(menu).includes("‹ 10 tps ›"),
		"right from the last preset wraps to the first",
	);
});

test("Space or Enter opens the editor; a confirmed value publishes a number and does not apply the menu", async () => {
	const { menu, results } = numberMenu();
	assert.ok(hintsRow(menu).includes("esc cancel"));
	await press(menu, KEY.space);
	assert.ok(hintsRow(menu).includes("type a whole number"));
	assert.equal(menu.snapshot().editing, true);
	type(menu, "250");
	assert.ok(row(menu).includes("‹ 250▌ tps ›"));
	await press(menu, KEY.enter);
	assert.equal(
		results.length,
		0,
		"confirming the editor does not apply the menu",
	);
	assert.ok(row(menu).includes("‹ 250 tps ›"));
	assert.equal(menu.snapshot().values.bound, 250);
	assert.equal(typeof menu.snapshot().values.bound, "number");

	await press(menu, KEY.enter);
	assert.equal(menu.snapshot().editing, true, "Enter also opens the editor");
	type(menu, "90");
	await press(menu, KEY.enter);
	await press(menu, KEY.down, KEY.enter);
	assert.equal(results[0]?.applied, true);
	assert.strictEqual(results[0]?.values.bound, 90);
});

test("a typed value between presets snaps to the nearest preset in the arrow's direction", async () => {
	const edit = async (
		menu: ReturnType<typeof makeMenu>["menu"],
		text: string,
	) => {
		await press(menu, KEY.space);
		type(menu, text);
		await press(menu, KEY.enter);
	};
	const { menu } = numberMenu();
	await edit(menu, "250");
	await press(menu, KEY.right);
	assert.ok(row(menu).includes("‹ 300 tps ›"));
	await edit(menu, "250");
	await press(menu, KEY.left);
	assert.ok(row(menu).includes("‹ 200 tps ›"));
	await edit(menu, "15");
	await press(menu, KEY.left);
	assert.ok(row(menu).includes("‹ 10 tps ›"));
});

test("left below the lowest preset wraps to the highest and right above the highest wraps to the lowest", async () => {
	const low = makeMenu({
		sections: [
			{ title: "S", items: [{ ...BOUND, min: 1, presets: [10, 50, 100] }] },
		],
	});
	await press(low.menu, KEY.space);
	type(low.menu, "5");
	await press(low.menu, KEY.enter, KEY.left);
	assert.ok(
		row(low.menu).includes("‹ 100 tps ›"),
		"the pi-topping left-arrow defect: 5 < 10 must wrap, not stall",
	);

	const high = makeMenu({
		sections: [
			{ title: "S", items: [{ ...BOUND, max: 5000, presets: [10, 50, 100] }] },
		],
	});
	await press(high.menu, KEY.space);
	type(high.menu, "4000");
	await press(high.menu, KEY.enter, KEY.right);
	assert.ok(row(high.menu).includes("‹ 10 tps ›"));

	const noPresets = makeMenu({
		sections: [{ title: "S", items: [{ ...BOUND, presets: undefined }] }],
	});
	await press(noPresets.menu, KEY.left, KEY.right);
	assert.ok(
		row(noPresets.menu).includes("‹ 80 tps ›"),
		"arrows do nothing without presets",
	);
});

test("invalid input keeps the editor open with the error in the hint block and restores the old value on Escape", async () => {
	const { menu, results } = numberMenu();
	for (const input of ["5", "1001", "80.5", "abc", ""]) {
		await press(menu, KEY.space);
		type(menu, input);
		await press(menu, KEY.enter);
		assert.equal(results.length, 0, `${JSON.stringify(input)} closed the menu`);
		assert.ok(errorShown(menu), JSON.stringify(input));
		assert.ok(
			styledLineWith(menu, "Upper bound").includes(
				`${FG.error}‹ ${input}▌ tps ›`,
			),
			`${JSON.stringify(input)} is not error-styled`,
		);
		await press(menu, KEY.escape);
		assert.ok(
			row(menu).includes("‹ 80 tps ›"),
			`${JSON.stringify(input)} changed the value`,
		);
	}
	await press(menu, KEY.space);
	type(menu, "5");
	await press(menu, KEY.enter);
	assert.ok(errorShown(menu));
	await press(menu, KEY.backspace);
	assert.ok(!errorShown(menu), "the next key clears the error");
	assert.ok(!styledLineWith(menu, "Upper bound").includes(FG.error ?? ""));
	type(menu, "1000");
	await press(menu, KEY.enter);
	assert.equal(menu.snapshot().values.bound, 1000);
});

test("Escape discards a number draft without closing the menu, and the editor caps at eight characters", async () => {
	const { menu, results } = numberMenu();
	await press(menu, KEY.space);
	type(menu, "300");
	await press(menu, KEY.escape);
	assert.equal(results.length, 0);
	assert.ok(row(menu).includes("‹ 80 tps ›"));

	await press(menu, KEY.space);
	type(menu, "1234567890");
	assert.ok(row(menu).includes("‹ 12345678▌ tps ›"));
	await press(menu, KEY.escape, KEY.escape);
	assert.deepEqual(results[0], {
		applied: false,
		values: { bound: 80, other: true },
	});
});

test("navigation keys are ignored while editing a number", async () => {
	const { menu } = numberMenu();
	await press(menu, KEY.space);
	for (const key of [
		KEY.down,
		KEY.up,
		KEY.pageDown,
		KEY.pageUp,
		KEY.right,
		KEY.left,
		KEY.tab,
	]) {
		await press(menu, key);
		assert.ok(plain(menu).at(-1)?.includes("[ 1/2 ]"));
		assert.ok(row(menu).includes("‹ ▌ tps ›"));
	}
});

test("kitty CSI-u digits are decoded into the number editor", async () => {
	const { menu } = numberMenu();
	await press(menu, KEY.space, kittyDigit(5), kittyDigit(0));
	assert.ok(row(menu).includes("‹ 50▌ tps ›"));
	await press(menu, KEY.enter);
	assert.equal(menu.snapshot().values.bound, 50);
});

test("the preview never receives a number draft", async () => {
	const seen: MenuValue[] = [];
	const { menu } = numberMenu({
		preview: {
			render: (values) => {
				seen.push(values.bound ?? "");
				return { lines: [`bound=${String(values.bound)}`] };
			},
		},
	});
	menu.render(64);
	await press(menu, KEY.space);
	type(menu, "25");
	menu.render(64);
	type(menu, "0");
	menu.render(64);
	assert.deepEqual([...new Set(seen)], [80]);
	await press(menu, KEY.enter);
	menu.render(64);
	assert.equal(seen.at(-1), 250);
});

test("number and cycle rows stay inside the frame at narrow widths, including while invalid", async () => {
	const { menu } = numberMenu({
		sections: [
			{
				title: "S",
				items: [
					{ ...BOUND, label: "Token activity monitor upper bound" },
					{
						kind: "cycle",
						id: "dir",
						label: "Token activity monitor direction",
						value: "rtl",
						values: ["rtl", "ltr"],
						labels: { rtl: "Right to Left" },
					},
				],
			},
		],
	});
	const framed = (state: string) => {
		for (const width of [40, 64]) {
			for (const line of menu.render(width)) {
				assert.equal(
					visibleWidth(line),
					width,
					`${state} at ${width}: ${JSON.stringify(stripAnsi(line))}`,
				);
				assert.match(
					stripAnsi(line),
					/[║╗╢╝]$/,
					`${state} at ${width} lost its right border`,
				);
			}
		}
	};
	framed("idle");
	await press(menu, KEY.space);
	type(menu, "5");
	await press(menu, KEY.enter);
	framed("invalid edit");
});
