// The keybinding contract: the table is frozen, the defaults are the keys the five forks
// matched by hand, and remapping flows through the user's bindings into the menu's own
// manager, never the host's.
import assert from "node:assert/strict";
import { test } from "node:test";
import { KeybindingsManager } from "@earendil-works/pi-tui";
import { DEFAULT_MENU_KEYBINDINGS, menuKeybindings } from "../src/menu/keys.js";
import {
	fakeHost,
	KEY,
	makeMenu,
	press,
	selectedLine,
} from "./menu-harness.js";

test("DEFAULT_MENU_KEYBINDINGS is deeply frozen", () => {
	assert.ok(Object.isFrozen(DEFAULT_MENU_KEYBINDINGS));
	for (const [id, definition] of Object.entries(DEFAULT_MENU_KEYBINDINGS)) {
		assert.ok(id.startsWith("pi-topping.menu."), id);
		assert.ok(Object.isFrozen(definition), `${id} definition`);
		if (Array.isArray(definition.defaultKeys)) {
			assert.ok(Object.isFrozen(definition.defaultKeys), `${id} defaultKeys`);
		}
		assert.equal(typeof definition.description, "string");
	}
	assert.deepEqual(Object.keys(DEFAULT_MENU_KEYBINDINGS).sort(), [
		"pi-topping.menu.apply",
		"pi-topping.menu.cancel",
		"pi-topping.menu.clear",
		"pi-topping.menu.down",
		"pi-topping.menu.editBackspace",
		"pi-topping.menu.editCancel",
		"pi-topping.menu.editCommit",
		"pi-topping.menu.focusButtons",
		"pi-topping.menu.left",
		"pi-topping.menu.pageDown",
		"pi-topping.menu.pageUp",
		"pi-topping.menu.right",
		"pi-topping.menu.toggle",
		"pi-topping.menu.up",
	]);
});

test("the defaults are today's physical keys, including both cancel aliases", () => {
	const keys = menuKeybindings();
	const expect = (
		id: Parameters<typeof keys.matches>[1],
		...data: string[]
	) => {
		for (const input of data)
			assert.ok(
				keys.matches(input, id),
				`${id} should match ${JSON.stringify(input)}`,
			);
	};
	expect("pi-topping.menu.up", KEY.up);
	expect("pi-topping.menu.down", KEY.down);
	expect("pi-topping.menu.pageUp", KEY.pageUp);
	expect("pi-topping.menu.pageDown", KEY.pageDown);
	expect("pi-topping.menu.left", KEY.left);
	expect("pi-topping.menu.right", KEY.right);
	expect("pi-topping.menu.toggle", KEY.space);
	expect("pi-topping.menu.apply", KEY.enter);
	expect("pi-topping.menu.cancel", KEY.escape, KEY.ctrlC);
	expect("pi-topping.menu.focusButtons", KEY.tab, KEY.shiftTab);
	expect("pi-topping.menu.clear", KEY.backspace, KEY.delete);
	expect("pi-topping.menu.editCommit", KEY.enter);
	expect("pi-topping.menu.editCancel", KEY.escape, KEY.ctrlC);
	expect("pi-topping.menu.editBackspace", KEY.backspace);
	assert.ok(!keys.matches(KEY.enter, "pi-topping.menu.cancel"));
	assert.ok(!keys.matches("a", "pi-topping.menu.apply"));
});

test("a user binding of apply to ctrl+s stops Enter applying and makes ctrl+s apply", async () => {
	const keys = menuKeybindings(fakeHost({ "pi-topping.menu.apply": "ctrl+s" }));
	assert.ok(!keys.matches(KEY.enter, "pi-topping.menu.apply"));
	assert.ok(keys.matches(KEY.ctrlS, "pi-topping.menu.apply"));
	assert.ok(
		keys.matches(KEY.enter, "pi-topping.menu.editCommit"),
		"unrelated ids keep their defaults",
	);

	const { menu, results } = makeMenu({}, { keys });
	await press(menu, KEY.enter);
	assert.equal(
		results.length,
		0,
		"Enter must not apply once the user moved apply elsewhere",
	);
	await press(menu, KEY.ctrlS);
	assert.equal(results.length, 1);
	assert.equal(results[0]?.applied, true);
});

test("user bindings for other ids pass through untouched and cannot be read as menu ids", () => {
	const keys = menuKeybindings(
		fakeHost({
			"tui.select.confirm": "ctrl+y",
			"pi-topping.menu.cancel": ["q"],
		}),
	);
	assert.ok(keys.matches("q", "pi-topping.menu.cancel"));
	assert.ok(
		!keys.matches(KEY.escape, "pi-topping.menu.cancel"),
		"a user binding replaces the default list",
	);
	assert.deepEqual(keys.getKeys("pi-topping.menu.cancel"), ["q"]);
});

test("a host without a manager, or a bare object, yields the defaults", () => {
	for (const host of [undefined, {}, fakeHost()]) {
		const keys = menuKeybindings(host);
		assert.ok(keys instanceof KeybindingsManager);
		assert.ok(keys.matches(KEY.enter, "pi-topping.menu.apply"));
		assert.ok(keys.matches(KEY.escape, "pi-topping.menu.cancel"));
	}
});

test("the menu matches through its own manager, so a host manager that knows no menu ids still works", async () => {
	// The runtime trap: pi's manager only answers for ids it was built with. Seeding the menu's
	// manager from the host's user bindings keeps remaps while avoiding the host's lookup table.
	const host = new KeybindingsManager(
		{ "tui.select.confirm": { defaultKeys: "enter" } },
		{},
	);
	assert.ok(
		!host.matches(KEY.enter, "pi-topping.menu.apply"),
		"the host's manager knows nothing of the menu",
	);

	const { menu, results } = makeMenu({}, { keys: menuKeybindings(host) });
	await press(menu, KEY.down);
	assert.ok(selectedLine(menu).includes("Item B"));
	await press(menu, KEY.enter);
	assert.equal(results[0]?.applied, true);
});
