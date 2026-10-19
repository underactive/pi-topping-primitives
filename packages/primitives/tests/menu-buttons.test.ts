// The button bar (splash's look, routesense's semantics), what Apply does, the enterApplies
// defaults, and failure handling that never escapes as an unhandled rejection.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MenuButton, MenuSection } from "../src/menu/types.js";
import {
	BG,
	FG,
	fakeTui,
	flush,
	KEY,
	makeMenu,
	plain,
	press,
	RESET,
	stripAnsi,
	styledLineWith,
} from "./menu-harness.js";

const BAR: MenuButton[] = [
	{ id: "save", label: "Save" },
	{ id: "apply", label: "Apply", applies: true, primary: true },
	{ id: "cancel", label: "Cancel", closeOnAction: true },
];

function barLine(menu: ReturnType<typeof makeMenu>["menu"]): string {
	return (
		menu
			.render(80)
			.find(
				(line) =>
					/Apply/.test(stripAnsi(line)) && !stripAnsi(line).includes("⏎"),
			) ?? ""
	);
}

function focusedButton(menu: ReturnType<typeof makeMenu>["menu"]): string {
	return /\[ [^\]]+ \]/.exec(stripAnsi(barLine(menu)))?.[0] ?? "";
}

test("the bar is right-aligned between two rules, with the focused button in brackets", () => {
	const { menu } = makeMenu({ buttons: BAR });
	const lines = plain(menu, 80);
	const bar = lines.findIndex((line) => line.includes("[ Apply ]"));
	assert.ok(bar > lines.findIndex((line) => line.includes("Item C")));
	assert.match(lines[bar - 1] ?? "", /^╟─+╢$/);
	assert.match(lines[bar + 1] ?? "", /^╟─+╢$/);
	assert.ok(
		lines[bar + 2]?.includes("⇥ buttons"),
		"the default hints mention the bar",
	);
	assert.ok(
		lines[bar]?.endsWith("‹ Cancel ›  ║"),
		"buttons hug the right edge",
	);
	assert.ok(lines[bar]?.includes("‹ Save ›    [ Apply ]    ‹ Cancel ›"));
	assert.ok(
		!makeMenu()
			.menu.render(80)
			.some((line) => stripAnsi(line).includes("[ Apply ]")),
	);
});

test("Tab and Shift+Tab move focus to the bar and back; the primary button is focused first", async () => {
	const { menu } = makeMenu({ buttons: BAR });
	assert.ok(
		!barLine(menu).includes(FG.accent ?? ""),
		"an unfocused bar is muted",
	);
	await press(menu, KEY.tab);
	assert.equal(menu.snapshot().focus, "buttons");
	assert.equal(focusedButton(menu), "[ Apply ]");
	assert.ok(
		barLine(menu).includes(`\x1b[1m${FG.accent}[ Apply ]`),
		"the focused button is bold accent",
	);
	await press(menu, KEY.tab);
	assert.equal(menu.snapshot().focus, "body");
	await press(menu, KEY.shiftTab);
	assert.equal(menu.snapshot().focus, "buttons");
	assert.ok(
		plain(menu, 80).some((line) => line.includes("⇥ back to settings")),
	);
});

test("while the bar has focus the body cursor keeps its marker but drops the selected background", async () => {
	const { menu } = makeMenu({ buttons: BAR });
	assert.ok(styledLineWith(menu, "Item A", 80).includes(BG.selectedBg ?? ""));
	await press(menu, KEY.tab);
	const body = styledLineWith(menu, "Item A", 80);
	assert.ok(!body.includes(BG.selectedBg ?? ""));
	assert.ok(stripAnsi(body).includes("❯"));
});

test("left and right move between buttons and stop at the ends; Up returns to the body", async () => {
	const { menu } = makeMenu({ buttons: BAR });
	await press(menu, KEY.tab, KEY.left);
	assert.equal(focusedButton(menu), "[ Save ]");
	await press(menu, KEY.left);
	assert.equal(focusedButton(menu), "[ Save ]");
	await press(menu, KEY.right, KEY.right);
	assert.equal(focusedButton(menu), "[ Cancel ]");
	await press(menu, KEY.right);
	assert.equal(focusedButton(menu), "[ Cancel ]");
	await press(menu, KEY.up);
	assert.equal(menu.snapshot().focus, "body");
});

