// Frame and row rendering. Ported from pi-topping (frame, narrow widths, OSC 8),
// routesense (wrapping, hint block, disabled rows, preview title) and statusline (the
// background re-opened after an embedded reset), plus the chrome-equivalence check.
import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { chrome } from "../src/menu/chrome.js";
import {
	BG,
	FG,
	fakeTheme,
	KEY,
	lineWith,
	makeMenu,
	plain,
	press,
	RESET,
	selectedLine,
	stripAnsi,
	styledLineWith,
} from "./menu-harness.js";

test("render produces a well-formed frame at the requested width", () => {
	const { menu } = makeMenu();
	const lines = menu.render(64);
	// top + (divider + 2 items + blank) + (divider + 1 item + blank) + separator + hints + bottom
	assert.equal(lines.length, 1 + (1 + 2 + 1) + (1 + 1 + 1) + 1 + 1 + 1);
	for (const line of lines) {
		assert.equal(
			visibleWidth(line),
			64,
			`line does not fill the overlay: ${JSON.stringify(line)}`,
		);
	}
	const text = lines.map(stripAnsi);
	assert.ok(text[0]?.includes("╔═[ TEST ]"));
	assert.ok(text.some((line) => line.includes("╟─ S1 ─")));
	assert.ok(text.some((line) => line.includes("╟─ S2 ─")));
	assert.ok(
		text.some(
			(line) =>
				line.includes("❯") && line.includes("Item A") && line.includes("ON"),
		),
	);
	assert.ok(
		text.some((line) => line.includes("Item B") && line.includes("OFF")),
	);
	assert.ok(text.at(-2)?.includes("↑↓ move"));
	assert.ok(text.at(-1)?.startsWith("╚"));
	assert.ok(text.at(-1)?.includes("[ 1/3 ]"));
});

test("the selected row carries the ❯ marker and the selected background; others carry neither", () => {
	const { menu } = makeMenu();
	const itemA = styledLineWith(menu, "Item A");
	const itemB = styledLineWith(menu, "Item B");
	assert.ok(stripAnsi(itemA).includes("❯"));
	assert.ok(!stripAnsi(itemB).includes("❯"));
	assert.ok(
		itemA.includes(BG.selectedBg ?? ""),
		"selected row must have selectedBg",
	);
	assert.ok(
		!itemB.includes(BG.selectedBg ?? ""),
		"unselected row must not have selectedBg",
	);
	assert.ok(!stripAnsi(itemA).includes(">"), "the marker is ❯, not >");
});

test("the selected background is re-opened after every embedded reset", () => {
	// The fake theme emits a reset after every styled span, as pi's theme does, so a row
	// with several spans has several embedded resets inside its highlighted region.
	const { menu } = makeMenu({
		sections: [
			{
				title: "S",
				items: [
					{
						kind: "cycle",
						id: "sep",
						label: "Separator",
						value: "thin",
						values: ["thin"],
					},
				],
			},
		],
	});
	const line = styledLineWith(menu, "Separator");
	const bg = BG.selectedBg ?? "";
	const start = line.indexOf(bg);
	// The highlighted span ends where the background's own reset meets the right border.
	const end = line.lastIndexOf(`${RESET}${FG.border}║`);
	assert.ok(start >= 0 && end > start);
	const highlighted = line.slice(start + bg.length, end);
	assert.ok(
		highlighted.includes(RESET),
		"the row must contain an embedded reset for this case to mean anything",
	);
	assert.ok(
		!highlighted
			.split(RESET)
			.slice(1)
			.some((after) => !after.startsWith(bg)),
		"every embedded reset must be followed by the selected background",
	);
});

test("long labels and values wrap instead of truncating with an ellipsis", () => {
	const { menu } = makeMenu({
		sections: [
			{
				title: "S",
				items: [
					{
						kind: "text",
						id: "key",
						label: "1. api_key_env · set",
						value: "OPENROUTER_API_KEY",
					},
					{
						kind: "cycle",
						id: "trigger",
						label: "1. classify_trigger (must not be every_request)",
						value: "user_turn",
						values: ["user_turn"],
					},
				],
			},
		],
	});
	const width = 35;
	const lines = plain(menu, width);
	const body = lines.slice(2, -3);
	const text = body.join("\n");
	assert.ok(text.includes("1. api_key_env · set"));
	assert.ok(text.includes("OPENROUTER_API_KEY"));
	assert.ok(text.includes("1. classify_trigger (must not"));
	assert.ok(text.includes("be every_request)"));
	assert.ok(!body.some((line) => line.includes("…")));
	assert.ok(lines.every((line) => visibleWidth(line) <= width));
});

