import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	getKeybindings,
	type KeybindingsManager,
	type SelectListTheme,
	type TUI,
	visibleWidth,
} from "@earendil-works/pi-tui";
import {
	type ClassifierOption,
	ClassifierPickerComponent,
	classifierPickerOptions,
	showClassifierPicker,
} from "../src/classifier/picker.js";
import { fakeTheme, jevModel, KEY, stripAnsi } from "./classifier-harness.js";

function fakeSelectTheme(): SelectListTheme {
	const identity = (text: string) => text;
	return {
		selectedPrefix: identity,
		selectedText: identity,
		description: identity,
		scrollInfo: identity,
		noMatch: identity,
	};
}

const local = {
	...jevModel,
	provider: "local",
	id: "jev-local",
	api: "llama-cpp-classify",
};

function makePicker(
	options: ClassifierOption[],
	selected: string | undefined,
	onDone: (value: string | undefined) => void,
	rows = 40,
): ClassifierPickerComponent {
	const tui = {
		terminal: { rows, columns: 100 },
		requestRender: () => {},
	} as unknown as TUI;
	return new ClassifierPickerComponent(
		tui,
		fakeTheme(),
		fakeSelectTheme(),
		{ title: "Pick the classifier model", options, selected },
		onDone,
	);
}

test("classifierPickerOptions lists auto, every classifier with its API, and an unavailable pinned model", () => {
	const options = classifierPickerOptions(
		[jevModel, local],
		"typesafe/jev-latest",
		"gone/model",
	);
	assert.deepEqual(options, [
		{
			value: "auto",
			label: "auto",
			description: "first configured Jev model: typesafe/jev-latest",
		},
		{
			value: "typesafe/jev-latest",
			label: "typesafe/jev-latest",
			description: "typesafe-system-one",
		},
		{
			value: "local/jev-local",
			label: "local/jev-local",
			description: "llama-cpp-classify",
		},
		{ value: "gone/model", label: "gone/model", description: "unavailable" },
	]);
	assert.equal(
		classifierPickerOptions([], undefined, "auto")[0]?.description,
		"no Jev model has credentials",
	);
	assert.equal(
		classifierPickerOptions(
			[jevModel],
			"typesafe/jev-latest",
			"typesafe/jev-latest",
		).length,
		2,
		"an available pin is not repeated",
	);
});

test("the picker starts on the selected value, filters by typing, and Backspace edits the filter", () => {
	const options = classifierPickerOptions(
		[jevModel, local],
		undefined,
		"local/jev-local",
	);
	let picked: string | undefined;
	const picker = makePicker(options, "local/jev-local", (value) => {
		picked = value;
	});
	picker.handleInput(KEY.enter);
	assert.equal(picked, "local/jev-local");

	const filtered = makePicker(options, "auto", (value) => {
		picked = value;
	});
	filtered.handleInput("l");
	filtered.handleInput("o");
	filtered.handleInput("c");
	const text = stripAnsi(filtered.render(80).join("\n"));
	assert.match(text, /filter: loc/);
	assert.ok(
		text.includes("local/jev-local") && !text.includes("typesafe/jev-latest"),
	);
	filtered.handleInput(KEY.backspace);
	filtered.handleInput(KEY.backspace);
	filtered.handleInput(KEY.backspace);
	const cleared = stripAnsi(filtered.render(80).join("\n"));
	assert.ok(
		!cleared.includes("filter:") && cleared.includes("typesafe/jev-latest"),
	);
});

