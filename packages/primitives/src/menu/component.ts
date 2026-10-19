/**
 * The box-drawing settings menu shared by the pi-topping extensions, built on pi-tui's
 * `Component` contract and mounted through `ctx.ui.custom()` by `showMenu`.
 *
 *   ╔═[ Settings ]═════════════════════════════════════╗
 *   ╟─ Preview ────────────────────────────────────────╢
 *   ║                                                  ║
 *   ║ ╭── π ⬢ model ───────────────────── session ──╮  ║
 *   ║                                                  ║
 *   ╟─ Global ─────────────────────────────────────────╢
 *   ║  ❯ [■] Transparent Segments                ON    ║
 *   ║    Separator                ‹ powerline-thin ›   ║
 *   ║                                                  ║
 *   ╟─ What this does ─────────────────────────────────╢
 *   ║  Draws segments without a background.            ║
 *   ║                                                  ║
 *   ║                                                  ║
 *   ╟──────────────────────────────────────────────────╢
 *   ║                          [ Apply ]    ‹ Cancel › ║
 *   ╟──────────────────────────────────────────────────╢
 *   ║  ↑↓ move  ␣ toggle  ⇥ buttons  esc cancel        ║
 *   ╚══════════════════════════════════════════[ 1/2 ]═╝
 *
 * Behaviour that the vendored copies disagreed on is settled here once:
 * - Up/Down stop at the ends and skip statically `disabled` rows; cycle rows wrap.
 * - PgUp/PgDn move one visible screenful and land on the nearest enabled row.
 * - Enter on a toggle or cycle row applies the menu only when `enterApplies` is true,
 *   which defaults to "there are no buttons".
 * - Escape (or Ctrl+C) outside an editor closes with `applied: false` and the current
 *   draft, never the initial values; a caller that wants the initial values has them.
 * - A failing `onAction` or `onPick` shows `✗ <message>` in the hint block and is never
 *   re-thrown, so it cannot become an unhandled rejection.
 * - Every key decision goes through the menu's own `KeybindingsManager` (see keys.ts).
 *
 * A rebuild (from `onAction` or `onChange`) rebuilds rows from the returned sections.
 * Draft values survive by key, but an in-progress reorder (the grabbed row and any order
 * the user has dragged into) is reset to the order the sections declare.
 */
