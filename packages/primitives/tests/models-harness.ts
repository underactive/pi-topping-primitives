import type { Api, Model } from "@earendil-works/pi-ai";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { CatalogueRegistry } from "../src/models/catalogue.js";
import type {
	ModelPickerTheme,
	TwoPaneModelThinking,
} from "../src/models/picker.js";

export const KEY = Object.freeze({
	up: "\x1b[A",
	down: "\x1b[B",
	left: "\x1b[D",
	right: "\x1b[C",
	enter: "\r",
	escape: "\x1b",
	ctrlC: "\x03",
	tab: "\t",
	backspace: "\x7f",
});

export function kittyDigit(digit: number): string {
	return `\x1b[${48 + digit}u`;
}

export function stripAnsi(text: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping real SGR codes
	return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Real SGR styles exercise pi-tui's width accounting without a global theme. */
export function fakeTheme(bgWidths: number[] = []): ModelPickerTheme {
	return {
		fg: (color, text) => {
			const code = color === "accent" ? 36 : color === "dim" ? 2 : 90;
			return `\x1b[${code}m${text}\x1b[0m`;
		},
		bg: (_color, text) => {
			bgWidths.push(visibleWidth(text));
			return `\x1b[48;5;236m${text}\x1b[49m`;
		},
		bold: (text) => `\x1b[1m${text}\x1b[22m`,
	};
}

export function renderPicker<L extends string>(
	picker: TwoPaneModelThinking<L>,
	width = 80,
): string {
	return picker.render(width).map(stripAnsi).join("\n");
}

/** Full pi model fixtures, with the same reasoning/map inputs as moa-fusion's oracle. */
export function fakeRegistry(
	models: readonly (Pick<Model<Api>, "provider" | "id"> &
		Partial<Model<Api>>)[],
): CatalogueRegistry & { calls: { available: number } } {
	const available: Model<Api>[] = models.map((model) => ({
		name: model.id,
		api: "openai-completions",
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8192,
		maxTokens: 1024,
		...model,
	}));
	const calls = { available: 0 };
	return {
		calls,
		getAvailable() {
			calls.available++;
			return available;
		},
	};
}