test("an applies button validates, shows the error, and otherwise closes applied with its id", async () => {
	let strict = true;
	const { menu, results } = makeMenu({
		buttons: BAR,
		validate: () => (strict ? "Fix it first" : undefined),
	});
	await press(menu, KEY.space, KEY.tab, KEY.enter);
	assert.equal(results.length, 0);
	assert.ok(plain(menu, 80).some((line) => line.includes("Fix it first")));
	strict = false;
	await press(menu, KEY.space);
	assert.deepEqual(results[0], {
		applied: true,
		action: "apply",
		values: { a: false, b: false, c: true },
	});
});

test("a closeOnAction button closes with applied:false, its id and the draft, without running onAction", async () => {
	let calls = 0;
	const { menu, results } = makeMenu({
		buttons: BAR,
		onAction: () => {
			calls++;
		},
	});
	await press(menu, KEY.space, KEY.tab, KEY.right, KEY.enter);
	assert.deepEqual(results[0], {
		applied: false,
		action: "cancel",
		values: { a: false, b: false, c: true },
	});
	assert.equal(calls, 0);
});

test("a plain button runs onAction, stays open and shows busy until the promise settles", async () => {
	let resolveAction:
		| ((sections: MenuSection[] | undefined) => void)
		| undefined;
	const tui = fakeTui(40);
	const fired: string[] = [];
	const { menu, results } = makeMenu(
		{
			buttons: BAR,
			onAction: (id) => {
				fired.push(id);
				return new Promise((resolve) => {
					resolveAction = resolve;
				});
			},
		},
		{ tui },
	);
	await press(menu, KEY.tab, KEY.left, KEY.enter);
	assert.deepEqual(fired, ["save"]);
	assert.ok(stripAnsi(barLine(menu)).includes("[ Save … ]"));
	await press(menu, KEY.space);
	assert.deepEqual(fired, ["save"], "a second press while pending is ignored");
	assert.equal(results.length, 0);
	resolveAction?.([
		{
			title: "New",
			items: [{ kind: "toggle", id: "fresh", label: "Fresh", value: true }],
		},
	]);
	await flush();
	assert.ok(!stripAnsi(barLine(menu)).includes("…"));
	assert.ok(plain(menu, 80).some((line) => line.includes("Fresh")));
	assert.equal(tui.renders, 1);
	assert.equal(results.length, 0, "a plain button never closes the menu");
});

test("Space on a focused button presses it, and Escape from the bar closes with the draft", async () => {
	const fired: string[] = [];
	const { menu, results } = makeMenu({
		buttons: BAR,
		onAction: (id) => {
			fired.push(id);
		},
	});
	await press(menu, KEY.tab, KEY.left, KEY.space);
	assert.deepEqual(fired, ["save"]);
	await press(menu, KEY.up, KEY.space, KEY.tab, KEY.escape);
	assert.deepEqual(results[0], {
		applied: false,
		values: { a: false, b: false, c: true },
	});
});

test("with a bar, stray Enters on rows do nothing; enterApplies: true restores Enter-to-apply", async () => {
	const stray = makeMenu({ buttons: BAR });
	await press(stray.menu, KEY.enter, KEY.down, KEY.enter);
	assert.equal(stray.results.length, 0);
	const explicit = makeMenu({
		buttons: BAR,
		enterApplies: true,
		validate: () => undefined,
	});
	await press(explicit.menu, KEY.enter);
	assert.deepEqual(explicit.results[0], {
		applied: true,
		values: { a: true, b: false, c: true },
	});
});

async function withRejectionGuard(run: () => Promise<void>): Promise<void> {
	const unhandled: unknown[] = [];
	const listener = (reason: unknown) => unhandled.push(reason);
	process.on("unhandledRejection", listener);
	try {
		await run();
		await flush();
	} finally {
		process.off("unhandledRejection", listener);
	}
	assert.deepEqual(
		unhandled,
		[],
		"a failing handler must never become an unhandled rejection",
	);
}