import {
	decodeKittyPrintable,
	type KeybindingsManager,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { chrome } from "./chrome.js";
import { menuKeybindings } from "./keys.js";
import {
	buildInitialValues,
	type FlatItem,
	firstEnabledIndex,
	flattenSections,
	moveCursor,
	rebuildMenu,
	resolveCycleValueLabel,
} from "./model.js";
import type {
	MenuButton,
	MenuConfig,
	MenuItem,
	MenuRebuild,
	MenuResult,
	MenuSection,
	MenuSnapshot,
	MenuTheme,
	MenuTui,
	MenuValue,
	NumberItem,
} from "./types.js";

const DEFAULT_HINTS = Object.freeze([
	"\u2191\u2193 move",
	"PgUp/PgDn page",
	"\u2423 toggle",
	"\u23ce apply",
	"esc cancel",
]);
/** Shown by default when a button bar exists, since Enter no longer applies. */
const DEFAULT_BUTTON_MENU_HINTS = Object.freeze([
	"\u2191\u2193 move",
	"\u2423 toggle",
	"\u21e5 buttons",
	"esc cancel",
]);
const TEXT_EDIT_HINTS = Object.freeze([
	"type to edit",
	"\u232b delete",
	"\u23ce commit",
	"esc discard",
]);
const NUMBER_EDIT_HINTS = Object.freeze([
	"type a whole number",
	"\u232b delete",
	"\u23ce confirm",
	"esc cancel edit",
]);
/** Shown in place of the caller's hints while the button bar holds focus; its keys are fixed. */
const BUTTON_BAR_HINTS = Object.freeze([
	"\u2190\u2192 move",
	"\u23ce press",
	"\u21e5 back to settings",
	"esc cancel",
]);
const HINT_ROWS = 3;
const DEFAULT_HINT_TITLE = "What this does";
const DEFAULT_PREVIEW_TITLE = "Preview";
const DEFAULT_MAX_HEIGHT = "85%";
const MAX_NUMBER_EDIT_CHARS = 8;
/** Suffix shown on an action row or button while its promise is pending. */
const BUSY_SUFFIX = " \u2026";
const MARKER = "\u276f";
/** Rows paged when the menu has never been rendered under a height budget. */
const FALLBACK_PAGE_ROWS = 10;

interface Editing {
	id: string;
	kind: "text" | "number";
	buffer: string;
	/** A number buffer that failed to parse on commit; styles the field as an error. */
	invalid: boolean;
}

interface Window {
	lines: string[];
	end: number;
}

function parseWholeNumber(raw: string, spec: NumberItem): number | undefined {
	const trimmed = raw.trim();
	if (!/^\d+$/.test(trimmed)) return undefined;
	const value = Number(trimmed);
	return value >= spec.min && value <= spec.max ? value : undefined;
}

function numberBounds(spec: NumberItem): string {
	const unit = spec.unit ? ` ${spec.unit}` : "";
	return `\u2717 Enter a whole number from ${spec.min} to ${spec.max}${unit}`;
}

function failureMessage(error: unknown): string {
	return `\u2717 ${error instanceof Error ? error.message : String(error)}`;
}

function isThenable(value: unknown): value is Promise<unknown> {
	return value instanceof Promise;
}

/** The pi-tui `Component` behind `showMenu`; constructible directly for tests and probes. */
export class MenuComponent<
	V extends Record<string, MenuValue> = Record<string, MenuValue>,
> {
	readonly #theme: MenuTheme;
	readonly #done: (result: MenuResult<V>) => void;
	readonly #keys: KeybindingsManager;
	readonly #tui: MenuTui | undefined;
	readonly #title: string;
	readonly #buttons: readonly MenuButton[];
	readonly #hints: readonly string[];
	readonly #hintTitle: string;
	readonly #preview: MenuConfig<V>["preview"];
	readonly #validate: MenuConfig<V>["validate"];
	readonly #onChange: MenuConfig<V>["onChange"];
	readonly #onAction: MenuConfig<V>["onAction"];
	readonly #onPick: MenuConfig<V>["onPick"];
	readonly #enterApplies: boolean;
	readonly #maxHeight: number | `${number}%`;
	readonly #previewOrigin: number;
	// Sections and their flattened rows are rebuilt whenever a handler returns fresh
	// sections, so neither can be readonly.
	#sections: readonly MenuSection[];
	#flat: FlatItem[];
	#values: Record<string, MenuValue>;
	#cursor = 0;
	#scrollStart = 0;
	#focus: "body" | "buttons" = "body";
	#buttonCursor = 0;
	#editing: Editing | undefined;
	/** Id of the reorder row being dragged; component-private, never a value. */
	#grabbed: string | undefined;
	/** Action, pick and button ids whose promise is still pending. */
	readonly #busy = new Set<string>();
	/** While an `onPick` is pending every key is ignored, so the picker owns the input. */
	#pickPending = false;
	/** A validation error, a failure or a number-edit error; cleared by the next key. */
	#message: string | undefined;
	#previewTimer: ReturnType<typeof setTimeout> | undefined;
	#previewNextRefreshMs: number | undefined;
	#disposed = false;
	#pageRows: number | undefined;
	#cachedWidth: number | undefined;
	#cachedRows: number | undefined;
	#cachedLines: string[] | undefined;

	constructor(
		config: MenuConfig<V>,
		theme: MenuTheme,
		done: (result: MenuResult<V>) => void,
		tui?: MenuTui,
		keys?: KeybindingsManager,
	) {
		this.#theme = theme;
		this.#done = done;
		this.#keys = keys ?? menuKeybindings();
		this.#tui = tui;
		this.#title = config.title;
		this.#sections = config.sections;
		this.#buttons = config.buttons ?? [];
		this.#hints =
			config.hints ??
			(this.#buttons.length > 0 ? DEFAULT_BUTTON_MENU_HINTS : DEFAULT_HINTS);
		this.#hintTitle = config.hintTitle ?? DEFAULT_HINT_TITLE;
		this.#preview = config.preview;
		this.#validate = config.validate;
		this.#onChange = config.onChange;
		this.#onAction = config.onAction;
		this.#onPick = config.onPick;
		this.#enterApplies = config.enterApplies ?? this.#buttons.length === 0;
		this.#maxHeight = config.layout?.maxHeight ?? DEFAULT_MAX_HEIGHT;
		this.#previewOrigin = Date.now();
		this.#values = buildInitialValues(config);
		this.#flat = flattenSections(this.#sections);
		this.#cursor = firstEnabledIndex(this.#flat);
		if (config.initialCursor !== undefined) {
			const index = this.#flat.findIndex(
				(row) => row.id === config.initialCursor && !row.item.disabled,
			);
			if (index !== -1) this.#cursor = index;
		}
		const primary = this.#buttons.findIndex((button) => button.primary);
		this.#buttonCursor = Math.max(0, primary);
	}

	/** Stops the preview timer and ignores every later promise settlement. */
	dispose(): void {
		this.#disposed = true;
		this.#clearPreviewTimer();
	}

	/** Detached copies of the state a host test may need; mutating them changes nothing. */
	snapshot(): MenuSnapshot<V> {
		return {
			values: { ...this.#values } as V,
			cursorId: this.#flat[this.#cursor]?.id,
			rowCount: this.#flat.length,
			editing: this.#editing !== undefined,
			focus: this.#focus,
			busy: [...this.#busy],
		};
	}

	invalidate(): void {
		this.#cachedWidth = undefined;
		this.#cachedRows = undefined;
		this.#cachedLines = undefined;
	}

	handleInput(data: string): void {
		if (this.#pickPending) return;
		if (this.#message !== undefined) {
			this.#message = undefined;
			if (this.#editing) this.#editing.invalid = false;
			this.invalidate();
		}
		if (this.#editing) {
			this.#handleEditInput(data, this.#editing);
			return;
		}
		// Matched ahead of either focus's own key table, so neither can claim Tab for itself.
		if (this.#buttons.length > 0 && this.#matches(data, "focusButtons")) {
			this.#focus = this.#focus === "body" ? "buttons" : "body";
			this.invalidate();
			return;
		}
		if (this.#focus === "buttons") {
			this.#handleButtonInput(data);
			return;
		}
		if (this.#matches(data, "cancel")) {
			this.#close({ applied: false, values: this.#draft() });
			return;
		}
		if (this.#flat.length === 0) {
			if (this.#matches(data, "apply") && this.#enterApplies) this.#apply();
			return;
		}
		if (this.#matches(data, "up")) {
			if (!this.#moveGrabbed(-1))
				this.#cursor = moveCursor(this.#flat, this.#cursor, -1);
			this.invalidate();
		} else if (this.#matches(data, "down")) {
			if (!this.#moveGrabbed(1))
				this.#cursor = moveCursor(this.#flat, this.#cursor, 1);
			this.invalidate();
		} else if (this.#matches(data, "pageUp")) {
			this.#moveByPage(-1);
		} else if (this.#matches(data, "pageDown")) {
			this.#moveByPage(1);
		} else if (this.#matches(data, "left")) {
			this.#step(-1);
		} else if (this.#matches(data, "right")) {
			this.#step(1);
		} else if (this.#matches(data, "toggle")) {
			this.#activate("toggle");
		} else if (this.#matches(data, "apply")) {
			this.#activate("apply");
		} else if (this.#matches(data, "clear")) {
			this.#clearCurrentValue();
		}
	}

	render(width: number): string[] {
		const rows = this.#availableRows();
		if (
			this.#cachedWidth === width &&
			this.#cachedRows === rows &&
			this.#cachedLines
		) {
			return this.#cachedLines;
		}
		const lines = this.#buildLines(width, rows);
		this.#cachedWidth = width;
		this.#cachedRows = rows;
		this.#cachedLines = lines;
		this.#schedulePreview();
		return lines;
	}

	// --- input -----------------------------------------------------------------

	#matches(
		data: string,
		id:
			| "up"
			| "down"
			| "pageUp"
			| "pageDown"
			| "left"
			| "right"
			| "toggle"
			| "apply"
			| "cancel"
			| "focusButtons"
			| "clear"
			| "editCommit"
			| "editCancel"
			| "editBackspace",
	): boolean {
		return this.#keys.matches(data, `pi-topping.menu.${id}`);
	}

	#current(): FlatItem | undefined {
		return this.#flat[this.#cursor];
	}

	/** Rows that can be reached but must not respond: statically disabled or dependency-gated. */
	#isInert(item: MenuItem): boolean {
		if (item.disabled) return true;
		const required = item.disabledUnlessAnyOf;
		return (
			required !== undefined &&
			!required.some((id) => this.#values[id] === true)
		);
	}

	/**
	 * Keys while the button bar holds focus. Left/right stop at the ends like the body
	 * cursor does, and Up leaves for the body, since the bar renders below it.
	 */
	#handleButtonInput(data: string): void {
		if (this.#matches(data, "left")) {
			this.#buttonCursor = Math.max(0, this.#buttonCursor - 1);
			this.invalidate();
		} else if (this.#matches(data, "right")) {
			this.#buttonCursor = Math.min(
				this.#buttons.length - 1,
				this.#buttonCursor + 1,
			);
			this.invalidate();
		} else if (this.#matches(data, "up")) {
			this.#focus = "body";
			this.invalidate();
		} else if (this.#matches(data, "apply") || this.#matches(data, "toggle")) {
			const button = this.#buttons[this.#buttonCursor];
			if (button) this.#pressButton(button);
		} else if (this.#matches(data, "cancel")) {
			this.#close({ applied: false, values: this.#draft() });
		}
	}

	#pressButton(button: MenuButton): void {
		if (this.#busy.has(button.id)) return;
		if (button.applies) {
			this.#apply(button.id);
			return;
		}
		if (button.closeOnAction) {
			this.#close({ applied: false, action: button.id, values: this.#draft() });
			return;
		}
		this.#runAction(button.id);
	}

	/** Space or Enter on the row under the cursor. */
	#activate(key: "toggle" | "apply"): void {
		const row = this.#current();
		if (!row) return;
		const item = row.item;
		// Enter on a value row applies the whole menu, so a gated or disabled row under the
		// cursor must not swallow it; only the row's own value is inert.
		if (key === "apply" && (item.kind === "toggle" || item.kind === "cycle")) {
			if (this.#enterApplies) this.#apply();
			return;
		}
		if (this.#isInert(item)) return;
		switch (item.kind) {
			case "text":
				this.#editing = {
					id: item.id,
					kind: "text",
					buffer: String(this.#values[item.id] ?? ""),
					invalid: false,
				};
				this.invalidate();
				return;
			case "number":
				this.#editing = {
					id: item.id,
					kind: "number",
					buffer: "",
					invalid: false,
				};
				this.invalidate();
				return;
			case "action":
				if (item.closeOnAction) {
					this.#close({
						applied: false,
						action: item.id,
						values: this.#draft(),
					});
				} else {
					this.#runAction(item.id);
				}
				return;
			case "pick":
				this.#runPick(item.id);
				return;
			case "reorder":
				this.#grabbed = this.#grabbed === item.id ? undefined : item.id;
				this.invalidate();
				return;
			case "toggle":
				this.#values[item.id] = !(this.#values[item.id] === true);
				this.invalidate();
				this.#applyOnChange(item.id);
				return;
			case "cycle": {
				if (!item.gate) return;
				const enabled = !(this.#values[item.gate.id] === true);
				this.#values[item.gate.id] = enabled;
				if (!enabled && item.gate.disabledValue !== undefined) {
					this.#values[item.id] = item.gate.disabledValue;
				}
				this.invalidate();
				this.#applyOnChange(item.id);
				return;
			}
			default:
				return;
		}
	}

	/** Left/right on a cycle row wraps; on a number row it snaps through the presets. */
	#step(delta: 1 | -1): void {
		const row = this.#current();
		if (!row || this.#isInert(row.item)) return;
		const item = row.item;
		if (item.kind === "cycle") {
			if (item.values.length === 0) return;
			if (item.gate && this.#values[item.gate.id] !== true) return;
			const current = item.values.indexOf(String(this.#values[item.id]));
			const index = (current + delta + item.values.length) % item.values.length;
			const next = item.values[index];
			if (next === undefined) return;
			this.#values[item.id] = next;
			this.invalidate();
			this.#applyOnChange(item.id);
			return;
		}
		if (item.kind === "number") {
			const presets = item.presets;
			if (!presets || presets.length === 0) return;
			const current = Number(this.#values[item.id]);
			// Snap to the nearest preset in the arrow's direction, wrapping to the opposite end
			// once there is nothing further that way.
			const ordered = delta > 0 ? [...presets] : [...presets].reverse();
			const next =
				ordered.find((preset) =>
					delta > 0 ? preset > current : preset < current,
				) ?? ordered[0];
			if (next === undefined) return;
			this.#values[item.id] = next;
			this.invalidate();
			this.#applyOnChange(item.id);
		}
	}

	/** Backspace or Delete resets a pick or text row to its `clearValue`; other rows ignore it. */
	#clearCurrentValue(): void {
		const row = this.#current();
		if (!row || this.#isInert(row.item)) return;
		const item = row.item;
		if (
			(item.kind !== "pick" && item.kind !== "text") ||
			item.clearValue === undefined
		)
			return;
		this.#values[item.id] = item.clearValue;
		this.invalidate();
		this.#applyOnChange(item.id);
	}

	#handleEditInput(data: string, editing: Editing): void {
		if (this.#matches(data, "editCommit")) {
			this.#commitEdit(editing);
			return;
		}
		if (this.#matches(data, "editCancel")) {
			this.#editing = undefined;
			this.invalidate();
			return;
		}
		if (this.#matches(data, "editBackspace")) {
			editing.buffer = [...editing.buffer].slice(0, -1).join("");
			this.invalidate();
			return;
		}
		// Mirrors pi-tui's editor: prefer the terminal protocol's decoded key and fall back to
		// raw data, so escape sequences never leak into the buffer.
		const printable =
			decodeKittyPrintable(data) ??
			(data.charCodeAt(0) >= 32 ? data : undefined);
		if (printable === undefined || printable.startsWith("\x1b")) return;
		if (editing.kind === "number") {
			if (!/^[\x20-\x7e]+$/.test(printable)) return;
			if (editing.buffer.length + printable.length > MAX_NUMBER_EDIT_CHARS)
				return;
			editing.buffer += printable;
			this.invalidate();
			return;
		}
		const clean = [...printable].filter((ch) => {
			const code = ch.codePointAt(0) ?? 0;
			return code >= 32 && code !== 127;
		});
		if (clean.length === 0) return;
		editing.buffer += clean.join("");
		this.invalidate();
	}

	#commitEdit(editing: Editing): void {
		if (editing.kind === "text") {
			this.#values[editing.id] = editing.buffer;
			this.#editing = undefined;
			this.invalidate();
			this.#applyOnChange(editing.id);
			return;
		}
		const item = this.#current()?.item;
		if (item?.kind !== "number" || item.id !== editing.id) {
			this.#editing = undefined;
			this.invalidate();
			return;
		}
		const value = parseWholeNumber(editing.buffer, item);
		if (value === undefined) {
			editing.invalid = true;
			this.#message = numberBounds(item);
			this.invalidate();
			return;
		}
		this.#values[item.id] = value;
		this.#editing = undefined;
		this.invalidate();
		this.#applyOnChange(item.id);
	}

	/** Move the grabbed reorder row within its group. True when the key belonged to the drag. */
	#moveGrabbed(delta: number): boolean {
		const row = this.#current();
		if (!row || this.#grabbed === undefined || row.id !== this.#grabbed)
			return false;
		if (row.item.kind !== "reorder") return false;
		const group = row.item.group;
		const inGroup = (index: number): boolean => {
			const candidate = this.#flat[index]?.item;
			return candidate?.kind === "reorder" && candidate.group === group;
		};
		let start = this.#cursor;
		while (start > 0 && inGroup(start - 1)) start--;
		let end = this.#cursor;
		while (end < this.#flat.length - 1 && inGroup(end + 1)) end++;

		const target = Math.max(start, Math.min(end, this.#cursor + delta));
		if (target !== this.#cursor) {
			this.#flat.splice(this.#cursor, 1);
			this.#flat.splice(target, 0, row);
			this.#cursor = target;
			this.#values[group] = this.#flat
				.slice(start, end + 1)
				.map((entry) => entry.id)
				.join(",");
			this.invalidate();
		}
		return true;
	}

	#pageRowCount(): number {
		if (this.#pageRows !== undefined) return this.#pageRows;
		return Math.max(1, Math.min(this.#flat.length, FALLBACK_PAGE_ROWS));
	}

	/** One visible screenful, landing on the nearest enabled row in the direction of travel. */
	#moveByPage(direction: 1 | -1): void {
		const count = this.#pageRowCount();
		if (this.#moveGrabbed(direction * count)) return;
		let target = Math.max(
			0,
			Math.min(this.#flat.length - 1, this.#cursor + direction * count),
		);
		if (this.#flat[target]?.item.disabled) {
			const onward = moveCursor(this.#flat, target, direction);
			target =
				onward !== target
					? onward
					: moveCursor(this.#flat, target, direction === 1 ? -1 : 1);
		}
		if (this.#flat[target]?.item.disabled) return;
		this.#cursor = target;
		this.invalidate();
	}

	// --- results and handlers -------------------------------------------------------

	#draft(): V {
		return { ...this.#values } as V;
	}

	#close(result: MenuResult<V>): void {
		this.#clearPreviewTimer();
		this.#done(result);
	}

	/** Validate, then close with `applied: true`; a validation error stays in the hint block. */
	#apply(action?: string): void {
		const error = this.#validate?.(this.#draft());
		if (error) {
			this.#message = error;
			this.invalidate();
			return;
		}
		this.#close(
			action === undefined
				? { applied: true, values: this.#draft() }
				: { applied: true, action, values: this.#draft() },
		);
	}

	/** Run `onChange` and rebuild around any sections it returns; a no-op result costs nothing. */
	#applyOnChange(id: string): void {
		const next = this.#onChange?.(id, this.#draft());
		if (next) this.#rebuild(next);
	}

	#runAction(id: string): void {
		if (this.#busy.has(id)) return;
		let result: ReturnType<NonNullable<MenuConfig<V>["onAction"]>>;
		try {
			result = this.#onAction?.(id, this.#draft());
		} catch (error) {
			this.#fail(id, error);
			return;
		}
		if (isThenable(result)) {
			this.#busy.add(id);
			this.invalidate();
			result.then(
				(sections) => {
					if (this.#disposed) return;
					this.#busy.delete(id);
					if (sections) this.#rebuild(sections);
					this.invalidate();
					this.#tui?.requestRender?.();
				},
				(error: unknown) => this.#fail(id, error),
			);
			return;
		}
		if (result) this.#rebuild(result);
		this.invalidate();
	}

	#runPick(id: string): void {
		if (!this.#onPick) return;
		let result: Promise<string | undefined>;
		try {
			result = this.#onPick(id, this.#draft());
		} catch (error) {
			this.#fail(id, error);
			return;
		}
		this.#busy.add(id);
		this.#pickPending = true;
		this.invalidate();
		Promise.resolve(result).then(
			(value) => {
				if (this.#disposed) return;
				this.#busy.delete(id);
				this.#pickPending = false;
				if (typeof value === "string") {
					this.#values[id] = value;
					this.#applyOnChange(id);
				}
				this.invalidate();
				this.#tui?.requestRender?.();
			},
			(error: unknown) => this.#fail(id, error),
		);
	}

	/** A handler failed: clear its busy state, show the reason, and never re-throw. */
	#fail(id: string, error: unknown): void {
		if (this.#disposed) return;
		this.#busy.delete(id);
		this.#pickPending = false;
		this.#message = failureMessage(error);
		this.invalidate();
		this.#tui?.requestRender?.();
	}

	#rebuild(next: MenuRebuild | readonly MenuSection[]): void {
		const sections = "sections" in next ? next.sections : next;
		const overwrite = "sections" in next ? next.overwriteValues : undefined;
		const result = rebuildMenu(
			sections,
			{
				flat: this.#flat,
				cursor: this.#cursor,
				values: this.#values,
				scrollStart: this.#scrollStart,
			},
			overwrite ? new Set(overwrite) : undefined,
		);
		this.#sections = result.sections;
		this.#flat = result.flat;
		this.#values = result.values;
		this.#cursor = result.cursor;
		this.#scrollStart = result.scrollStart;
		this.#editing = undefined;
		this.#grabbed = undefined;
	}

	// --- preview ---------------------------------------------------------------------

	#samplePreview(innerWidth: number): string[] | undefined {
		if (!this.#preview) return undefined;
		const result = this.#preview.render(this.#draft(), {
			elapsedMs: Date.now() - this.#previewOrigin,
			activeItemId: this.#flat[this.#cursor]?.id,
			width: innerWidth,
		});
		this.#previewNextRefreshMs = result.nextRefreshInMs;
		return result.lines;
	}

	#clearPreviewTimer(): void {
		if (this.#previewTimer !== undefined) {
			clearTimeout(this.#previewTimer);
			this.#previewTimer = undefined;
		}
	}

	#schedulePreview(): void {
		this.#clearPreviewTimer();
		const delay = this.#previewNextRefreshMs;
		if (this.#disposed || !this.#tui || delay === undefined || delay <= 0)
			return;
		this.#previewTimer = setTimeout(() => {
			this.#previewTimer = undefined;
			this.invalidate();
			this.#tui?.requestRender?.();
		}, delay);
	}

	// --- layout ----------------------------------------------------------------------

	/** The overlay's height budget, so pi-tui never crops the footer after rendering. */
	#availableRows(): number | undefined {
		const rows = this.#tui?.terminal?.rows;
		if (typeof rows !== "number" || !Number.isFinite(rows) || rows <= 0)
			return undefined;
		const terminalRows = Math.floor(rows);
		const requested =
			typeof this.#maxHeight === "number"
				? this.#maxHeight
				: (Number.parseFloat(this.#maxHeight) / 100) * terminalRows;
		if (!Number.isFinite(requested)) return terminalRows;
		return Math.max(1, Math.min(terminalRows, Math.floor(requested)));
	}

	#buildLines(maxWidth: number, maxRows: number | undefined): string[] {
		const boxWidth = Math.max(0, maxWidth);
		const innerWidth = Math.max(0, boxWidth - 2);
		const previewLines = this.#samplePreview(innerWidth);
		const header = [
			chrome.topBorder(this.#theme, innerWidth, this.#title),
			...this.#buildPreviewBlock(previewLines, innerWidth),
		];
		const footer = this.#buildFooter(innerWidth);
		const naturalBody = this.#buildBody(innerWidth);
		const naturalHeight = header.length + naturalBody.length + footer.length;
		if (maxRows === undefined || naturalHeight <= maxRows) {
			this.#pageRows = Math.max(1, this.#flat.length);
			return [...header, ...naturalBody, ...footer].map((line) =>
				truncateToWidth(line, boxWidth, ""),
			);
		}
		const bodyRows = Math.max(0, maxRows - header.length - footer.length);
		const body = this.#buildScrollingBody(innerWidth, bodyRows, naturalBody);
		return [...header, ...body, ...footer]
			.slice(0, maxRows)
			.map((line) => truncateToWidth(line, boxWidth, ""));
	}

	#buildPreviewBlock(
		previewLines: string[] | undefined,
		innerWidth: number,
	): string[] {
		if (!previewLines?.length) return [];
		const th = this.#theme;
		return [
			chrome.sectionDivider(
				th,
				innerWidth,
				this.#preview?.title ?? DEFAULT_PREVIEW_TITLE,
			),
			chrome.blankRow(th, innerWidth),
			...previewLines.map((line) => chrome.contentRow(th, innerWidth, line)),
			chrome.blankRow(th, innerWidth),
		];
	}

	/** Every section from `#flat`, the single source of truth for row order. */
	#buildBody(innerWidth: number): string[] {
		const th = this.#theme;
		const lines: string[] = [];
		let currentSection = -1;
		for (const [index, row] of this.#flat.entries()) {
			if (row.sectionIndex !== currentSection) {
				if (currentSection !== -1) lines.push(chrome.blankRow(th, innerWidth));
				lines.push(
					chrome.sectionDivider(
						th,
						innerWidth,
						this.#sectionTitle(row.sectionIndex),
					),
				);
				currentSection = row.sectionIndex;
			}
			if (row.item.spacerBefore) lines.push(chrome.blankRow(th, innerWidth));
			lines.push(
				...this.#renderItemRow(row.item, index === this.#cursor, innerWidth),
			);
		}
		if (lines.length) lines.push(chrome.blankRow(th, innerWidth));
		return lines;
	}

	#sectionTitle(index: number): string {
		return this.#sections[index]?.title ?? "";
	}

	/** A section-aware row window from `start`, keeping a divider above each visible section. */
	#buildWindow(innerWidth: number, start: number, maxRows: number): Window {
		const th = this.#theme;
		const lines: string[] = [];
		let currentSection = -1;
		let end = start - 1;
		for (
			let index = start;
			index < this.#flat.length && lines.length < maxRows;
			index++
		) {
			const row = this.#flat[index];
			if (!row) break;
			if (row.sectionIndex !== currentSection) {
				const remaining = maxRows - lines.length;
				const blank = lines.length > 0 ? 1 : 0;
				// Divider plus at least one item row, with a leading blank when this is not the
				// first visible section. Never start a section without its title.
				if (remaining < blank + 2) break;
				if (blank) lines.push(chrome.blankRow(th, innerWidth));
				lines.push(
					chrome.sectionDivider(
						th,
						innerWidth,
						this.#sectionTitle(row.sectionIndex),
					),
				);
				currentSection = row.sectionIndex;
			}
			if (
				row.item.spacerBefore &&
				lines.length > 0 &&
				maxRows - lines.length >= 2
			) {
				lines.push(chrome.blankRow(th, innerWidth));
			}
			if (lines.length >= maxRows) break;
			const itemLines = this.#renderItemRow(
				row.item,
				index === this.#cursor,
				innerWidth,
			);
			const remaining = maxRows - lines.length;
			if (itemLines.length > remaining) {
				// Keep the beginning of a tall row visible rather than dropping it behind the
				// scroll boundary; the next render can move the window down to reveal the rest.
				if (remaining > 0) {
					lines.push(...itemLines.slice(0, remaining));
					end = index;
				}
				break;
			}
			lines.push(...itemLines);
			end = index;
		}
		if (end === this.#flat.length - 1 && lines.length < maxRows) {
			lines.push(chrome.blankRow(th, innerWidth));
		}
		return { lines, end };
	}

	/** The scrolling body, keeping the selected row in view without pinning it to an edge. */
	#buildScrollingBody(
		innerWidth: number,
		maxRows: number,
		naturalBody: string[],
	): string[] {
		if (naturalBody.length <= maxRows) {
			this.#scrollStart = 0;
			this.#pageRows = Math.max(1, this.#flat.length);
			return naturalBody;
		}
		if (maxRows <= 0) {
			this.#pageRows = 1;
			return [];
		}
		if (maxRows === 1) {
			this.#pageRows = 1;
			return this.#buildWindow(innerWidth, this.#cursor, 1).lines;
		}

		const contentRows = maxRows - 1; // Reserve one fixed row for scroll status.
		if (this.#cursor < this.#scrollStart) this.#scrollStart = this.#cursor;
		this.#scrollStart = Math.max(
			0,
			Math.min(this.#scrollStart, this.#flat.length - 1),
		);

		let window = this.#buildWindow(innerWidth, this.#scrollStart, contentRows);
		while (window.end < this.#cursor && this.#scrollStart < this.#cursor) {
			this.#scrollStart++;
			window = this.#buildWindow(innerWidth, this.#scrollStart, contentRows);
		}
		// The window stays anchored while the cursor moves within it. Backfilling from above
		// on every render would keep the cursor pinned to the bottom while moving back up.
		this.#pageRows = Math.max(1, window.end - this.#scrollStart + 1);
		const rows = [...window.lines];
		while (rows.length < contentRows)
			rows.push(chrome.blankRow(this.#theme, innerWidth));
		rows.push(
			this.#renderScrollStatus(
				this.#scrollStart > 0,
				window.end < this.#flat.length - 1,
				innerWidth,
			),
		);
		return rows;
	}

	#buildFooter(innerWidth: number): string[] {
		const th = this.#theme;
		const hasHints =
			this.#flat.some(({ item }) => item.hint !== undefined) ||
			this.#buttons.some((button) => button.hint !== undefined);
		const lines =
			hasHints || this.#message !== undefined
				? this.#buildHintBlock(innerWidth)
				: [];
		lines.push(chrome.separator(th, innerWidth));
		if (this.#buttons.length > 0) {
			// Two rules bracket the bar so it reads as its own footer section.
			lines.push(
				this.#renderButtonBar(innerWidth),
				chrome.separator(th, innerWidth),
			);
		}
		lines.push(
			this.#renderHintsRow(innerWidth),
			chrome.bottomBorder(th, innerWidth, this.#cursor, this.#flat.length),
		);
		return lines;
	}

	/** Three fixed rows under their own divider: the message, or the focused row's hint. */
	#buildHintBlock(innerWidth: number): string[] {
		const th = this.#theme;
		const focusedHint =
			this.#focus === "buttons"
				? this.#buttons[this.#buttonCursor]?.hint
				: this.#flat[this.#cursor]?.item.hint;
		const text = this.#message ?? focusedHint ?? "No description.";
		const width = Math.max(1, innerWidth - 4);
		const wrapped = wrapTextWithAnsi(text, width);
		const rows = wrapped.slice(0, HINT_ROWS);
		if (wrapped.length > HINT_ROWS) {
			const last = rows[HINT_ROWS - 1] ?? "";
			rows[HINT_ROWS - 1] =
				`${truncateToWidth(last, Math.max(0, width - 1), "")}…`;
		}
		while (rows.length < HINT_ROWS) rows.push("");
		const color = this.#message !== undefined ? "error" : "dim";
		return [
			chrome.sectionDivider(th, innerWidth, this.#hintTitle),
			...rows.map((row) =>
				chrome.contentRow(th, innerWidth, `  ${th.fg(color, row)}`),
			),
		];
	}

	/** Right-aligned buttons: the focused one as `[ Apply ]`, the others as `‹ Cancel ›`. */
	#renderButtonBar(innerWidth: number): string {
		const th = this.#theme;
		const focused = this.#focus === "buttons";
		const text = this.#buttons
			.map((button, index) => {
				const current = index === this.#buttonCursor;
				const busy = this.#busy.has(button.id) ? BUSY_SUFFIX : "";
				const face = current
					? `[ ${button.label}${busy} ]`
					: `\u2039 ${button.label}${busy} \u203a`;
				return current && focused
					? th.bold(th.fg("accent", face))
					: th.fg("muted", face);
			})
			.join("    ");
		const pad = Math.max(0, innerWidth - visibleWidth(text) - 2);
		return chrome.contentRow(th, innerWidth, `${" ".repeat(pad)}${text}  `);
	}

	#renderHintsRow(innerWidth: number): string {
		const hints = this.#editing
			? this.#editing.kind === "number"
				? NUMBER_EDIT_HINTS
				: TEXT_EDIT_HINTS
			: this.#focus === "buttons"
				? BUTTON_BAR_HINTS
				: this.#hints;
		return chrome.contentRow(
			this.#theme,
			innerWidth,
			this.#theme.fg("dim", `  ${hints.join("  ")}`),
		);
	}

	#renderScrollStatus(
		hasAbove: boolean,
		hasBelow: boolean,
		innerWidth: number,
	): string {
		const parts = [
			hasAbove ? "↑ more above" : "",
			hasBelow ? "↓ more below" : "",
		].filter(Boolean);
		return chrome.contentRow(
			this.#theme,
			innerWidth,
			this.#theme.fg("dim", `  ${parts.join("    ")}`),
		);
	}

	// --- rows ------------------------------------------------------------------------

	/** One row line without an ellipsis, highlighted when it is the body's selected row. */
	#renderItemContentRow(
		content: string,
		innerWidth: number,
		selected: boolean,
	): string {
		const th = this.#theme;
		const shown =
			visibleWidth(content) > innerWidth
				? truncateToWidth(content, innerWidth, "")
				: content;
		const padded = `${shown}${" ".repeat(Math.max(0, innerWidth - visibleWidth(shown)))}`;
		// The cursor keeps its marker while the button bar has focus, but gives up the
		// background so the focused button is the only highlighted thing on screen. Every
		// embedded reset re-opens the background so a truncated fragment cannot end it early.
		const highlighted =
			selected && this.#focus === "body"
				? th.bg(
						"selectedBg",
						padded.replaceAll(
							"\x1b[0m",
							`\x1b[0m${th.getBgAnsi("selectedBg")}`,
						),
					)
				: padded;
		return th.fg("border", "\u2551") + highlighted + th.fg("border", "\u2551");
	}

	/** Keep a label and its value together when they fit, otherwise stack wrapped lines. */
	#renderLabeledItemRows(
		prefix: string,
		label: string,
		suffix: string,
		innerWidth: number,
		endPadding: number,
		selected: boolean,
	): string[] {
		const prefixWidth = visibleWidth(prefix);
		const labelWidth = visibleWidth(label);
		const suffixWidth = visibleWidth(suffix);
		const minimumGap = suffixWidth > 0 ? 1 : 0;
		const inlineLabelWidth =
			innerWidth - prefixWidth - suffixWidth - minimumGap - endPadding;
		if (labelWidth <= inlineLabelWidth) {
			const gap =
				innerWidth - prefixWidth - labelWidth - suffixWidth - endPadding;
			const content = `${prefix}${label}${" ".repeat(Math.max(minimumGap, gap))}${suffix}${" ".repeat(endPadding)}`;
			return [this.#renderItemContentRow(content, innerWidth, selected)];
		}

		const labelAvailableWidth = Math.max(1, innerWidth - prefixWidth);
		const labelLines = wrapTextWithAnsi(label, labelAvailableWidth);
		const continuationIndent = " ".repeat(
			Math.min(prefixWidth, Math.max(0, innerWidth - 1)),
		);
		const lines = labelLines.map((line, index) =>
			this.#renderItemContentRow(
				`${index === 0 ? prefix : continuationIndent}${line}`,
				innerWidth,
				selected,
			),
		);
		if (suffixWidth > 0) {
			const suffixAvailableWidth = Math.max(
				1,
				innerWidth - continuationIndent.length,
			);
			for (const line of wrapTextWithAnsi(suffix, suffixAvailableWidth)) {
				lines.push(
					this.#renderItemContentRow(
						`${continuationIndent}${line}`,
						innerWidth,
						selected,
					),
				);
			}
		}
		return lines;
	}

	#renderItemRow(
		item: MenuItem,
		selected: boolean,
		innerWidth: number,
	): string[] {
		const th = this.#theme;
		if (item.disabled) {
			const suffix = item.disabledReason ? `  (${item.disabledReason})` : "";
			return this.#renderLabeledItemRows(
				"    ",
				th.fg("dim", item.label),
				suffix ? th.fg("dim", suffix) : "",
				innerWidth,
				0,
				false,
			);
		}

		const marker = selected ? th.fg("accent", MARKER) : " ";
		const prefix = `  ${marker} `;
		const gated = this.#isInert(item);
		const value = this.#values[item.id];

		switch (item.kind) {
			case "action": {
				const suffix = this.#busy.has(item.id) ? th.fg("dim", BUSY_SUFFIX) : "";
				return this.#renderLabeledItemRows(
					prefix,
					th.fg(selected ? "accent" : "muted", item.label),
					suffix,
					innerWidth,
					0,
					selected,
				);
			}
			case "pick": {
				const busy = this.#busy.has(item.id) ? BUSY_SUFFIX : "";
				const state = `${String(value ?? "")}${busy} \u203a`;
				return this.#renderLabeledItemRows(
					prefix,
					th.fg(gated ? "muted" : "text", item.label),
					th.fg(gated ? "muted" : "accent", state),
					innerWidth,
					2,
					selected,
				);
			}
			case "text": {
				const editing =
					this.#editing?.id === item.id ? this.#editing : undefined;
				const raw = editing ? editing.buffer : String(value ?? "");
				const empty = raw.length === 0;
				const fieldText = empty ? (item.placeholder ?? "") : raw;
				const fieldStyled = empty
					? th.fg("muted", fieldText)
					: th.fg(editing ? "accent" : "text", fieldText);
				const field = `${fieldStyled}${editing ? th.fg("accent", "\u2588") : ""}`;
				return this.#renderLabeledItemRows(
					prefix,
					th.fg("dim", item.label),
					field,
					innerWidth,
					1,
					selected,
				);
			}
			case "number": {
				const editing =
					this.#editing?.id === item.id ? this.#editing : undefined;
				const unit = item.unit ? ` ${item.unit}` : "";
				const state = editing
					? `\u2039 ${editing.buffer}\u258c${unit} \u203a`
					: `\u2039 ${String(value)}${unit} \u203a`;
				const stateStyled = editing
					? th.fg(editing.invalid ? "error" : "accent", state)
					: th.fg(gated ? "muted" : "accent", state);
				return this.#renderLabeledItemRows(
					prefix,
					th.fg(gated ? "muted" : "text", item.label),
					stateStyled,
					innerWidth,
					2,
					selected,
				);
			}
			case "cycle": {
				const state = `\u2039 ${resolveCycleValueLabel(item, String(value))} \u203a`;
				if (!item.gate) {
					return this.#renderLabeledItemRows(
						prefix,
						th.fg(gated ? "muted" : "text", item.label),
						th.fg(gated ? "muted" : "accent", state),
						innerWidth,
						2,
						selected,
					);
				}
				const enabled = this.#values[item.gate.id] === true;
				const checkbox = `${prefix}[${enabled && !gated ? th.fg("success", "\u25a0") : th.fg("muted", " ")}] `;
				return this.#renderLabeledItemRows(
					checkbox,
					th.fg(gated ? "muted" : "text", item.label),
					th.fg(enabled && !gated ? "accent" : "muted", state),
					innerWidth,
					2,
					selected,
				);
			}
			case "reorder": {
				const held = this.#grabbed === item.id;
				const checkbox = `${prefix}[${held ? th.fg("accent", "\u25a0") : th.fg("muted", " ")}] `;
				return this.#renderLabeledItemRows(
					checkbox,
					th.fg("text", item.label),
					held ? th.fg("accent", "\u2191 \u2193") : "",
					innerWidth,
					2,
					selected,
				);
			}
			case "toggle": {
				// A dependency-gated toggle shows a forced, muted ON without touching its value.
				const enabled = gated || value === true;
				const box = enabled ? "\u25a0" : " ";
				const stateWord = enabled ? "ON" : "OFF";
				const color = gated ? "muted" : enabled ? "success" : "muted";
				return this.#renderLabeledItemRows(
					`${prefix}[${th.fg(color, box)}] `,
					th.fg(gated ? "muted" : "text", item.label),
					th.fg(color, stateWord),
					innerWidth,
					2,
					selected,
				);
			}
			default:
				return [];
		}
	}
}
