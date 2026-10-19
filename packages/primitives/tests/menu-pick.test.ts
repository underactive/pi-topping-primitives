// Pick rows (splash's model picker, kept inside the menu), clearValue and initialCursor.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	fakeTui,
	flush,
	KEY,
	lineWith,
	makeMenu,
	plain,
	press,
	selectedLine,
	stripAnsi,
	styledLineWith,
} from "./menu-harness.js";

const SESSION = "Session model";

function pickConfig(onPick: (id: string) => Promise<string | undefined>) {
	return {
		sections: [
			{
				title: "Summary",
				items: [
					{
						kind: "toggle" as const,
						id: "enabled",
						label: "Enabled",
						value: true,
					},
					{
						kind: "pick" as const,
						id: "model",
						label: "Summary model",
						value: SESSION,
						clearValue: SESSION,
					},
					{
						kind: "text" as const,
						id: "tagline",
						label: "Tagline",
						value: "hello",
						clearValue: "",
					},
					{
						kind: "cycle" as const,
						id: "style",
						label: "Style",
						value: "a",
						values: ["a", "b"],
					},
					{
						kind: "number" as const,
						id: "n",
						label: "N",
						value: 5,
						min: 0,
						max: 9,
					},
				],
			},
		],
		buttons: [{ id: "apply", label: "Apply", applies: true, primary: true }],
		onPick: (id: string) => onPick(id),
	};
}

test("onPick suspends every key while pending and shows the row busy", async () => {
	let resolvePick: ((value: string | undefined) => void) | undefined;
	const picked: string[] = [];
	const tui = fakeTui(40);
	const { menu, results } = makeMenu(
		pickConfig((id) => {
			picked.push(id);
			return new Promise((resolve) => {
				resolvePick = resolve;
			});
		}),
		{ tui },
	);
	await press(menu, KEY.down, KEY.enter);
	assert.deepEqual(picked, ["model"]);
	assert.deepEqual(menu.snapshot().busy, ["model"]);
	assert.ok(
		stripAnsi(styledLineWith(menu, "Summary model", 80)).includes(
			"Session model … ›",
		),
	);
	await press(menu, KEY.down, KEY.escape, KEY.tab, KEY.enter);
	assert.equal(
		results.length,
		0,
		"no key reaches the menu while the picker owns the input",
	);
	assert.ok(selectedLine(menu, 80).includes("Summary model"));
	resolvePick?.("gpt-6-luna");
	await flush();
	assert.deepEqual(menu.snapshot().busy, []);
	assert.equal(tui.renders, 1);
	assert.ok(lineWith(menu, "Summary model", 80).includes("gpt-6-luna ›"));
	await press(menu, KEY.down);
	assert.ok(
		selectedLine(menu, 80).includes("Tagline"),
		"input resumes once the pick settles",
	);
});

test("a returned value is stored and fires onChange; undefined keeps the current value", async () => {
	const seen: string[] = [];
	let answer: string | undefined = "claude-fable-5-1";
	const { menu, results } = makeMenu({
		...pickConfig(() => Promise.resolve(answer)),
		onChange: (id, values) => {
			seen.push(`${id}=${String(values[id])}`);
		},
	});
	await press(menu, KEY.down, KEY.space);
	assert.deepEqual(seen, ["model=claude-fable-5-1"]);
	answer = undefined;
	await press(menu, KEY.enter);
	assert.deepEqual(
		seen,
		["model=claude-fable-5-1"],
		"undefined is not a change",
	);
	assert.equal(menu.snapshot().values.model, "claude-fable-5-1");
	await press(menu, KEY.tab, KEY.enter);
	assert.equal(results[0]?.values.model, "claude-fable-5-1");
});

