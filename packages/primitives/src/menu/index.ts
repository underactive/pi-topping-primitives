/**
 * The settings menu shared by the pi-topping extensions: a box-drawing overlay of toggle,
 * cycle, number, text, action, pick and reorder rows with an optional preview, a hint block,
 * a button bar and validation (`MenuComponent`, mounted by `showMenu`).
 *
 * Contract:
 * - Colour is the host's: the component takes a structural `MenuTheme` and nothing reads a
 *   global theme.
 * - No module state: two copies of this package in one pi process do not interfere. The
 *   exported tables (`DEFAULT_MENU_KEYBINDINGS`, `chrome`) are deeply frozen.
 * - Keys are matched through the menu's own `KeybindingsManager`, built from
 *   `DEFAULT_MENU_KEYBINDINGS` plus the host's user bindings. The ids are registered on
 *   pi-tui's `Keybindings` interface so a user can remap them.
 * - Pi is imported for types, plus these runtime pi-tui functions: `KeybindingsManager`,
 *   `Key`, `decodeKittyPrintable`, `truncateToWidth`, `visibleWidth` and
 *   `wrapTextWithAnsi`.
 */
export { chrome } from "./chrome.js";
export { MenuComponent } from "./component.js";
export { DEFAULT_MENU_KEYBINDINGS, menuKeybindings } from "./keys.js";
export {
	buildInitialValues,
	type FlatItem,
	firstEnabledIndex,
	flattenSections,
	moveCursor,
	type RebuildResult,
	type RebuildState,
	rebuildMenu,
	resolveCycleValueLabel,
} from "./model.js";
export { showMenu } from "./show.js";
export type {
	ActionItem,
	CycleItem,
	MenuButton,
	MenuConfig,
	MenuHandlerResult,
	MenuItem,
	MenuItemBase,
	MenuRebuild,
	MenuResult,
	MenuSection,
	MenuSnapshot,
	MenuTheme,
	MenuTui,
	MenuValue,
	NumberItem,
	PickItem,
	PreviewSlot,
	ReorderItem,
	TextItem,
	ToggleItem,
} from "./types.js";
