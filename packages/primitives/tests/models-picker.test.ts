import assert from "node:assert/strict";
import { test } from "node:test";
import {
	Key,
	type SelectListTheme,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { registryLevelOptions } from "../src/models/catalogue.js";
import { fuzzyRanked } from "../src/models/filter.js";
import { modelThinkingPaneWidths } from "../src/models/label.js";
import {
	TwoPaneModelThinking,
	type TwoPaneModelThinkingOptions,
} from "../src/models/picker.js";
import {
	COMMON_THINKING_LEVELS,
	type ModelRef,
	modelRefLabel,
	THINKING_LEVELS,
	type ThinkingLevel,
} from "../src/models/refs.js";
import { defaultThinkingForModel } from "../src/models/thinking.js";
import {
	fakeRegistry,
	fakeTheme,
	KEY,
	renderPicker,
	stripAnsi,
} from "./models-harness.js";

const REFS: readonly ModelRef[] = Object.freeze([
	Object.freeze({ provider: "anthropic", id: "claude-opus-4" }),
	Object.freeze({ provider: "openai", id: "gpt-4o" }),
]);

function makePicker(options: Partial<TwoPaneModelThinkingOptions> = {}) {
	return new TwoPaneModelThinking({
		theme: fakeTheme(),
		refs: REFS,
		levelOptions: () => COMMON_THINKING_LEVELS,
		defaultLevel: "medium",
		...options,
	});
}

function press(picker: TwoPaneModelThinking, ...keys: string[]) {
	for (const key of keys) picker.handleInput(key);
}

function exactWidths(lines: string[], width: number) {
	for (const line of lines)
		assert.equal(visibleWidth(line), width, JSON.stringify({ width, line }));
}

test("M-07 Select button confirms the default model and level", () => {
	const picker = makePicker();
	press(picker, KEY.tab, KEY.tab);
	assert.equal(picker.handleInput(KEY.enter), "confirm");
	assert.deepEqual(picker.getSelected(), { ref: REFS[0], thinking: "medium" });
});

test("M-08 model arrow selection carries into getSelected", () => {
	const picker = makePicker();
	press(picker, KEY.down, KEY.tab, KEY.tab);
	assert.equal(picker.handleInput(KEY.enter), "confirm");
	assert.deepEqual(picker.getSelected().ref, REFS[1]);
});

test("M-09 level arrow selection carries into getSelected", () => {
	const picker = makePicker();
	press(picker, KEY.tab, KEY.down, KEY.tab);
	assert.equal(picker.handleInput(KEY.enter), "confirm");
	assert.equal(picker.getSelected().thinking, "high");
});

test("M-07 Escape backs out from every pane, with or without a filter", () => {
	for (const tabs of [0, 1, 2]) {
		for (const query of ["", "gpt"]) {
			const picker = makePicker();
			if (query) picker.handleInput(query);
			for (let i = 0; i < tabs; i++) picker.handleInput(KEY.tab);
			const before = picker.snapshot();
			assert.equal(picker.handleInput(KEY.escape), "back");
			assert.deepEqual(picker.snapshot(), before);
		}
	}
});

test("M-07 Cancel returns back and arrows toggle both buttons", () => {
	const picker = makePicker();
	press(picker, KEY.tab, KEY.tab, KEY.right);
	assert.equal(picker.snapshot().activeButton, 1);
	assert.equal(picker.handleInput(KEY.enter), "back");
	picker.handleInput(KEY.left);
	assert.equal(picker.snapshot().activeButton, 0);
	assert.equal(picker.handleInput(KEY.enter), "confirm");
});

test("moa Tab cycles models, levels, buttons, models; physical arrows switch panes", () => {
	const picker = makePicker();
	for (const pane of ["level", "buttons", "model"]) {
		picker.handleInput(KEY.tab);
		assert.equal(picker.snapshot().pane, pane);
	}
	picker.handleInput(KEY.left);
	assert.equal(picker.snapshot().pane, "level");
	picker.handleInput(KEY.right);
	assert.equal(picker.snapshot().pane, "model");
});

test("Enter on either list pane confirms without visiting the buttons", () => {
	const picker = makePicker();
	assert.equal(picker.handleInput(KEY.enter), "confirm");
	picker.handleInput(KEY.tab);
	assert.equal(picker.handleInput(KEY.enter), "confirm");
});

test("M-12 typing narrows models and code-point backspace restores them", () => {
	const picker = makePicker();
	assert.match(renderPicker(picker), /claude-opus-4/);
	picker.handleInput("gpt");
	assert.doesNotMatch(renderPicker(picker), /claude-opus-4/);
	assert.match(renderPicker(picker), /gpt-4o/);
	press(picker, KEY.backspace, KEY.backspace, KEY.backspace);
	assert.match(renderPicker(picker), /claude-opus-4/);
	picker.handleInput("界😀");
	picker.handleInput(KEY.backspace);
	assert.equal(picker.snapshot().filter, "界");
	picker.handleInput("\b");
	assert.equal(picker.snapshot().filter, "");
});

test("filter editing retargets models from ANY pane, including Cancel", () => {
	for (const tabs of [0, 1, 2]) {
		const picker = makePicker();
		for (let i = 0; i < tabs; i++) picker.handleInput(KEY.tab);
		if (tabs === 2) picker.handleInput(KEY.right);
		picker.handleInput("gpt");
		assert.equal(picker.snapshot().pane, "model");
		assert.equal(picker.snapshot().filter, "gpt");
		for (let i = 0; i < tabs; i++) picker.handleInput(KEY.tab);
		picker.handleInput(KEY.backspace);
		assert.equal(picker.snapshot().pane, "model");
		assert.equal(picker.snapshot().filter, "gp");
	}
});

test("backspace retargets an empty filter from levels and buttons", () => {
	for (const tabs of [1, 2]) {
		const picker = makePicker();
		for (let i = 0; i < tabs; i++) picker.handleInput(KEY.tab);
		picker.handleInput(KEY.backspace);
		assert.equal(picker.snapshot().pane, "model");
		assert.equal(picker.snapshot().filter, "");
	}
});

test("filter preserves the selected ref when it still matches, even after ranking changes", () => {
	const picker = makePicker({
		refs: [
			{ provider: "a", id: "opus" },
			{ provider: "b", id: "opus-mini" },
		],
		filter: fuzzyRanked,
	});
	picker.handleInput(KEY.down);
	const before = picker.getSelected();
	picker.handleInput("opus");
	assert.deepEqual(picker.getSelected(), before);
	picker.handleInput(KEY.backspace);
	assert.deepEqual(picker.getSelected(), before);
	assert.equal(picker.snapshot().rowCount, 2);
});

test("empty Select is inert in all panes, while Cancel still backs out", () => {
	for (const options of [
		{ refs: [] },
		{ levelOptions: () => [] },
		{},
	] satisfies Partial<TwoPaneModelThinkingOptions>[]) {
		const picker = makePicker(options);
		if (Object.keys(options).length === 0) picker.handleInput("zzzz");
		assert.equal(picker.handleInput(KEY.enter), undefined);
		picker.handleInput(KEY.tab);
		assert.equal(picker.handleInput(KEY.enter), undefined);
		picker.handleInput(KEY.tab);
		assert.equal(picker.handleInput(KEY.enter), undefined);
		picker.handleInput(KEY.right);
		assert.equal(picker.handleInput(KEY.enter), "back");
	}
});

test("getSelected throws the shared empty message while selection is non-throwing", () => {
	for (const picker of [
		makePicker({ refs: [] }),
		makePicker({ levelOptions: () => [] }),
	]) {
		assert.equal(picker.selection(), undefined);
		assert.throws(() => picker.getSelected(), {
			message: "Cannot confirm an empty model or thinking-level selection",
		});
	}
});

test("M-10 every body row is exactly width 4..200, including tiny slash budgets", () => {
	const picker = makePicker({
		refs: [
			{ provider: "openai", id: "accounts/org-1/models/gpt-4o-mini" },
			{ provider: "unicode", id: "界界/😀/model→label" },
		],
	});
	for (let width = 4; width <= 200; width++)
		exactWidths(picker.render(width), width);
	picker.handleInput("gpt");
	for (let width = 4; width <= 200; width++)
		exactWidths(picker.render(width), width);
	picker.handleInput("zzzz");
	for (let width = 4; width <= 200; width++)
		exactWidths(picker.render(width), width);
});

test("M-11 and F-6 footer action and wrapped hint rows fit widths 4..200 without rules", () => {
	const picker = makePicker();
	const hints = "tab move · enter select · a-long-unbroken-hint-token · 界界😀";
	for (let width = 4; width <= 200; width++) {
		const { actionRow, hintRows } = picker.renderFooter(width, hints);
		exactWidths([actionRow, ...hintRows], width);
		assert.ok(hintRows.length > 0);
		assert.doesNotMatch(stripAnsi(actionRow), /─/);
	}
	const footer = picker.renderFooter(80, "tab move · enter select");
	assert.equal(stripAnsi(footer.actionRow).trim(), "[ Select ]    ‹ Cancel ›");
	assert.ok(stripAnsi(footer.actionRow).startsWith(" "));
	assert.ok(footer.hintRows[0]?.includes("\x1b[2m"));
	assert.ok(picker.renderFooter(20, hints).hintRows.length > 1);
});

test("moa inset and smart truncation retain the model name and longest thinking label", () => {
	const picker = makePicker({
		refs: [{ provider: "openai", id: "accounts/org-1/models/gpt-4o-mini" }],
		levelOptions: () => THINKING_LEVELS,
	});
	const text = renderPicker(picker, 45);
	assert.match(text, /^ > .*gpt-4o-mini/m);
	assert.match(text, /minimal/);
	assert.match(text, / Models.*│ Thinking/);
	picker.handleInput("gpt");
	assert.match(renderPicker(picker), /^ filter: gpt/);
});

test("persona marker is normalized and bgWidths is exactly the active pane width", () => {
	const bgWidths: number[] = [];
	const picker = makePicker({ theme: fakeTheme(bgWidths), marker: "❯ " });
	const { left, right } = modelThinkingPaneWidths(50, { marker: "❯ " });
	bgWidths.length = 0;
	let lines = picker.render(50);
	assert.deepEqual(bgWidths, [left]);
	assert.match(lines.map(stripAnsi).join("\n"), /❯ anthropic\/claude-opus-4/);
	assert.match(lines.map(stripAnsi).join("\n"), /│ ❯ medium/);
	assert.ok(!lines.join("").includes("→"));
	assert.ok(!lines.join("").includes("\u0000"));
	picker.handleInput(KEY.right);
	bgWidths.length = 0;
	lines = picker.render(50);
	assert.deepEqual(bgWidths, [right]);
	exactWidths(lines, 50);
	picker.handleInput(KEY.tab);
	bgWidths.length = 0;
	picker.render(50);
	assert.deepEqual(bgWidths, []);
});

test("sentinel detects only selected rows and marker replacement leaves label arrows intact", () => {
	const bgWidths: number[] = [];
	const picker = makePicker({
		theme: fakeTheme(bgWidths),
		marker: "❯ ",
		refs: [
			{ provider: "p", id: "first → label" },
			{ provider: "p", id: "second → label" },
		],
	});
	bgWidths.length = 0;
	const lines = picker.render(100);
	assert.deepEqual(bgWidths, [modelThinkingPaneWidths(100).left]);
	assert.match(lines.map(stripAnsi).join("\n"), /❯ p\/first → label/);
	assert.match(lines.map(stripAnsi).join("\n"), /p\/second → label/);
	assert.ok(!lines.join("").includes("\u0000"));
});

test("highlightSelectedRow false emits no background call", () => {
	const bgWidths: number[] = [];
	const picker = makePicker({
		theme: fakeTheme(bgWidths),
		highlightSelectedRow: false,
	});
	picker.render(80);
	picker.handleInput(KEY.right);
	picker.render(80);
	assert.deepEqual(bgWidths, []);
});

test("Ctrl+C is back only when explicitly supplied, and backKeys run before other input", () => {
	const defaultPicker = makePicker();
	assert.equal(defaultPicker.handleInput(KEY.ctrlC), undefined);
	assert.equal(defaultPicker.snapshot().filter, "");
	const picker = makePicker({ backKeys: [Key.escape, Key.ctrl("c")] });
	for (let i = 0; i < 3; i++) {
		assert.equal(picker.handleInput(KEY.ctrlC), "back");
		picker.handleInput(KEY.tab);
	}
	const overridden = makePicker({ backKeys: [Key.tab, "x"] });
	assert.equal(overridden.handleInput(KEY.tab), "back");
	assert.equal(overridden.handleInput("x"), "back");
	assert.equal(overridden.handleInput(KEY.escape), undefined);
	assert.equal(overridden.snapshot().pane, "model");
	assert.equal(overridden.snapshot().filter, "");
});

test("moa registry-level oracle and stale overrides use only the offered vocabulary", () => {
	const registry = fakeRegistry([
		{ provider: "anthropic", id: "claude-opus-4-6", reasoning: true },
		{
			provider: "openai",
			id: "o5",
			reasoning: true,
			thinkingLevelMap: { xhigh: "xhigh", max: "max" },
		},
		{ provider: "local", id: "tinyllama" },
	]);
	const levelOptions = registryLevelOptions(registry);
	const refs = registry
		.getAvailable()
		.map(({ provider, id }) => ({ provider, id }));
	const overrides = {
		"anthropic/claude-opus-4-6": "max",
		"openai/o5": "max",
		"local/tinyllama": "high",
	} as const;
	const picker = makePicker({
		refs,
		levelOptions,
		preferredLevel: (ref, options) =>
			defaultThinkingForModel(modelRefLabel(ref), overrides, "medium", options),
	});
	picker.reset(refs[0]);
	assert.match(renderPicker(picker), /medium/);
	assert.doesNotMatch(renderPicker(picker), /\bmax\b|\bxhigh\b/);
	assert.deepEqual(picker.getSelected(), { ref: refs[0], thinking: "medium" });
	picker.reset(refs[1]);
	assert.match(renderPicker(picker), /xhigh/);
	assert.match(renderPicker(picker), /max/);
	assert.match(renderPicker(picker), /minimal/);
	assert.deepEqual(picker.getSelected(), { ref: refs[1], thinking: "max" });
	picker.reset(refs[2]);
	assert.doesNotMatch(renderPicker(picker), /\bhigh\b/);
	assert.deepEqual(picker.getSelected(), { ref: refs[2], thinking: "off" });
});

test("splash registry fallback supplies common levels for unknown refs", () => {
	const picker = makePicker({
		levelOptions: registryLevelOptions(fakeRegistry([]), {
			fallback: COMMON_THINKING_LEVELS,
		}),
	});
	assert.deepEqual(picker.snapshot().levelOptions, COMMON_THINKING_LEVELS);
	assert.equal(picker.getSelected().thinking, "medium");
});

test("routesense previous level is retained by default on model changes and filtering", () => {
	const picker = makePicker();
	press(picker, KEY.tab, KEY.down, KEY.left, KEY.down);
	assert.equal(picker.getSelected().thinking, "high");
	assert.deepEqual(picker.getSelected().ref, REFS[1]);
	picker.handleInput("gpt");
	assert.equal(picker.getSelected().thinking, "high");
});

test("default preferred level falls back to first when the previous level is unavailable", () => {
	const picker = makePicker({
		levelOptions: (ref) =>
			ref.provider === "anthropic" ? ["low", "high"] : ["off"],
		defaultLevel: "high",
	});
	assert.equal(picker.getSelected().thinking, "high");
	picker.handleInput(KEY.down);
	assert.equal(picker.getSelected().thinking, "off");
});

test("preferredLevel host override receives previous level and can replace retention", () => {
	const previous: (ThinkingLevel | undefined)[] = [];
	const picker = makePicker({
		preferredLevel: (_ref, options, prior) => {
			previous.push(prior);
			assert.deepEqual(options, COMMON_THINKING_LEVELS);
			return "low";
		},
	});
	picker.handleInput(KEY.down);
	assert.equal(previous.at(-1), "medium");
	assert.equal(picker.getSelected().thinking, "low");
	picker.handleInput("gpt");
	assert.equal(previous.at(-1), "low");
});

test("preferredLevel undefined or unoffered results leave the first offered option selected", () => {
	for (const preferredLevel of [() => undefined, () => "max" as const]) {
		const picker = makePicker({ preferredLevel, defaultLevel: undefined });
		assert.equal(picker.getSelected().thinking, "off");
	}
});

test("reset clears filter/focus and seeds only an offered model and level", () => {
	const picker = makePicker();
	picker.handleInput("gpt");
	press(picker, KEY.tab, KEY.tab, KEY.right);
	picker.reset(REFS[0], "high");
	assert.deepEqual(picker.snapshot(), {
		filter: "",
		pane: "model",
		activeButton: 0,
		ref: REFS[0],
		thinking: "high",
		levelOptions: [...COMMON_THINKING_LEVELS],
		rowCount: 2,
	});
	picker.reset({ provider: "gone", id: "missing" }, "max");
	assert.deepEqual(picker.getSelected(), { ref: REFS[0], thinking: "off" });
});

test("maxVisibleRows caps total body including filter/header/scroll chrome", () => {
	const refs = Array.from({ length: 30 }, (_, i) => ({
		provider: "p",
		id: `model-${i}`,
	}));
	const picker = makePicker({ refs, levelOptions: () => THINKING_LEVELS });
	assert.equal(picker.render(80).length, 10);
	for (const query of ["", "model"]) {
		if (query) picker.handleInput(query);
		for (let limit = 1; limit <= 12; limit++) {
			picker.setMaxVisibleRows(limit);
			assert.ok(picker.render(80).length <= limit);
			if (limit >= 4) assert.equal(picker.render(80).length, limit);
		}
	}
	picker.setMaxVisibleRows(0);
	assert.equal(picker.render(80).length, 1);
	picker.setMaxVisibleRows(4.9);
	assert.equal(picker.render(80).length, 4);
});

test("row budgets reserve scroll information at equality without hiding the selected model", () => {
	for (const filter of ["", "model"]) {
		for (const count of [8, 9, 10]) {
			const refs = Array.from({ length: count }, (_, index) => ({
				provider: "p",
				id: `model-${index}`,
			}));
			const picker = makePicker({
				refs,
				defaultRef: refs.at(-1),
				maxVisibleRows: 10,
			});
			if (filter) picker.handleInput(filter);
			picker.setMaxVisibleRows(10 + (filter ? 1 : 0));
			const lines = picker.render(180).map(stripAnsi);
			const left = lines.map((line) => line.split("│")[0] ?? "");
			assert.equal(left.filter((line) => /model-\d+/.test(line)).length, 8);
			assert.equal(
				left.some((line) => /\(\d+\/\d+\)/.test(line)),
				count >= 9,
			);
			assert.ok(left.some((line) => line.includes(`> p/model-${count - 1}`)));
			assert.deepEqual(picker.getSelected().ref, refs.at(-1));
			assert.ok(lines.length <= 10 + (filter ? 1 : 0));
			exactWidths(picker.render(180), 180);
		}
	}
});

test("equality budgeting keeps the last selected level visible", () => {
	const levels = Array.from({ length: 9 }, (_, index) => `level-${index}`);
	const picker = new TwoPaneModelThinking({
		theme: fakeTheme(),
		refs: REFS.slice(0, 1),
		levelOptions: () => levels,
		levelWidthLabels: levels,
		defaultLevel: "level-8",
		maxVisibleRows: 10,
	});
	picker.handleInput(KEY.tab);
	const right = picker
		.render(100)
		.map(stripAnsi)
		.map((line) => line.split("│")[1] ?? "");
	assert.equal(right.filter((line) => /level-\d+/.test(line)).length, 8);
	assert.ok(right.some((line) => line.includes("> level-8")));
	assert.ok(right.some((line) => line.includes("(9/9)")));
	assert.equal(picker.getSelected().thinking, "level-8");
});

test("setMaxVisibleRows preserves selected model, level, filter and focus", () => {
	const picker = makePicker({
		refs: Array.from({ length: 30 }, (_, i) => ({
			provider: "p",
			id: `model-${i}`,
		})),
	});
	for (let i = 0; i < 20; i++) picker.handleInput(KEY.down);
	picker.handleInput("model");
	press(picker, KEY.tab, KEY.down);
	const before = picker.snapshot();
	for (const limit of [4, 20, 1, 10]) {
		picker.setMaxVisibleRows(limit);
		assert.deepEqual(picker.snapshot(), before);
		assert.ok(picker.render(80).length <= limit);
	}
});

test("setMaxVisibleRows preserves a manually chosen level despite a host preference", () => {
	const picker = makePicker({ preferredLevel: () => "off" });
	press(picker, KEY.tab, KEY.down);
	assert.equal(picker.getSelected().thinking, "high");
	const before = picker.snapshot();
	picker.setMaxVisibleRows(4);
	assert.deepEqual(picker.snapshot(), before);
});

test("requestRender catches level policy changes even when a one-model list wraps to itself", () => {
	let renders = 0;
	const picker = makePicker({
		refs: REFS.slice(0, 1),
		preferredLevel: () => "off",
		requestRender: () => renders++,
	});
	assert.equal(picker.getSelected().thinking, "medium");
	renders = 0;
	picker.handleInput(KEY.down);
	assert.equal(picker.getSelected().thinking, "off");
	assert.equal(renders, 1);
});

test("render-pure default needs no requestRender; rendering and invalidation do not mutate state", () => {
	const picker = makePicker();
	press(picker, KEY.down, KEY.tab, KEY.down, KEY.tab);
	const before = picker.snapshot();
	picker.render(80);
	picker.renderFooter(80, "hints");
	picker.invalidate();
	assert.deepEqual(picker.snapshot(), before);
});

test("requestRender is optional and fires after input mutations, not render or ignored input", () => {
	let renders = 0;
	const picker = makePicker({ requestRender: () => renders++ });
	assert.equal(renders, 0, "construction does not request a render");
	picker.reset();
	assert.equal(renders, 1, "a public reset requests one render");
	renders = 0;
	picker.render(80);
	picker.renderFooter(80, "hints");
	picker.invalidate();
	picker.handleInput(KEY.ctrlC);
	picker.handleInput(KEY.escape);
	picker.handleInput(KEY.enter);
	assert.equal(renders, 0);
	for (const key of [
		KEY.down,
		KEY.tab,
		KEY.down,
		KEY.tab,
		KEY.right,
		"gpt",
		KEY.backspace,
	]) {
		const before: number = renders;
		picker.handleInput(key);
		assert.equal(renders, before + 1);
	}
	picker.setMaxVisibleRows(4);
	const before: number = renders;
	picker.setMaxVisibleRows(4);
	assert.equal(renders, before);
});

test("unset vocabulary is inferred through options, selection, snapshot, reset and policy", () => {
	const vocabulary = ["unset", "deep"] as const;
	const picker = new TwoPaneModelThinking({
		theme: fakeTheme(),
		refs: REFS,
		levelOptions: () => vocabulary,
		preferredLevel: (_ref, options, previous) => {
			const typed: readonly ("unset" | "deep")[] = options;
			const prior: "unset" | "deep" | undefined = previous;
			return prior ?? typed[0];
		},
		levelWidthLabels: vocabulary,
	});
	const inferred: TwoPaneModelThinking<"unset" | "deep"> = picker;
	const thinking: "unset" | "deep" = inferred.getSelected().thinking;
	const selected: "unset" | "deep" | undefined = picker.selection()?.thinking;
	const options: ("unset" | "deep")[] = picker.snapshot().levelOptions;
	assert.equal(thinking, "unset");
	assert.equal(selected, "unset");
	assert.deepEqual(options, vocabulary);
	picker.reset(REFS[1], "deep");
	assert.equal(picker.getSelected().thinking, "deep");
	// @ts-expect-error pi thinking levels must not leak into inferred host vocabulary
	const invalidSeed: Parameters<typeof picker.reset>[1] = "high";
	void invalidSeed;
});

test("selectTheme override is honoured behind the sentinel wrapper", () => {
	const calls: string[] = [];
	const custom: SelectListTheme = {
		selectedPrefix: (text) => text,
		selectedText: (text) => {
			calls.push(text);
			return `\x1b[35m${text}\x1b[39m`;
		},
		description: (text) => text,
		scrollInfo: (text) => `scroll:${text}`,
		noMatch: (text) => `missing:${text}`,
	};
	const bgWidths: number[] = [];
	const picker = makePicker({
		selectTheme: custom,
		theme: fakeTheme(bgWidths),
		marker: "❯ ",
	});
	bgWidths.length = 0;
	const lines = picker.render(80);
	assert.equal(calls.length, 2);
	assert.ok(calls.every((text) => text.startsWith("→ ")));
	assert.ok(lines.join("").includes("\x1b[35m❯ "));
	assert.ok(!lines.join("").includes("\u0000"));
	assert.deepEqual(bgWidths, [modelThinkingPaneWidths(80).left]);
	picker.handleInput("zzzz");
	assert.match(renderPicker(picker), /missing:/);
});

test("snapshot and selection return detached refs and level arrays", () => {
	const offered: ThinkingLevel[] = ["off", "medium"];
	const refs = [{ provider: "p", id: "model" }];
	const picker = makePicker({ refs, levelOptions: () => offered });
	const expected = picker.snapshot();
	const snapshot = picker.snapshot();
	assert.ok(snapshot.ref);
	snapshot.ref.id = "changed";
	snapshot.levelOptions.push("max");
	snapshot.pane = "buttons";
	const selection = picker.getSelected();
	selection.ref.provider = "changed";
	const optional = picker.selection();
	assert.ok(optional);
	optional.ref.id = "changed";
	assert.ok(refs[0]);
	refs[0].id = "host-changed";
	offered.push("max");
	assert.deepEqual(picker.snapshot(), expected);
});

test("host item labels, pane titles and width labels stay independent of ref identity", () => {
	const picker = makePicker({
		itemLabel: () => "friendly",
		modelPaneTitle: "Available",
		levelPaneTitle: "Effort",
		levelWidthLabels: ["a-very-long-effort-label"],
	});
	assert.match(renderPicker(picker), / Available.*│ Effort/);
	assert.match(renderPicker(picker), /friendly/);
	assert.deepEqual(picker.getSelected().ref, REFS[0]);
	for (let width = 4; width <= 200; width++)
		exactWidths(picker.render(width), width);
});