test("a disabled row renders dim with its reason and is skipped by the cursor", async () => {
	const { menu } = makeMenu({
		sections: [
			{
				title: "S",
				items: [
					{ kind: "toggle", id: "a", label: "Item A", value: true },
					{
						kind: "toggle",
						id: "b",
						label: "Item B",
						value: true,
						disabled: true,
						disabledReason: "needs setup",
					},
					{ kind: "toggle", id: "c", label: "Item C", value: true },
				],
			},
		],
	});
	await press(menu, KEY.down);
	assert.ok(
		selectedLine(menu).includes("Item C"),
		"cursor must skip the disabled row",
	);
	const disabled = styledLineWith(menu, "Item B");
	assert.ok(stripAnsi(disabled).includes("(needs setup)"));
	assert.ok(
		disabled.includes(FG.dim ?? ""),
		"disabled row must render with the dim colour",
	);
	assert.ok(
		!stripAnsi(disabled).includes("ON"),
		"a disabled row shows no state word",
	);
});

test("the hint block follows the focused row, keeps a fixed height and follows the bar", async () => {
	const { menu } = makeMenu({
		sections: [
			{
				title: "S",
				items: [
					{
						kind: "toggle",
						id: "a",
						label: "A",
						value: false,
						hint: "First description",
					},
					{
						kind: "toggle",
						id: "b",
						label: "B",
						value: false,
						hint: "Second description",
					},
				],
			},
		],
		buttons: [{ id: "save", label: "Save", hint: "Save description" }],
	});
	const first = plain(menu, 50);
	assert.ok(first.some((line) => line.includes("What this does")));
	assert.ok(first.some((line) => line.includes("First description")));
	await press(menu, KEY.down);
	const second = plain(menu, 50);
	assert.ok(second.some((line) => line.includes("Second description")));
	assert.equal(second.length, first.length);
	await press(menu, KEY.tab);
	assert.ok(plain(menu, 50).some((line) => line.includes("Save description")));
});

function hintRows(lines: string[]): string[] {
	const titleIndex = lines.findIndex((line) => line.includes("What this does"));
	assert.notEqual(titleIndex, -1, "hint title should render");
	return lines
		.slice(titleIndex + 1, titleIndex + 4)
		.map((line) => line.slice(1, -1).trim());
}

test("hint rows cap long text at three lines with an ellipsis and never change the footer height", () => {
	const width = 24;
	const hintMenu = (hint: string) =>
		makeMenu({
			sections: [
				{
					title: "S",
					items: [{ kind: "toggle", id: "a", label: "A", value: false, hint }],
				},
			],
		}).menu;
	const short = plain(hintMenu("Short hint"), width);
	const long = plain(hintMenu("standby routing ".repeat(10)), width);
	assert.deepEqual(hintRows(short), ["Short hint", "", ""]);
	const longRows = hintRows(long);
	assert.equal(longRows.length, 3);
	assert.ok(longRows[2]?.endsWith("…"));
	assert.equal(short.length, long.length);
	assert.ok(long.every((line) => visibleWidth(line) <= width));

	const exact = plain(
		hintMenu("abcdefghijkl mnopqrstuvwx ABCDEFGHIJKL"),
		width,
	);
	assert.deepEqual(hintRows(exact), [
		"abcdefghijkl",
		"mnopqrstuvwx",
		"ABCDEFGHIJKL",
	]);
});

test("the hint block appears for a validation message even when no row has a hint", async () => {
	const { menu, results } = makeMenu({ validate: () => "Invalid settings" });
	assert.ok(
		!plain(menu).some((line) => line.includes("What this does")),
		"no hints, no block",
	);
	await press(menu, KEY.enter);
	assert.equal(results.length, 0);
	const styled = menu
		.render(64)
		.find((line) => stripAnsi(line).includes("Invalid settings"));
	assert.ok(styled, "the validation error must be shown");
	assert.ok(
		styled.includes(FG.error ?? ""),
		"a message renders in the error colour",
	);
	assert.ok(plain(menu).some((line) => line.includes("What this does")));
	await press(menu, KEY.down);
	assert.ok(
		!plain(menu).some((line) => line.includes("Invalid settings")),
		"the next key clears it",
	);
	assert.ok(
		!plain(menu).some((line) => line.includes("What this does")),
		"and the block goes away again",
	);
});

