// Compiled-condition test for `./menu`, importing the package by its own name. It proves the
// emitted `dist` works as a plain consumer sees it: the component renders through the frozen
// chrome, Enter applies, the key ids resolve through the menu's own manager, and the dist
// declaration merges the ids into pi-tui's `Keybindings`.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Keybinding } from "@earendil-works/pi-tui";
import {
	chrome,
	DEFAULT_MENU_KEYBINDINGS,
	MenuComponent,
	type MenuResult,
	type MenuTheme,
	menuKeybindings,
} from "@underactive/pi-topping-primitives/menu";

// Type-level: without the declaration merge in dist/menu/keys.d.ts this line does not compile.
const APPLY: Keybinding = "pi-topping.menu.apply";

const theme: MenuTheme = {
	fg: (_color, text) => text,
	bg: (_color, text) => text,
	bold: (text) => text,
	getBgAnsi: () => "",
};

test("the compiled menu renders a frame through chrome and Enter applies", () => {
	let result: MenuResult | undefined;
	const menu = new MenuComponent(
		{
			title: "Compiled",
			sections: [
				{
					title: "S",
					items: [
						{ kind: "toggle", id: "on", label: "On", value: true },
						{ kind: "number", id: "n", label: "N", value: 5, min: 0, max: 9 },
					],
				},
			],
		},
		theme,
		(value) => {
			result = value;
		},
	);
	const lines = menu.render(40);
	assert.equal(lines[0], chrome.topBorder(theme, 38, "Compiled"));
	assert.equal(lines.at(-1), chrome.bottomBorder(theme, 38, 0, 2));
	assert.ok(lines.some((line) => line.includes("❯") && line.includes("On")));
	menu.handleInput(" ");
	menu.handleInput("\r");
	assert.deepEqual(result, { applied: true, values: { on: false, n: 5 } });
});

test("the compiled key ids resolve through the menu's own manager and the tables are frozen", () => {
	const keys = menuKeybindings();
	assert.ok(keys.matches("\r", APPLY));
	assert.ok(keys.matches("\x1b", "pi-topping.menu.cancel"));
	assert.ok(
		Object.keys(DEFAULT_MENU_KEYBINDINGS).every((id) =>
			id.startsWith("pi-topping.menu."),
		),
	);
	assert.ok(Object.isFrozen(DEFAULT_MENU_KEYBINDINGS));
	assert.ok(Object.isFrozen(chrome));
	assert.equal(typeof chrome.contentRow, "function");
});