test("a rejected or throwing onPick shows the failure and hands the keys back", async () => {
	const unhandled: unknown[] = [];
	const listener = (reason: unknown) => unhandled.push(reason);
	process.on("unhandledRejection", listener);
	try {
		let mode: "reject" | "throw" = "reject";
		const { menu } = makeMenu(
			pickConfig(() => {
				if (mode === "throw") throw new Error("no models");
				return Promise.reject(new Error("picker closed"));
			}),
		);
		await press(menu, KEY.down, KEY.enter);
		assert.ok(plain(menu, 80).some((line) => line.includes("✗ picker closed")));
		assert.deepEqual(menu.snapshot().busy, []);
		mode = "throw";
		await press(menu, KEY.enter);
		assert.ok(plain(menu, 80).some((line) => line.includes("✗ no models")));
		await press(menu, KEY.down);
		assert.ok(selectedLine(menu, 80).includes("Tagline"));
		await flush();
	} finally {
		process.off("unhandledRejection", listener);
	}
	assert.deepEqual(unhandled, []);
});

test("a pick settling after dispose does nothing", async () => {
	let resolvePick: ((value: string | undefined) => void) | undefined;
	const tui = fakeTui(40);
	const { menu } = makeMenu(
		pickConfig(
			() =>
				new Promise((resolve) => {
					resolvePick = resolve;
				}),
		),
		{ tui },
	);
	await press(menu, KEY.down, KEY.enter);
	menu.dispose();
	resolvePick?.("late");
	await flush();
	assert.equal(tui.renders, 0);
	assert.equal(menu.snapshot().values.model, SESSION);
});

test("a menu without onPick ignores pick rows", async () => {
	const { menu, results } = makeMenu({
		...pickConfig(() => Promise.resolve("x")),
		onPick: undefined,
	});
	await press(menu, KEY.down, KEY.enter, KEY.space);
	assert.deepEqual(menu.snapshot().busy, []);
	assert.equal(results.length, 0);
});

test("Backspace and Delete reset pick and text rows to their clearValue and do nothing elsewhere", async () => {
	const seen: string[] = [];
	const { menu } = makeMenu({
		...pickConfig(() => Promise.resolve("picked")),
		onChange: (id) => {
			seen.push(id);
		},
	});
	await press(menu, KEY.down, KEY.enter);
	assert.equal(menu.snapshot().values.model, "picked");
	await press(menu, KEY.backspace);
	assert.equal(menu.snapshot().values.model, SESSION);
	await press(menu, KEY.down, KEY.delete);
	assert.equal(menu.snapshot().values.tagline, "");
	assert.deepEqual(seen, ["model", "model", "tagline"]);

	await press(
		menu,
		KEY.down,
		KEY.backspace,
		KEY.delete,
		KEY.down,
		KEY.backspace,
		KEY.up,
		KEY.up,
		KEY.up,
		KEY.up,
		KEY.backspace,
	);
	assert.deepEqual(menu.snapshot().values, {
		enabled: true,
		model: SESSION,
		tagline: "",
		style: "a",
		n: 5,
	});
	assert.deepEqual(
		seen,
		["model", "model", "tagline"],
		"rows without a clearValue never fire onChange",
	);
	assert.equal(menu.snapshot().editing, false);
});

test("initialCursor selects the named row, falling back to the first enabled row", () => {
	const named = makeMenu({
		...pickConfig(() => Promise.resolve(undefined)),
		initialCursor: "tagline",
	});
	assert.ok(selectedLine(named.menu, 80).includes("Tagline"));
	assert.equal(named.menu.snapshot().cursorId, "tagline");

	const unknown = makeMenu({
		...pickConfig(() => Promise.resolve(undefined)),
		initialCursor: "nope",
	});
	assert.equal(unknown.menu.snapshot().cursorId, "enabled");

	const disabled = makeMenu({
		sections: [
			{
				title: "S",
				items: [
					{ kind: "toggle", id: "a", label: "A", value: true, disabled: true },
					{ kind: "toggle", id: "b", label: "B", value: true },
				],
			},
		],
		initialCursor: "a",
	});
	assert.equal(disabled.menu.snapshot().cursorId, "b");
});
