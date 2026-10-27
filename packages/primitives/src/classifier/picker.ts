/**
 * The classifier picker: `auto`, every credentialed classifier with its API, and
 * a pinned key that is currently unavailable.
 *
 * Contract:
 * - Colour is the host's: the component takes a structural theme plus pi-tui's
 *   `SelectListTheme`, and nothing reads a global theme.
 * - Backspace is matched through the host's `KeybindingsManager` when one is
 *   supplied (pi's `ui.custom` hands one to the factory), so a user who remapped
 *   `tui.editor.deleteCharBackward` still edits the filter. Without one the
 *   component falls back to pi's global keybindings, which is what a host that
 *   constructs it directly wants.
 * - No module state; the exported option table is built fresh on every call.
 */
import {
	type ExtensionCommandContext,
	getSelectListTheme,
} from "@earendil-works/pi-coding-agent";
import {
	type Component,
	decodeKittyPrintable,
	fuzzyFilter,
	getKeybindings,
	type KeybindingsManager,
	type SelectItem,
	SelectList,
	type SelectListTheme,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { BOX_STYLES } from "../glyphs/index.js";
import { AUTO_CLASSIFIER } from "./config.js";
import { type JevModel, modelName } from "./jev.js";

const BOX = BOX_STYLES.single;
const HINT_TEXT = "type filters • ↑↓ navigate • enter select • esc cancel";

export interface ClassifierOption {
	value: string;
	label: string;
	description?: string;
}

export interface ClassifierPickerConfig {
	title: string;
	options: readonly ClassifierOption[];
	selected?: string;
}

/** `auto`, every credentialed classifier with its API, and the pinned key when it is neither. */
export function classifierPickerOptions(
	available: readonly JevModel[],
	autoModel: string | undefined,
	selected: string,
): ClassifierOption[] {
	const options: ClassifierOption[] = [
		{
			value: AUTO_CLASSIFIER,
			label: AUTO_CLASSIFIER,
			description: autoModel
				? `first configured Jev model: ${autoModel}`
				: "no Jev model has credentials",
		},
		...available.map((model) => ({
			value: modelName(model),
			label: modelName(model),
			description: model.api,
		})),
	];
	if (
		selected !== AUTO_CLASSIFIER &&
		!options.some((option) => option.value === selected)
	) {
		options.push({
			value: selected,
			label: selected,
			description: "unavailable",
		});
	}
	return options;
}

export class ClassifierPickerComponent implements Component {
	readonly #tui: TUI;
	readonly #theme: ClassifierPickerTheme;
	readonly #selectTheme: SelectListTheme;
	readonly #title: string;
	readonly #options: readonly ClassifierOption[];
	readonly #done: (result: string | undefined) => void;
	readonly #matchesDeleteKey: (data: string) => boolean;
	#filter = "";
	#maxVisible = 10;
	#list: SelectList;

	constructor(
		tui: TUI,
		theme: ClassifierPickerTheme,
		selectTheme: SelectListTheme,
		config: ClassifierPickerConfig,
		done: (result: string | undefined) => void,
		keybindings?: KeybindingsManager,
	) {
		this.#tui = tui;
		this.#theme = theme;
		this.#selectTheme = selectTheme;
		this.#title = config.title;
		this.#options = config.options;
		this.#done = done;
		const manager = keybindings ?? getKeybindings();
		this.#matchesDeleteKey = (data: string) =>
			manager.matches(data, "tui.editor.deleteCharBackward");
		this.#list = this.#buildList(config.selected);
	}

	#buildList(selected: string | undefined): SelectList {
		const items: SelectItem[] = this.#options.map(
			({ value, label, description }) => ({
				value,
				label,
				...(description ? { description } : {}),
			}),
		);
		const shown = this.#filter.trim()
			? fuzzyFilter(items, this.#filter, (item) => item.label)
			: items;
		const maxPrimaryColumnWidth = shown.reduce(
			(max, item) => Math.max(max, visibleWidth(item.label) + 2),
			32,
		);
		const list = new SelectList(
			shown,
			Math.max(1, Math.min(shown.length, this.#maxVisible)),
			this.#selectTheme,
			{
				minPrimaryColumnWidth: 32,
				maxPrimaryColumnWidth,
			},
		);
		const index = shown.findIndex((item) => item.value === selected);
		if (index >= 0) list.setSelectedIndex(index);
		list.onSelect = (item) => this.#done(item.value);
		list.onCancel = () => this.#done(undefined);
		return list;
	}

	#refilter(): void {
		this.#list = this.#buildList(this.#list.getSelectedItem()?.value);
		this.#tui.requestRender();
	}

	handleInput(data: string): void {
		if (this.#matchesDeleteKey(data)) {
			if (this.#filter.length > 0) {
				this.#filter = [...this.#filter].slice(0, -1).join("");
				this.#refilter();
			}
			return;
		}
		const printable = decodeKittyPrintable(data) ?? data;
		if (
			[...printable].length > 0 &&
			[...printable].every((char) => {
				const point = char.codePointAt(0) ?? 0;
				return point >= 0x20 && !(point >= 0x7f && point <= 0x9f);
			})
		) {
			this.#filter += printable;
			this.#refilter();
			return;
		}
		this.#list.handleInput(data);
		this.#tui.requestRender();
	}

	invalidate(): void {
		this.#list.invalidate();
	}

	#edge(
		left: string,
		right: string,
		innerWidth: number,
		fill: string = BOX.horizontal,
	): string {
		return this.#theme.fg("border", left + fill.repeat(innerWidth) + right);
	}

	#row(content: string, innerWidth: number): string {
		const shown =
			visibleWidth(content) > innerWidth
				? truncateToWidth(content, innerWidth, "", true)
				: content;
		const pad = Math.max(0, innerWidth - visibleWidth(shown));
		const side = this.#theme.fg("border", BOX.vertical);
		return `${side}${shown}${" ".repeat(pad)}${side}`;
	}

	render(width: number): string[] {
		const innerWidth = Math.max(20, width - 2);
		const viewport = Math.max(7, Math.floor(this.#tui.terminal.rows * 0.7));
		// Chrome: top, title, separator, separator, hint, bottom, plus the filter row while filtering.
		const chrome = 6 + (this.#filter ? 1 : 0);
		const rows = Math.max(1, viewport - chrome);
		// A scrolled list adds one status line, so leave room for it whenever the list can scroll.
		const visible = this.#options.length <= rows ? rows : Math.max(1, rows - 1);
		if (visible !== this.#maxVisible) {
			this.#maxVisible = visible;
			this.#list = this.#buildList(this.#list.getSelectedItem()?.value);
		}
		const shown = this.#list.render(innerWidth - 1).slice(0, rows);
		return [
			this.#edge(BOX.topLeft, BOX.topRight, innerWidth),
			this.#row(` ${this.#theme.fg("accent", this.#title)}`, innerWidth),
			this.#edge("\u251c", "\u2524", innerWidth),
			...(this.#filter
				? [
						this.#row(
							this.#theme.fg("muted", ` filter: ${this.#filter}`),
							innerWidth,
						),
					]
				: []),
			...shown.map((line) => this.#row(` ${line}`, innerWidth)),
			this.#edge("\u251c", "\u2524", innerWidth),
			this.#row(` ${this.#theme.fg("dim", HINT_TEXT)}`, innerWidth),
			this.#edge(BOX.bottomLeft, BOX.bottomRight, innerWidth),
		];
	}
}

/** The slice of pi's `Theme` the picker paints with. Structural so tests can supply a stub. */
export interface ClassifierPickerTheme {
	fg(color: string, text: string): string;
}

/** Open the picker as a centered overlay; resolves undefined outside TUI mode or with no options. */
export async function showClassifierPicker(
	ctx: ExtensionCommandContext,
	config: ClassifierPickerConfig,
): Promise<string | undefined> {
	if (ctx.mode !== "tui" || config.options.length === 0) return undefined;
	return ctx.ui.custom<string | undefined>(
		(tui, theme, keybindings, done) =>
			new ClassifierPickerComponent(
				tui,
				theme,
				getSelectListTheme(),
				config,
				done,
				keybindings,
			),
		{
			overlay: true,
			overlayOptions: {
				anchor: "center",
				width: "90%",
				minWidth: 50,
				maxHeight: "70%",
				margin: 1,
			},
		},
	);
}
