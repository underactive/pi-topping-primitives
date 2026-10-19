import assert from "node:assert/strict";
import { test } from "node:test";
import { ActivityMeter, ActivityMeterLevel } from "../src/activity/index.js";
import {
	ansiToRgb,
	colorizeMeterCell,
	dimAttribute,
	fadeThemeColorString,
	formatToolActivity,
	highlightActivity,
	renderIdleMeter,
	renderMeter,
	shimmerString,
	thinkingLevelColorizer,
	thinkingLevelThemeColor,
} from "../src/activity-tui/index.js";

const tagTheme = {
	fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
};

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape sequences
const TRUECOLOR_FG = /\x1b\[38;2;(\d+);(\d+);(\d+)m/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape sequences
const SGR = /\x1b\[[0-9;]*m/g;

// ── meter ───────────────────────────────────────────────────────────────────

test("dimAttribute wraps in SGR 2 and 22", () => {
	assert.equal(dimAttribute("x"), "\x1b[2mx\x1b[22m");
});

test("colorizeMeterCell dims idle cells and uses the chosen colour for active cells", () => {
	// A string colour goes through theme.fg; a closure is called directly.
	for (const color of [
		"accent",
		"border",
		"borderAccent",
		"success",
		"error",
		"warning",
	] as const) {
		assert.equal(
			colorizeMeterCell(3, "⣤", tagTheme, color),
			`<${color}>⣤</${color}>`,
		);
		assert.equal(
			colorizeMeterCell(3, "⣤", tagTheme, (text) => tagTheme.fg(color, text)),
			`<${color}>⣤</${color}>`,
			"a closure produces the same cell",
		);
	}
	assert.equal(colorizeMeterCell(0, "⢀", tagTheme, "accent"), "<dim>⢀</dim>");
});

test("colorizeMeterCell darkens active cells when dimmed and never double-dims idle ones", () => {
	assert.equal(
		colorizeMeterCell(3, "⣤", tagTheme, "accent", true),
		"\x1b[2m<accent>⣤</accent>\x1b[22m",
	);
	assert.equal(
		colorizeMeterCell(3, "⣤", tagTheme, (t) => `[${t}]`, true),
		"\x1b[2m[⣤]\x1b[22m",
	);
	assert.equal(
		colorizeMeterCell(0, "⢀", tagTheme, "accent", true),
		"<dim>⢀</dim>",
	);
});

test("renderMeter colours every cell of a meter", () => {
	const meter = new ActivityMeter({ width: 3, direction: "rtl" });
	meter.push(ActivityMeterLevel.FULL);
	meter.push(ActivityMeterLevel.LOW);
	assert.equal(
		renderMeter(meter, tagTheme, "accent"),
		"<dim>⢀</dim><accent>⣿</accent><accent>⣀</accent>",
	);
	assert.equal(
		renderMeter(meter, tagTheme, "accent", true),
		"<dim>⢀</dim>\x1b[2m<accent>⣿</accent>\x1b[22m\x1b[2m<accent>⣀</accent>\x1b[22m",
	);
});

test("renderIdleMeter is one dim run of idle cells", () => {
	assert.equal(renderIdleMeter(tagTheme), "<dim>⢀⢀⢀⢀⢀⢀⢀⢀</dim>");
	assert.equal(renderIdleMeter(tagTheme, 3), "<dim>⢀⢀⢀</dim>");
});

// ── thinking levels ─────────────────────────────────────────────────────────

test("thinkingLevelThemeColor maps every level and falls back to accent", () => {
	const expected = {
		off: "thinkingOff",
		minimal: "thinkingMinimal",
		low: "thinkingLow",
		medium: "thinkingMedium",
		high: "thinkingHigh",
		xhigh: "thinkingXhigh",
		max: "thinkingMax",
	};
	for (const [level, color] of Object.entries(expected)) {
		assert.equal(thinkingLevelThemeColor(level), color, level);
	}
	for (const level of [
		undefined,
		"",
		"ultra",
		"constructor",
		"__proto__",
		"toString",
	]) {
		assert.equal(thinkingLevelThemeColor(level), "accent", String(level));
	}
});

test("thinkingLevelColorizer uses pi's thinking border colour or a fixed theme colour", () => {
	const seen: string[] = [];
	const theme = {
		fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
		getThinkingBorderColor: (level: string) => {
			seen.push(level);
			return (text: string) => `{${level}}${text}`;
		},
	};
	const asTheme = theme as unknown as Parameters<
		typeof thinkingLevelColorizer
	>[0];

	assert.equal(
		thinkingLevelColorizer(asTheme, "thinking-level", "high")("x"),
		"{high}x",
	);
	assert.equal(
		thinkingLevelColorizer(asTheme, "thinking-level", undefined)("x"),
		"{off}x",
	);
	assert.equal(
		thinkingLevelColorizer(asTheme, "accent", "high")("x"),
		"<accent>x</accent>",
	);
	assert.deepEqual(
		seen,
		["high", "off"],
		"a fixed colour never asks for the thinking colour",
	);
});

// ── ansiToRgb ───────────────────────────────────────────────────────────────

test("ansiToRgb reads a truecolor foreground anywhere in the string", () => {
	assert.deepEqual(ansiToRgb("\x1b[38;2;1;2;3m"), [1, 2, 3]);
	assert.deepEqual(ansiToRgb("\x1b[1m\x1b[38;2;10;20;30m"), [10, 20, 30]);
	assert.deepEqual(ansiToRgb("\x1b[38;2;10;20;30mtext\x1b[0m"), [10, 20, 30]);
});

test("ansiToRgb is truecolor only", () => {
	for (const ansi of [
		"\x1b[38;5;42m",
		"\x1b[39m",
		"\x1b[48;2;1;2;3m",
		"",
		"plain",
	]) {
		assert.equal(ansiToRgb(ansi), null, JSON.stringify(ansi));
	}
});

// ── fade ────────────────────────────────────────────────────────────────────

test("fadeThemeColorString uses five cosine-eased colour-to-dim shades", () => {
	const theme = {
		getFgAnsi: (color: string) =>
			color === "warning" ? "\x1b[38;2;110;120;130m" : "\x1b[38;2;10;20;30m",
		fg: (_color: string, text: string) => text,
	};
	const shades = Array.from({ length: 5 }, (_, level) =>
		fadeThemeColorString(
			" 20 tps",
			level,
			theme,
			(t) => `${theme.getFgAnsi("warning")}${t}`,
		),
	);

	assert.deepEqual(shades, [
		"\x1b[38;2;100;110;120m 20 tps\x1b[0m",
		"\x1b[38;2;75;85;95m 20 tps\x1b[0m",
		"\x1b[38;2;45;55;65m 20 tps\x1b[0m",
		"\x1b[38;2;20;30;40m 20 tps\x1b[0m",
		"\x1b[38;2;10;20;30m 20 tps\x1b[0m",
	]);
});

test("fadeThemeColorString clamps the shade, takes its own shade count and skips empty text", () => {
	const theme = {
		getFgAnsi: (color: string) =>
			color === "warning" ? "\x1b[38;2;110;120;130m" : "\x1b[38;2;10;20;30m",
		fg: (_color: string, text: string) => text,
	};
	const colorizer = (t: string) => `${theme.getFgAnsi("warning")}${t}`;

	const last = fadeThemeColorString("x", 4, theme, colorizer);
	assert.equal(fadeThemeColorString("x", 99, theme, colorizer), last);
	assert.equal(
		fadeThemeColorString("x", -3, theme, colorizer),
		fadeThemeColorString("x", 0, theme, colorizer),
	);
	assert.equal(
		fadeThemeColorString("x", 0, theme, colorizer, 1),
		"\x1b[38;2;10;20;30mx\x1b[0m",
		"one shade is already fully dim",
	);
	assert.equal(fadeThemeColorString("", 2, theme, colorizer), "");
});

test("fade and shimmer fall back for non-truecolor themes", () => {
	const theme = {
		getFgAnsi: () => "\x1b[38;5;42m",
		fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
	};

	assert.equal(
		fadeThemeColorString("rate", 0, theme, (t) => theme.fg("error", t)),
		"<error>rate</error>",
	);
	assert.equal(shimmerString("text", 0, theme), "<text>text</text>");
});

// ── shimmer ─────────────────────────────────────────────────────────────────

const shimmerTheme = {
	getFgAnsi: (color: string) =>
		color === "dim" ? "\x1b[38;2;20;30;40m" : "\x1b[38;2;120;130;140m",
	fg: (_color: string, text: string) => text,
};

test("shimmerString interpolates a continuous dim-to-text gradient", () => {
	const text = "abcdefghijklm";
	const elapsedMs = (2000 * 16) / (text.length + 20);
	const result = shimmerString(text, elapsedMs, shimmerTheme);
	const colors = [...result.matchAll(TRUECOLOR_FG)].map((match) =>
		match.slice(1).join(","),
	);

	assert.equal(colors[0], "20,30,40");
	assert.equal(colors[6], "110,120,130");
	assert.ok(
		new Set(colors).size > 3,
		"expected colors between the base and highlight",
	);
	assert.ok(result.includes("\x1b[1m\x1b[38;2;110;120;130mg\x1b[22m"));
	assert.ok(result.endsWith("\x1b[0m"));
});

test("inverted shimmer keeps the text colour at rest and dims with a gradient", () => {
	const text = "abcdefghijklm";
	const elapsedMs = (2000 * 16) / (text.length + 20);
	const result = shimmerString(
		text,
		elapsedMs,
		shimmerTheme,
		"ltr",
		"normal",
		true,
	);
	const colors = [...result.matchAll(TRUECOLOR_FG)].map((match) =>
		match.slice(1).join(","),
	);

	assert.equal(colors[0], "120,130,140");
	assert.equal(colors[6], "30,40,50");
	assert.ok(
		new Set(colors).size > 3,
		"expected colors between the base and dimmed band",
	);
	assert.equal(result.includes("\x1b[1m"), false);
	assert.ok(result.endsWith("\x1b[0m"));
});

test("shimmer reads a colour carried in a compound SGR", () => {
	const compound = {
		getFgAnsi: (color: string) =>
			color === "dim"
				? "\x1b[1m\x1b[38;2;20;30;40m"
				: "\x1b[1m\x1b[38;2;120;130;140m",
		fg: (_color: string, text: string) => `<fallback>${text}`,
	};
	const result = shimmerString("abc", 0, compound);
	assert.doesNotMatch(
		result,
		/<fallback>/,
		"a compound SGR is a usable colour, not a fallback",
	);
});

test("shimmer speed scales the sweep without stretching the pause between sweeps", () => {
	const measure = (speed: "slow" | "normal" | "fast") => {
		const lit = (ms: number): boolean =>
			[
				...shimmerString("test", ms, shimmerTheme, "ltr", speed).matchAll(
					TRUECOLOR_FG,
				),
			].some((match) => match.slice(1).join(";") !== "20;30;40");
		const SCAN_LIMIT_MS = 10_000;
		const STEP_MS = 5;
		// Bracket each transition in coarse strides, then refine to 1 ms within the bracket.
		const findEdge = (fromMs: number, wantLit: boolean): number => {
			let coarse = fromMs;
			while (lit(coarse) !== wantLit) {
				coarse += STEP_MS;
				assert.ok(
					coarse < SCAN_LIMIT_MS,
					"shimmer transition not found within scan limit",
				);
			}
			let fine = Math.max(fromMs, coarse - STEP_MS + 1);
			while (lit(fine) !== wantLit) fine++;
			return fine;
		};
		const start = findEdge(0, true);
		const end = findEdge(start, false);
		const next = findEdge(end, true);
		return { sweepMs: end - start, pauseMs: next - end };
	};

	const slow = measure("slow");
	const normal = measure("normal");
	const fast = measure("fast");

	assert.ok(
		Math.abs(slow.sweepMs - normal.sweepMs * 2) <= 2,
		`slow sweep ${slow.sweepMs} should double ${normal.sweepMs}`,
	);
	assert.ok(
		Math.abs(fast.sweepMs - normal.sweepMs / 2) <= 2,
		`fast sweep ${fast.sweepMs} should halve ${normal.sweepMs}`,
	);
	// Scaling the whole cycle instead of just the sweep would spread these by well over a second.
	assert.ok(
		Math.abs(slow.pauseMs - fast.pauseMs) < 100,
		`pause drifted: ${slow.pauseMs} vs ${normal.pauseMs} vs ${fast.pauseMs}`,
	);
	assert.ok(
		Math.abs(normal.pauseMs - fast.pauseMs) < 100,
		`pause drifted: ${slow.pauseMs} vs ${normal.pauseMs} vs ${fast.pauseMs}`,
	);
});

test("shimmer of empty text is empty", () => {
	assert.equal(shimmerString("", 0, shimmerTheme), "");
});

// ── tool activity ───────────────────────────────────────────────────────────

test("formatToolActivity collapses whitespace, prefers known args, and caps length", () => {
	assert.equal(
		formatToolActivity("bash", { command: "npm run  check\n --verbose" }),
		"bash npm run check --verbose",
	);
	assert.equal(formatToolActivity("ls", undefined), "ls");
	assert.equal(
		formatToolActivity("read", { limit: 20, file: "src/a.ts" }),
		"read src/a.ts",
	);
	assert.equal(
		formatToolActivity("custom", { note: "fallback value" }),
		"custom fallback value",
	);
	assert.equal(
		formatToolActivity("bash", { command: "x".repeat(200) }).length,
		80,
	);
	assert.equal(
		formatToolActivity("bash", { command: "x".repeat(200) }, 20).length,
		20,
	);
});

test("formatToolActivity strips terminal sequences from the arguments", () => {
	assert.equal(
		formatToolActivity("bash", {
			command: "\x1b[31mred\x1b[0m && \x1b]0;title\x07done",
		}),
		"bash red && done",
	);
});

test("an escape sequence straddling the cap never leaves a fragment", () => {
	// The colour sequence starts before character 80 and ends after it. Cutting first and
	// stripping second would keep "\x1b[3" and let it through.
	const command = `${"a".repeat(70)}\x1b[38;2;255;0;0m${"b".repeat(30)}`;
	const label = formatToolActivity("t", { command });
	assert.equal(label.includes("\x1b"), false);
	assert.equal(
		label.includes("[38;2"),
		false,
		"no half of the sequence survives as text",
	);
	assert.equal(label.length, 80);
});

test("stray control characters are removed but ordinary whitespace is kept as a space", () => {
	assert.equal(
		formatToolActivity("bash", { command: "a\x1bb\x07c\x00d\x7fe\x9bf" }),
		"bash abcdef",
	);
	assert.equal(
		formatToolActivity("bash", { command: "a\tb\r\nc" }),
		"bash a b c",
	);
	assert.equal(formatToolActivity("bash\x1b", undefined), "bash");
});

test("highlightActivity styles the tool name bold toolTitle and the argument accent", () => {
	const CODES: Record<string, number> = { toolTitle: 105, accent: 103 };
	const theme = {
		fg: (color: string, text: string) =>
			`\x1b[${CODES[color] ?? 199}m${text}\x1b[0m`,
		bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
	};
	const strip = (s: string) => s.replace(SGR, "");

	for (const [activity, tool, detail] of [
		["read src/app.ts", "read", "src/app.ts"],
		['grep  "handleRequest"', "grep", '"handleRequest"'],
		[
			"read /Users/me/My Documents/notes.txt",
			"read",
			"/Users/me/My Documents/notes.txt",
		],
		[
			"mf_plan_subagent  explore the auth flow",
			"mf_plan_subagent",
			"explore the auth flow",
		],
	] as const) {
		const out = highlightActivity(theme, activity);
		assert.equal(strip(out), activity, "every character is preserved");
		assert.ok(
			out.includes(`\x1b[105m\x1b[1m${tool}\x1b[22m\x1b[0m`),
			`${tool} is bold toolTitle`,
		);
		assert.ok(out.includes(`\x1b[103m${detail}\x1b[0m`), `${detail} is accent`);
	}

	const padded = highlightActivity(theme, "  read src/app.ts");
	assert.ok(
		padded.startsWith(`  ${theme.fg("toolTitle", theme.bold("read"))}`),
		"leading whitespace precedes the styled token",
	);
	assert.equal(
		highlightActivity(theme, "read"),
		theme.fg("toolTitle", theme.bold("read")),
		"a bare tool name has no accent segment",
	);
	assert.equal(highlightActivity(theme, ""), "");
	assert.equal(highlightActivity(theme, "   "), "   ");
});