test("an injected keybindings manager decides which key edits the filter", () => {
	const options = classifierPickerOptions([jevModel, local], undefined, "auto");
	const tui = {
		terminal: { rows: 40, columns: 100 },
		requestRender: () => {},
	} as unknown as TUI;
	const make = (keybindings: KeybindingsManager): ClassifierPickerComponent =>
		new ClassifierPickerComponent(
			tui,
			fakeTheme(),
			fakeSelectTheme(),
			{ title: "t", options },
			() => {},
			keybindings,
		);

	const bound = make(getKeybindings());
	bound.handleInput("l");
	assert.match(stripAnsi(bound.render(80).join("\n")), /filter: l/);
	bound.handleInput(KEY.backspace);
	assert.doesNotMatch(stripAnsi(bound.render(80).join("\n")), /filter:/);

	// A manager that matches nothing leaves the key to the list, so a host that
	// owns backspace for something else keeps its filter intact.
	const inert = { matches: () => false } as unknown as KeybindingsManager;
	const picker = make(inert);
	picker.handleInput("l");
	picker.handleInput(KEY.backspace);
	assert.match(stripAnsi(picker.render(80).join("\n")), /filter: l/);
});

test("arrows move, Enter selects, and Escape cancels", () => {
	const options = classifierPickerOptions([jevModel, local], undefined, "auto");
	let picked: string | undefined = "unset";
	const picker = makePicker(options, "auto", (value) => {
		picked = value;
	});
	picker.handleInput(KEY.down);
	picker.handleInput(KEY.enter);
	assert.equal(picked, "typesafe/jev-latest");
	picker.handleInput(KEY.escape);
	assert.equal(picked, undefined);
});

test("long provider/model names are fully visible when the picker has room", () => {
	const label = "openrouter-work/~perplexity/pplx-decode";
	const picker = makePicker(
		[{ value: label, label, description: "typesafe-system-one" }],
		label,
		() => {},
	);
	const wide = stripAnsi(picker.render(200).join("\n"));
	assert.ok(wide.includes(label));
	assert.ok(wide.includes("typesafe-system-one"));

	const narrow = stripAnsi(picker.render(30).join("\n"));
	assert.ok(
		!narrow.includes(label),
		"narrow terminals still truncate labels rather than overflow",
	);
});

test("frame width and line budget hold on short and narrow terminals", () => {
	const many = Array.from({ length: 40 }, (_, index) => ({
		...jevModel,
		id: `m-${index}`,
	}));
	const options = classifierPickerOptions(many, undefined, "auto");
	for (const rows of [8, 12, 24, 60]) {
		const picker = makePicker(options, "typesafe/m-30", () => {}, rows);
		for (const width of [30, 80, 200]) {
			const lines = picker.render(width).map(stripAnsi);
			assert.ok(
				lines.length <= Math.max(7, Math.floor(rows * 0.7)),
				`rows=${rows}, width=${width}`,
			);
			assert.ok(
				lines.every((line) => visibleWidth(line) === width),
				`rows=${rows}, width=${width}`,
			);
		}
	}
});

test("showClassifierPicker skips non-TUI and empty contexts and opens an overlay otherwise", async () => {
	const never = {
		mode: "print",
		ui: { custom: () => assert.fail("must not open") },
	} as unknown as ExtensionCommandContext;
	assert.equal(
		await showClassifierPicker(never, {
			title: "t",
			options: classifierPickerOptions([], undefined, "auto"),
		}),
		undefined,
	);
	const empty = {
		mode: "tui",
		ui: { custom: () => assert.fail("must not open") },
	} as unknown as ExtensionCommandContext;
	assert.equal(
		await showClassifierPicker(empty, { title: "t", options: [] }),
		undefined,
	);

	let overlay: unknown;
	const tui = {
		mode: "tui",
		ui: {
			async custom(_factory: unknown, options: unknown) {
				overlay = options;
				return "auto";
			},
		},
	} as unknown as ExtensionCommandContext;
	assert.equal(
		await showClassifierPicker(tui, {
			title: "t",
			options: classifierPickerOptions([], undefined, "auto"),
		}),
		"auto",
	);
	assert.deepEqual(overlay, {
		overlay: true,
		overlayOptions: {
			anchor: "center",
			width: "90%",
			minWidth: 50,
			maxHeight: "70%",
			margin: 1,
		},
	});
});