test("a rejected onAction shows ✗ and its message in the hint block, clears busy and is not re-thrown", async () => {
	await withRejectionGuard(async () => {
		const tui = fakeTui(40);
		const { menu } = makeMenu(
			{ buttons: BAR, onAction: () => Promise.reject(new Error("disk full")) },
			{ tui },
		);
		await press(menu, KEY.tab, KEY.left, KEY.enter);
		assert.deepEqual(menu.snapshot().busy, []);
		const line = menu
			.render(80)
			.find((l) => stripAnsi(l).includes("✗ disk full"));
		assert.ok(line, "the failure must be shown");
		assert.ok(line.includes(FG.error ?? ""));
		assert.ok(tui.renders >= 1);
		await press(menu, KEY.right);
		assert.ok(
			!plain(menu, 80).some((l) => l.includes("disk full")),
			"the next key clears the message",
		);
	});
});

test("a synchronous throw and a non-Error reason are shown the same way, from rows and buttons", async () => {
	await withRejectionGuard(async () => {
		const { menu } = makeMenu({
			sections: [
				{ title: "S", items: [{ kind: "action", id: "go", label: "Go" }] },
			],
			buttons: BAR,
			onAction: (id) => {
				if (id === "go") throw new TypeError("sync boom");
				return Promise.reject("plain string");
			},
		});
		await press(menu, KEY.enter);
		assert.ok(plain(menu, 80).some((l) => l.includes("✗ sync boom")));
		await press(menu, KEY.tab, KEY.left, KEY.enter);
		assert.ok(plain(menu, 80).some((l) => l.includes("✗ plain string")));
		assert.deepEqual(menu.snapshot().busy, []);
	});
});

test("a promise settling after dispose neither throws nor touches the disposed menu", async () => {
	await withRejectionGuard(async () => {
		let settle:
			| { resolve(v: undefined): void; reject(e: unknown): void }
			| undefined;
		const tui = fakeTui(40);
		const { menu } = makeMenu(
			{
				buttons: BAR,
				onAction: () =>
					new Promise<undefined>((resolve, reject) => {
						settle = { resolve, reject };
					}),
			},
			{ tui },
		);
		await press(menu, KEY.tab, KEY.left, KEY.enter);
		const before = menu.render(80);
		menu.dispose();
		settle?.reject(new Error("late"));
		await flush();
		assert.equal(tui.renders, 0);
		assert.deepEqual(menu.render(80), before, "nothing changed after dispose");
	});
});

test("action rows: Enter and Space run onAction; closeOnAction rows close with the draft and their id", async () => {
	const fired: string[] = [];
	const { menu, results } = makeMenu({
		sections: [
			{
				title: "S",
				items: [
					{ kind: "toggle", id: "x", label: "X", value: true },
					{ kind: "action", id: "go", label: "Go" },
					{ kind: "action", id: "close", label: "Close", closeOnAction: true },
				],
			},
		],
		onAction: (id) => {
			fired.push(id);
		},
	});
	await press(menu, KEY.space, KEY.down, KEY.enter, KEY.space);
	assert.deepEqual(fired, ["go", "go"]);
	assert.ok(
		styledLineWith(menu, "Go").includes(FG.accent ?? ""),
		"a selected action row is accented",
	);
	await press(menu, KEY.down, KEY.enter);
	assert.deepEqual(results[0], {
		applied: false,
		action: "close",
		values: { x: false },
	});
	assert.deepEqual(fired, ["go", "go"]);
});

test("an async action row shows the busy suffix and rebuilds on resolve", async () => {
	let resolveAction:
		| ((sections: MenuSection[] | undefined) => void)
		| undefined;
	const tui = fakeTui(24);
	const { menu } = makeMenu(
		{
			sections: [
				{ title: "S", items: [{ kind: "action", id: "go", label: "Go" }] },
			],
			onAction: () =>
				new Promise((resolve) => {
					resolveAction = resolve;
				}),
		},
		{ tui },
	);
	await press(menu, KEY.enter);
	assert.ok(stripAnsi(styledLineWith(menu, "Go")).includes("…"));
	assert.deepEqual(menu.snapshot().busy, ["go"]);
	resolveAction?.([
		{
			title: "S2",
			items: [{ kind: "toggle", id: "done", label: "Done", value: false }],
		},
	]);
	await flush();
	assert.equal(tui.renders, 1);
	assert.ok(plain(menu).some((line) => line.includes("Done")));
	assert.ok(!plain(menu).some((line) => line.includes("…")));
	assert.ok(
		!styledLineWith(menu, "Done").includes(RESET.repeat(2)),
		"no doubled resets from the busy suffix",
	);
});
