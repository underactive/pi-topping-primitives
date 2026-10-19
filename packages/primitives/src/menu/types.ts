import type { ThemeBg, ThemeColor } from "@earendil-works/pi-coding-agent";
import type { SizeValue } from "@earendil-works/pi-tui";

/** Draft values retain their native types; number rows never publish decimal strings. */
export type MenuValue = boolean | string | number;

/** Rows are visible and enabled by default, with no hint, spacer or dependency gate. */
export interface MenuItemBase {
	id: string;
	label: string;
	hint?: string;
	disabled?: boolean;
	disabledReason?: string;
	hidden?: boolean;
	spacerBefore?: boolean;
	/** Reachable but inert unless a listed value is true; does not coerce the stored value. */
	disabledUnlessAnyOf?: readonly string[];
}

/** Space toggles the supplied initial boolean. */
export interface ToggleItem extends MenuItemBase {
	kind: "toggle";
	value: boolean;
}

/** Arrows always wrap. Labels default to raw values; an optional gate defaults to enabled. */
export interface CycleItem extends MenuItemBase {
	kind: "cycle";
	value: string;
	values: readonly string[];
	labels?: Readonly<Record<string, string>>;
	gate?: { id: string; enabled?: boolean; disabledValue?: string };
}

/** Whole-number editor with inclusive bounds; no presets or displayed unit by default. */
export interface NumberItem extends MenuItemBase {
	kind: "number";
	value: number;
	min: number;
	max: number;
	presets?: readonly number[];
	unit?: string;
}

/** Enter edits the supplied text; placeholder and Backspace/Delete reset are opt-in. */
export interface TextItem extends MenuItemBase {
	kind: "text";
	value: string;
	placeholder?: string;
	clearValue?: string;
}

/** Runs onAction and stays open by default; stores no value. */
export interface ActionItem extends MenuItemBase {
	kind: "action";
	closeOnAction?: boolean;
}

/** Invokes onPick; an undefined result keeps the value. Clearing is opt-in. */
export interface PickItem extends MenuItemBase {
	kind: "pick";
	value: string;
	clearValue?: string;
}

/** Initially ungrabbed; only values[group] = ids.join(",") is published, not per-row booleans. */
export interface ReorderItem extends MenuItemBase {
	kind: "reorder";
	group: string;
}

/** Explicit row kind selects behavior; shared options default as in MenuItemBase. */
export type MenuItem =
	| ToggleItem
	| CycleItem
	| NumberItem
	| TextItem
	| ActionItem
	| PickItem
	| ReorderItem;

/** Ordered rows under a heading; no section description by default. */
export interface MenuSection {
	title: string;
	description?: string;
	items: readonly MenuItem[];
}

/** Plain buttons run onAction and stay open; primary selects initial button focus. */
export interface MenuButton {
	id: string;
	label: string;
	hint?: string;
	primary?: boolean;
	/** Validate then close with applied:true and this button's id. */
	applies?: boolean;
	/** Close with applied:false and the current draft, without running onAction. */
	closeOnAction?: boolean;
}

/** Rebuild from sections, preserving surviving draft values unless explicitly overwritten. */
export interface MenuRebuild {
	sections: readonly MenuSection[];
	overwriteValues?: readonly string[];
}

/** Title defaults to "Preview"; no refresh timer without a positive nextRefreshInMs. */
export interface PreviewSlot<
	V extends Record<string, MenuValue> = Record<string, MenuValue>,
> {
	title?: string;
	/** Sampled synchronously on render; width is the full inner width, with no added margin. */
	render(
		values: V,
		state: {
			elapsedMs: number;
			activeItemId: string | undefined;
			width: number;
		},
	): { lines: string[]; nextRefreshInMs?: number };
}

/**
 * What `onChange` and `onAction` may return: fresh sections or a `MenuRebuild` to rebuild
 * the rows, or nothing. `void` rather than `undefined` so a handler with no return statement
 * is assignable.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: a no-return handler must type-check
export type MenuHandlerResult = MenuRebuild | readonly MenuSection[] | void;

/**
 * Defaults: no buttons/preview/callbacks, standard key hints, "What this does" hint title,
 * first enabled row, Enter applies only without buttons, and a 90% wide / 85% high overlay.
 */
export interface MenuConfig<
	V extends Record<string, MenuValue> = Record<string, MenuValue>,
> {
	title: string;
	sections: readonly MenuSection[];
	buttons?: readonly MenuButton[];
	hints?: readonly string[];
	hintTitle?: string;
	preview?: PreviewSlot<V>;
	validate?(values: V): string | undefined;
	onChange?(id: string, values: V): MenuHandlerResult;
	onAction?(
		id: string,
		values: V,
	): MenuHandlerResult | Promise<MenuHandlerResult>;
	onPick?(id: string, values: V): Promise<string | undefined>;
	enterApplies?: boolean;
	initialCursor?: string;
	layout?: { width?: SizeValue; maxHeight?: SizeValue };
}

/** Closing returns the current draft; action is absent unless an action/button closes the menu. */
export interface MenuResult<
	V extends Record<string, MenuValue> = Record<string, MenuValue>,
> {
	applied: boolean;
	action?: string;
	values: V;
}

/** Detached state; initially body-focused, not editing, with no busy ids. */
export interface MenuSnapshot<
	V extends Record<string, MenuValue> = Record<string, MenuValue>,
> {
	values: V;
	cursorId: string | undefined;
	rowCount: number;
	editing: boolean;
	focus: "body" | "buttons";
	busy: readonly string[];
}

/** Host-owned colors, with no global/default theme and no runtime dependency on pi's Theme class. */
export interface MenuTheme {
	fg(color: ThemeColor, text: string): string;
	bg(color: ThemeBg, text: string): string;
	bold(text: string): string;
	getBgAnsi(color: ThemeBg): string;
}

/**
 * The slice of pi-tui's `TUI` the menu reads: terminal rows for its height budget and
 * `requestRender` after an async action or preview tick. Both are optional so a test can
 * pass a bare object, and a menu with no host renders at its natural height.
 */
export interface MenuTui {
	terminal?: { rows?: number };
	requestRender?(): void;
}
