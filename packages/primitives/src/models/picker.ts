import type { ThemeBg, ThemeColor } from "@earendil-works/pi-coding-agent";
import {
	decodeKittyPrintable,
	fuzzyFilter,
	Key,
	type KeyId,
	matchesKey,
	type SelectItem,
	SelectList,
	type SelectListTheme,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { MODEL_LIST_LAYOUT, modelThinkingPaneWidths } from "./label.js";
import {
	type ModelRef,
	modelRefLabel,
	parseRef,
	THINKING_LEVELS,
	type ThinkingLevel,
} from "./refs.js";

export interface ModelPickerTheme {
	fg(color: ThemeColor, text: string): string;
	bg(color: ThemeBg, text: string): string;
	bold(text: string): string;
}

export interface TwoPaneModelThinkingOptions<L extends string = ThinkingLevel> {
	theme: ModelPickerTheme;
	refs: readonly ModelRef[];
	levelOptions(ref: ModelRef): readonly L[];
	preferredLevel?(
		ref: ModelRef,
		options: readonly L[],
		previous: L | undefined,
	): L | undefined;
	filter?: typeof fuzzyFilter;
	printable?(data: string): string | undefined;
	backKeys?: readonly KeyId[];
	maxVisibleRows?: number;
	requestRender?(): void;
	selectTheme?: SelectListTheme;
	highlightSelectedRow?: boolean;
	marker?: string;
	itemLabel?(ref: ModelRef): string;
	modelPaneTitle?: string;
	levelPaneTitle?: string;
	levelWidthLabels?: readonly string[];
	defaultRef?: ModelRef;
	defaultLevel?: L;
}

const SELECTED_ROW_SENTINEL = "\u0000";

/** Decode text before validating: pi-tui also decodes DEL/C1 CSI-u payloads. */
function defaultPrintable(data: string): string | undefined {
	const text = decodeKittyPrintable(data) ?? data;
	if (!text) return undefined;
	for (const char of text) {
		const point = char.codePointAt(0);
		if (point === undefined || point < 0x20 || (point >= 0x7f && point <= 0x9f))
			return undefined;
	}
	return text;
}

function column(text: string, width: number): string {
	return truncateToWidth(text, Math.max(0, width), "", true);
}

/** Unframed model/level body. Registry policy and render scheduling belong to the host. */
export class TwoPaneModelThinking<L extends string = ThinkingLevel> {
	private readonly options: TwoPaneModelThinkingOptions<L>;
	private readonly theme: ModelPickerTheme;
	private readonly selectTheme: SelectListTheme;
	private readonly modelItems: SelectItem[];
	private modelList: SelectList;
	private levelList: SelectList;
	private levels: L[] = [];
	private filter = "";
	private activePane: "model" | "level" | "buttons" = "model";
	private activeButton = 0;
	private maxVisibleRows: number;
	private rowCount = 0;

	constructor(options: TwoPaneModelThinkingOptions<L>) {
		this.options = options;
		this.theme = options.theme;
		const theme = options.selectTheme ?? {
			selectedPrefix: (text: string) => this.theme.fg("accent", text),
			selectedText: (text: string) => this.theme.fg("accent", text),
			description: (text: string) => this.theme.fg("muted", text),
			scrollInfo: (text: string) => this.theme.fg("muted", text),
			noMatch: (text: string) => this.theme.fg("muted", text),
		};
		this.selectTheme = {
			...theme,
			selectedText: (text) =>
				SELECTED_ROW_SENTINEL +
				theme.selectedText(text) +
				SELECTED_ROW_SENTINEL,
		};
		this.modelItems = options.refs.map((ref) => ({
			value: modelRefLabel(ref),
			label: (options.itemLabel ?? modelRefLabel)(ref),
		}));
		this.maxVisibleRows = Math.max(1, Math.floor(options.maxVisibleRows ?? 10));
		this.modelList = new SelectList([], 1, this.selectTheme);
		this.levelList = new SelectList([], 1, this.selectTheme);
		// Construction is not a mutation the host must repaint for, and its
		// requestRender closure may read fields assigned after this returns.
		this.applyReset(options.defaultRef, options.defaultLevel);
	}

	reset(defaultRef?: ModelRef, defaultLevel?: L): void {
		this.applyReset(defaultRef, defaultLevel);
		this.options.requestRender?.();
	}

	private applyReset(defaultRef?: ModelRef, defaultLevel?: L): void {
		this.filter = "";
		this.activePane = "model";
		this.activeButton = 0;
		this.rebuildModelList(defaultRef && modelRefLabel(defaultRef));
		this.rebuildLevelList(defaultLevel);
		if (defaultLevel !== undefined) this.selectLevel(defaultLevel);
	}

	/** Cap the complete body, including filter, header and scroll indicators. */
	setMaxVisibleRows(limit: number): void {
		const next = Math.max(1, Math.floor(limit));
		if (next === this.maxVisibleRows) return;
		this.maxVisibleRows = next;
		const level = this.selectedLevel();
		this.rebuildPreservingSelection();
		if (level !== undefined) this.selectLevel(level);
		this.options.requestRender?.();
	}

	private listItemRows(itemCount: number): number {
		const chromeRows = 1 + (this.filter ? 1 : 0);
		const available = Math.max(1, this.maxVisibleRows - chromeRows);
		// Reserve scroll information at equality too, keeping item caps expressible
		// without cropping SelectList's selection-centered viewport after render.
		return itemCount >= available ? Math.max(1, available - 1) : available;
	}

	private rebuildModelList(selected?: string): void {
		const items = this.filter.trim()
			? (this.options.filter ?? fuzzyFilter)(
					[...this.modelItems],
					this.filter,
					(item) => item.label,
				)
			: this.modelItems;
		this.rowCount = items.length;
		this.modelList = new SelectList(
			items,
			Math.min(Math.max(items.length, 1), this.listItemRows(items.length)),
			this.selectTheme,
			MODEL_LIST_LAYOUT,
		);
		const index = items.findIndex((item) => item.value === selected);
		if (index >= 0) this.modelList.setSelectedIndex(index);
		this.modelList.onSelectionChange = () =>
			this.rebuildLevelList(this.selectedLevel());
	}

	private selectedLevel(): L | undefined {
		const value = this.levelList.getSelectedItem()?.value;
		return this.levels.find((level) => level === value);
	}

	private selectLevel(level: L): void {
		const index = this.levels.indexOf(level);
		if (index >= 0) this.levelList.setSelectedIndex(index);
	}

	private rebuildLevelList(previous?: L): void {
		const key = this.modelList.getSelectedItem()?.value;
		const ref = key === undefined ? undefined : parseRef(key);
		this.levels = ref ? [...this.options.levelOptions(ref)] : [];
		const items = this.levels.map((level) => ({ value: level, label: level }));
		this.levelList = new SelectList(
			items,
			Math.min(Math.max(items.length, 1), this.listItemRows(items.length)),
			this.selectTheme,
		);
		if (!ref) return;
		const preferred = this.options.preferredLevel
			? this.options.preferredLevel(ref, [...this.levels], previous)
			: previous !== undefined && this.levels.includes(previous)
				? previous
				: this.levels[0];
		if (preferred !== undefined) this.selectLevel(preferred);
	}

	private rebuildPreservingSelection(): void {
		const model = this.modelList.getSelectedItem()?.value;
		const level = this.selectedLevel();
		this.rebuildModelList(model);
		this.rebuildLevelList(level);
	}

	handleInput(data: string): "confirm" | "back" | undefined {
		if (
			(this.options.backKeys ?? [Key.escape]).some((key) =>
				matchesKey(data, key),
			)
		)
			return "back";
		if (matchesKey(data, Key.tab)) {
			this.activePane =
				this.activePane === "model"
					? "level"
					: this.activePane === "level"
						? "buttons"
						: "model";
			this.options.requestRender?.();
			return undefined;
		}
		if (matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
			if (this.activePane === "buttons")
				this.activeButton = this.activeButton === 0 ? 1 : 0;
			else this.activePane = this.activePane === "model" ? "level" : "model";
			this.options.requestRender?.();
			return undefined;
		}
		if (matchesKey(data, Key.enter)) {
			if (this.activePane === "buttons" && this.activeButton === 1)
				return "back";
			return this.selection() ? "confirm" : undefined;
		}
		// Editing owns text from every pane, including the action bar.
		if (matchesKey(data, Key.backspace)) {
			const changed = this.activePane !== "model" || this.filter.length > 0;
			this.activePane = "model";
			this.filter = [...this.filter].slice(0, -1).join("");
			if (changed) {
				this.rebuildPreservingSelection();
				this.options.requestRender?.();
			}
			return undefined;
		}
		const printable = (this.options.printable ?? defaultPrintable)(data);
		if (printable) {
			this.activePane = "model";
			this.filter += printable;
			this.rebuildPreservingSelection();
			this.options.requestRender?.();
			return undefined;
		}
		if (this.activePane === "buttons") return undefined;
		const list = this.activePane === "model" ? this.modelList : this.levelList;
		const before = list.getSelectedItem();
		const previousLevel = this.selectedLevel();
		list.handleInput(data);
		if (
			list.getSelectedItem() !== before ||
			this.selectedLevel() !== previousLevel
		)
			this.options.requestRender?.();
		return undefined;
	}

	selection(): { ref: ModelRef; thinking: L } | undefined {
		const model = this.modelList.getSelectedItem();
		const thinking = this.selectedLevel();
		return model && thinking !== undefined
			? { ref: parseRef(model.value), thinking }
			: undefined;
	}

	getSelected(): { ref: ModelRef; thinking: L } {
		const selected = this.selection();
		if (!selected)
			throw new Error(
				"Cannot confirm an empty model or thinking-level selection",
			);
		return selected;
	}

	/** Detached state; rowCount is the number of models matching the current filter. */
	snapshot(): {
		filter: string;
		pane: "model" | "level" | "buttons";
		activeButton: number;
		ref: ModelRef | undefined;
		thinking: L | undefined;
		levelOptions: L[];
		rowCount: number;
	} {
		const key = this.modelList.getSelectedItem()?.value;
		return {
			filter: this.filter,
			pane: this.activePane,
			activeButton: this.activeButton,
			ref: key === undefined ? undefined : parseRef(key),
			thinking: this.selectedLevel(),
			levelOptions: [...this.levels],
			rowCount: this.rowCount,
		};
	}

	render(bodyWidth: number): string[] {
		const { left, right } = modelThinkingPaneWidths(bodyWidth, {
			levelWidthLabels: this.options.levelWidthLabels ?? THINKING_LEVELS,
			levelPaneTitle: this.options.levelPaneTitle,
			marker: this.options.marker,
		});
		const divider = this.theme.fg("border", "│");
		const title = (text: string, pane: "model" | "level") =>
			this.theme.bold(
				this.activePane === pane
					? this.theme.fg("accent", ` ${text}`)
					: ` ${text}`,
			);
		const lines = [
			...(this.filter
				? [column(this.theme.fg("muted", ` filter: ${this.filter}`), bodyWidth)]
				: []),
			column(title(this.options.modelPaneTitle ?? "Models", "model"), left) +
				divider +
				column(
					title(this.options.levelPaneTitle ?? "Thinking", "level"),
					right,
				),
		];
		const modelLines = this.modelList.render(Math.max(1, left - 1));
		const levelLines = this.levelList.render(Math.max(1, right - 1));
		const cell = (line: string, width: number, pane: "model" | "level") => {
			const selected = line.startsWith(SELECTED_ROW_SENTINEL);
			let text = line.replaceAll(SELECTED_ROW_SENTINEL, "");
			if (selected) {
				// Only replace SelectList's leading prefix, never arrows inside a label.
				text = text.replace(
					// biome-ignore lint/suspicious/noControlCharactersInRegex: leading SGR sequences
					/^((?:\x1b\[[0-9;]*m)*)→ /,
					(_match, sgr: string) => sgr + (this.options.marker ?? "> "),
				);
			}
			const padded = column(` ${text}`, width);
			return selected &&
				this.activePane === pane &&
				(this.options.highlightSelectedRow ?? true)
				? this.theme.bg("selectedBg", padded)
				: padded;
		};
		for (
			let index = 0;
			index < Math.max(modelLines.length, levelLines.length);
			index++
		) {
			lines.push(
				cell(modelLines[index] ?? "", left, "model") +
					divider +
					cell(levelLines[index] ?? "", right, "level"),
			);
		}
		// A truncation hook can overrun a tiny budget; the body boundary is authoritative.
		return lines
			.slice(0, this.maxVisibleRows)
			.map((line) => column(line, bodyWidth));
	}

	renderFooter(
		bodyWidth: number,
		hints: string,
	): { actionRow: string; hintRows: string[] } {
		const button = (label: string, index: number) => {
			const active = this.activeButton === index;
			const text = active ? `[ ${label} ]` : `‹ ${label} ›`;
			return active && this.activePane === "buttons"
				? this.theme.bold(this.theme.fg("accent", text))
				: this.theme.fg("muted", text);
		};
		const actions = `${button("Select", 0)}    ${button("Cancel", 1)}`;
		return {
			actionRow: column(
				" ".repeat(Math.max(0, bodyWidth - visibleWidth(actions) - 2)) +
					actions +
					"  ",
				bodyWidth,
			),
			hintRows: wrapTextWithAnsi(hints, Math.max(1, bodyWidth)).map((line) =>
				column(this.theme.fg("dim", line), bodyWidth),
			),
		};
	}

	invalidate(): void {
		this.modelList.invalidate();
		this.levelList.invalidate();
	}
}
