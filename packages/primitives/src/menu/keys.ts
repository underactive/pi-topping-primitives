import {
	Key,
	type KeybindingDefinition,
	type KeybindingDefinitions,
	type KeybindingsConfig,
	KeybindingsManager,
} from "@earendil-works/pi-tui";

// Registration teaches TypeScript the ids; menuKeybindings registers them at runtime.
declare module "@earendil-works/pi-tui" {
	interface Keybindings {
		"pi-topping.menu.up": true;
		"pi-topping.menu.down": true;
		"pi-topping.menu.pageUp": true;
		"pi-topping.menu.pageDown": true;
		"pi-topping.menu.left": true;
		"pi-topping.menu.right": true;
		"pi-topping.menu.toggle": true;
		"pi-topping.menu.apply": true;
		"pi-topping.menu.cancel": true;
		"pi-topping.menu.focusButtons": true;
		"pi-topping.menu.clear": true;
		"pi-topping.menu.editCommit": true;
		"pi-topping.menu.editCancel": true;
		"pi-topping.menu.editBackspace": true;
	}
}

function freezeDefinition<T extends KeybindingDefinition>(
	definition: T,
): Readonly<T> {
	// pi-tui types defaultKeys as a mutable array, but only reads definitions.
	if (Array.isArray(definition.defaultKeys))
		Object.freeze(definition.defaultKeys);
	return Object.freeze(definition);
}

/** Physical keys shared by the five forks, deeply frozen, including both cancel aliases. */
export const DEFAULT_MENU_KEYBINDINGS = Object.freeze({
	"pi-topping.menu.up": freezeDefinition({
		defaultKeys: Key.up,
		description: "Previous menu row",
	}),
	"pi-topping.menu.down": freezeDefinition({
		defaultKeys: Key.down,
		description: "Next menu row",
	}),
	"pi-topping.menu.pageUp": freezeDefinition({
		defaultKeys: Key.pageUp,
		description: "Previous menu page",
	}),
	"pi-topping.menu.pageDown": freezeDefinition({
		defaultKeys: Key.pageDown,
		description: "Next menu page",
	}),
	"pi-topping.menu.left": freezeDefinition({
		defaultKeys: Key.left,
		description: "Previous value or button",
	}),
	"pi-topping.menu.right": freezeDefinition({
		defaultKeys: Key.right,
		description: "Next value or button",
	}),
	"pi-topping.menu.toggle": freezeDefinition({
		defaultKeys: Key.space,
		description: "Toggle or activate menu row",
	}),
	"pi-topping.menu.apply": freezeDefinition({
		defaultKeys: Key.enter,
		description: "Apply or open menu row",
	}),
	"pi-topping.menu.cancel": freezeDefinition({
		defaultKeys: [Key.escape, Key.ctrl("c")],
		description: "Cancel menu",
	}),
	"pi-topping.menu.focusButtons": freezeDefinition({
		defaultKeys: [Key.tab, Key.shift("tab")],
		description: "Switch menu focus",
	}),
	"pi-topping.menu.clear": freezeDefinition({
		defaultKeys: [Key.backspace, Key.delete],
		description: "Reset clearable menu row",
	}),
	"pi-topping.menu.editCommit": freezeDefinition({
		defaultKeys: Key.enter,
		description: "Commit menu edit",
	}),
	"pi-topping.menu.editCancel": freezeDefinition({
		defaultKeys: [Key.escape, Key.ctrl("c")],
		description: "Discard menu edit",
	}),
	"pi-topping.menu.editBackspace": freezeDefinition({
		defaultKeys: Key.backspace,
		description: "Delete previous character",
	}),
} satisfies KeybindingDefinitions);

/**
 * Use a dedicated manager: the host's manager only answers for the ids it was built with, so
 * the menu's ids would silently match nothing through it. The host's user bindings still
 * carry over. A host without `getUserBindings` (a test fake) yields the defaults.
 */
export function menuKeybindings(host?: {
	getUserBindings?(): KeybindingsConfig;
}): KeybindingsManager {
	return new KeybindingsManager(
		DEFAULT_MENU_KEYBINDINGS,
		host?.getUserBindings?.() ?? {},
	);
}