test("contentRow closes an OSC 8 hyperlink that truncation cut off", () => {
	const theme = fakeTheme();
	const open = "\x1b]8;;https://example.com\x1b\\";
	const close = "\x1b]8;;\x1b\\";
	const truncated = chrome.contentRow(
		theme,
		10,
		`${open}a very long link label${close}`,
	);
	assert.ok(truncated.includes(open));
	// pi-tui 1.3.0 closes a cut link itself; older peers do not, and then chrome's guard does.
	// Either way the link is closed exactly once, before the border.
	const afterOpen = truncated.slice(truncated.lastIndexOf(open) + open.length);
	assert.ok(
		afterOpen.includes(close),
		"the link must be closed before the border",
	);
	assert.equal(
		truncated.split(close).length,
		2,
		"closed exactly once, whichever layer closed it",
	);
	assert.ok(truncated.endsWith(theme.fg("border", "║")));
	assert.equal(visibleWidth(truncated), 12);

	const fits = chrome.contentRow(theme, 40, `${open}short${close}`);
	assert.equal(
		fits.split(close).length,
		2,
		"an already-closed link is not closed twice",
	);

	const { menu } = makeMenu({
		preview: {
			render: () => ({
				lines: [`${open}a very long link label that overflows${close}`],
			}),
		},
	});
	const row = menu.render(20).find((line) => line.includes(open));
	assert.ok(row);
	assert.ok(row.includes(close));
});

test("narrow terminals never overflow and degenerate widths do not throw", () => {
	const { menu } = makeMenu({
		title: "A REALLY LONG SETTINGS MENU TITLE THAT WONT FIT",
		sections: [
			{
				title: "SECTION",
				items: [
					{
						kind: "toggle",
						id: "x",
						label: "A very long toggle label that should be truncated safely",
						value: true,
					},
					{
						kind: "number",
						id: "n",
						label: "Bound",
						value: 80,
						min: 1,
						max: 1000,
						unit: "tps",
					},
				],
			},
		],
	});
	for (const width of [20, 12, 5, 2, 1, 0]) {
		const lines = menu.render(width);
		for (const line of lines) {
			assert.ok(
				visibleWidth(line) <= width,
				`width ${width}: ${JSON.stringify(stripAnsi(line))}`,
			);
		}
	}
});

test("rows with wide Unicode glyphs still fill the frame exactly", () => {
	const { menu } = makeMenu({
		sections: [
			{
				title: "日本語",
				items: [
					{ kind: "toggle", id: "a", label: "表示 ✨ ラベル", value: true },
					{
						kind: "cycle",
						id: "b",
						label: "Emoji 🎉 row",
						value: "🍕",
						values: ["🍕", "🍔"],
					},
				],
			},
		],
	});
	for (const width of [64, 30]) {
		for (const line of menu.render(width)) {
			assert.equal(visibleWidth(line), width, JSON.stringify(stripAnsi(line)));
		}
	}
});

test("the chrome helpers render exactly what the component renders", () => {
	const theme = fakeTheme();
	const { menu } = makeMenu();
	const lines = menu.render(64);
	assert.equal(lines[0], chrome.topBorder(theme, 62, "TEST"));
	assert.equal(lines[1], chrome.sectionDivider(theme, 62, "S1"));
	assert.equal(lines[4], chrome.blankRow(theme, 62));
	assert.equal(lines.at(-3), chrome.separator(theme, 62));
	assert.equal(lines.at(-1), chrome.bottomBorder(theme, 62, 0, 3));
	assert.ok(Object.isFrozen(chrome));
});

test("the preview block uses its own title and a number row shows its unit", () => {
	const { menu } = makeMenu({
		preview: { title: "Live Preview", render: () => ({ lines: ["hello"] }) },
		sections: [
			{
				title: "S",
				items: [
					{
						kind: "number",
						id: "n",
						label: "Bound",
						value: 80,
						min: 1,
						max: 1000,
						unit: "tps",
					},
					{ kind: "pick", id: "m", label: "Model", value: "session" },
				],
			},
		],
	});
	const lines = plain(menu);
	assert.ok(lines.some((line) => line.includes("─ Live Preview ─")));
	assert.ok(!lines.some((line) => line.includes("─ Preview ─")));
	assert.ok(lineWith(menu, "Bound").includes("‹ 80 tps ›"));
	assert.ok(lineWith(menu, "Model").includes("session ›"));
});
