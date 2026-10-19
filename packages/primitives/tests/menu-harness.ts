// Shared helpers for the menu suites. Not a `.test.ts` file, so it is typechecked but not
// run on its own. Every suite builds the real MenuComponent against this fake theme, whose
// escapes are real SGR codes so visibleWidth()/truncateToWidth() behave as with pi's theme.
import type {
	KeybindingsConfig,
	KeybindingsManager,
} from "@earendil-works/pi-tui";
import { MenuComponent } from "../src/menu/component.js";
import type {
	MenuConfig,
	MenuResult,
	MenuTheme,
	MenuTui,
	MenuValue,
} from "../src/menu/types.js";

export type Values = Record<string, MenuValue>;
export type Result = MenuResult<Values>;

/** Raw terminal input for each physical key the forks matched. */
export const KEY = Object.freeze({
	up: "\x1b[A",
	down: "\x1b[B",
	pageUp: "\x1b[5~",
	pageDown: "\x1b[6~",
	left: "\x1b[D",
	right: "\x1b[C",
	space: " ",
	enter: "\r",
	escape: "\x1b",
	ctrlC: "\x03",
	ctrlS: "\x13",
	tab: "\t",
	shiftTab: "\x1b[Z",
	backspace: "\x7f",
	delete: "\x1b[3~",
});

/** A digit as the kitty keyboard protocol sends it (CSI u with the code point). */
export function kittyDigit(digit: number): string {
	return `\x1b[${48 + digit}u`;
}

export const FG: Readonly<Record<string, string>> = Object.freeze({
	accent: "\x1b[36m",
	success: "\x1b[32m",
	error: "\x1b[31m",
	muted: "\x1b[90m",
	dim: "\x1b[2m",
	text: "\x1b[39m",
	border: "\x1b[37m",
});
export const BG: Readonly<Record<string, string>> = Object.freeze({
	selectedBg: "\x1b[48;5;238m",
});
export const RESET = "\x1b[0m";

/** Emits a reset after every span, which is what makes the re-opened-background case real. */
export function fakeTheme(): MenuTheme {
	return {
		fg: (color, text) => `${FG[color] ?? ""}${text}${RESET}`,
		bg: (color, text) => `${BG[color] ?? ""}${text}${RESET}`,
		bold: (text) => `\x1b[1m${text}${RESET}`,
		getBgAnsi: (color) => BG[color] ?? "",
	};
}

export function stripAnsi(text: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping SGR escapes
	const noSgr = text.replace(/\x1b\[[0-9;]*m/g, "");
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping OSC 8 hyperlinks
	return noSgr.replace(/\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
}

/** Let every pending promise continuation run. */
export function flush(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

/** Press keys in order, letting async handlers settle between them. */
export async function press(
	menu: MenuComponent<Values>,
	...keys: string[]
): Promise<void> {
	for (const key of keys) {
		menu.handleInput(key);
		await flush();
	}
}

export function type(menu: MenuComponent<Values>, text: string): void {
	for (const char of text) menu.handleInput(char);
}

export interface FakeTui extends MenuTui {
	terminal: { rows: number };
	renders: number;
}

export function fakeTui(rows = 24): FakeTui {
	const tui: FakeTui = {
		terminal: { rows },
		renders: 0,
		requestRender() {
			tui.renders++;
		},
	};
	return tui;
}

/** What `ctx.ui.custom` hands a factory: the host's manager, reduced to its user bindings. */
export function fakeHost(bindings: KeybindingsConfig = {}): {
	getUserBindings(): KeybindingsConfig;
} {
	return { getUserBindings: () => ({ ...bindings }) };
}

export function baseConfig(): MenuConfig<Values> {
	return {
		title: "TEST",
		sections: [
			{
				title: "S1",
				items: [
					{ kind: "toggle", id: "a", label: "Item A", value: true },
					{ kind: "toggle", id: "b", label: "Item B", value: false },
				],
			},
			{
				title: "S2",
				items: [{ kind: "toggle", id: "c", label: "Item C", value: true }],
			},
		],
	};
}

export interface Made {
	menu: MenuComponent<Values>;
	results: Result[];
}

export function makeMenu(
	overrides: Partial<MenuConfig<Values>> = {},
	options: { tui?: MenuTui; keys?: KeybindingsManager } = {},
): Made {
	const results: Result[] = [];
	const menu = new MenuComponent<Values>(
		{ ...baseConfig(), ...overrides },
		fakeTheme(),
		(result) => results.push(result),
		options.tui,
		options.keys,
	);
	return { menu, results };
}

export function plain(menu: MenuComponent<Values>, width = 64): string[] {
	return menu.render(width).map(stripAnsi);
}

export function selectedLine(menu: MenuComponent<Values>, width = 64): string {
	return plain(menu, width).find((line) => line.includes("❯")) ?? "";
}

export function lineWith(
	menu: MenuComponent<Values>,
	text: string,
	width = 64,
): string {
	return plain(menu, width).find((line) => line.includes(text)) ?? "";
}

/** The raw (styled) line containing `text`. */
export function styledLineWith(
	menu: MenuComponent<Values>,
	text: string,
	width = 64,
): string {
	return (
		menu.render(width).find((line) => stripAnsi(line).includes(text)) ?? ""
	);
}
