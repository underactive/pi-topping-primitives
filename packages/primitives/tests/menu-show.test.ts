// showMenu: the non-TUI path, the factory contract with pi's `ui.custom`, and the overlay
// defaults. The fake context mirrors what splash's test helper hands a factory.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { KeybindingsManager } from "@earendil-works/pi-tui";
import { MenuComponent } from "../src/menu/component.js";
import { showMenu } from "../src/menu/show.js";
import type { MenuConfig } from "../src/menu/types.js";
import { fakeTheme, fakeTui, KEY, type Values } from "./menu-harness.js";

type Factory = (
	tui: unknown,
	theme: unknown,
	keybindings: unknown,
	done: (result: unknown) => void,
) => unknown;

interface Captured {
	factory: Factory;
	options: Record<string, unknown>;
}

function fakeContext(
	mode: "tui" | "rpc",
	captured: Captured[],
): ExtensionContext {
	return {
		mode,
		ui: {
			custom: (factory: Factory, options: Record<string, unknown>) =>
				new Promise((resolve) => {
					captured.push({ factory, options });
					resolve(factory(fakeTui(24), fakeTheme(), {}, resolve));
				}),
		},
	} as unknown as ExtensionContext;
}

function config(
	overrides: Partial<MenuConfig<Values>> = {},
): MenuConfig<Values> {
	return {
		title: "T",
		sections: [
			{
				title: "S",
				items: [{ kind: "toggle", id: "n", label: "N", value: true }],
			},
		],
		...overrides,
	};
}

test("outside the TUI showMenu resolves at once with applied:false and the initial values", async () => {
	const captured: Captured[] = [];
	const result = await showMenu(fakeContext("rpc", captured), config());
	assert.deepEqual(result, { applied: false, values: { n: true } });
	assert.equal(captured.length, 0);
});

test("in the TUI showMenu mounts a MenuComponent through ui.custom and resolves with its result", async () => {
	const captured: Captured[] = [];
	const context = fakeContext("tui", captured);
	// The fake resolves with the factory's component when the component never calls done,
	// which is what lets this test look at the mounted object.
	const component: unknown = await showMenu(context, config());
	assert.ok(
		component instanceof MenuComponent,
		"the factory must build the shared component",
	);
	assert.equal(captured.length, 1);
	assert.deepEqual(captured[0]?.options, {
		overlay: true,
		overlayOptions: { width: "90%", maxHeight: "85%" },
	});
});

test("the factory copes with a host that passes no keybindings manager, and with a real one", async () => {
	const captured: Captured[] = [];
	await showMenu(fakeContext("tui", captured), config());
	const factory = captured[0]?.factory;
	assert.ok(factory);
	for (const keybindings of [
		undefined,
		{},
		new KeybindingsManager({}, { "pi-topping.menu.apply": "ctrl+s" }),
	]) {
		let result: unknown;
		const component = factory(
			fakeTui(24),
			fakeTheme(),
			keybindings,
			(value) => {
				result = value;
			},
		);
		assert.ok(component instanceof MenuComponent);
		component.handleInput(KEY.enter);
		if (keybindings instanceof KeybindingsManager) {
			assert.equal(
				result,
				undefined,
				"the host's user binding moved apply off Enter",
			);
			component.handleInput(KEY.ctrlS);
		}
		assert.deepEqual(result, { applied: true, values: { n: true } });
	}
});

test("layout overrides reach the overlay options", async () => {
	const captured: Captured[] = [];
	await showMenu(
		fakeContext("tui", captured),
		config({ layout: { width: 76, maxHeight: "75%" } }),
	);
	assert.deepEqual(captured[0]?.options, {
		overlay: true,
		overlayOptions: { width: 76, maxHeight: "75%" },
	});
	await showMenu(
		fakeContext("tui", captured),
		config({ layout: { maxHeight: "100%" } }),
	);
	assert.deepEqual(captured[1]?.options, {
		overlay: true,
		overlayOptions: { width: "90%", maxHeight: "100%" },
	});
});
