import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { easeFade, FADE_SHADE_COUNT } from "../activity/fade.js";

/** The slice of pi's `Theme` the shimmer and fade need. Structural, so a test can supply a stub. */
export interface AnsiTheme {
	getFgAnsi(color: ThemeColor): string;
	fg(color: ThemeColor, text: string): string;
}

/**
 * Parse a truecolor foreground escape (`ESC[38;2;R;G;Bm`) anywhere in `ansi`.
 *
 * Unanchored on purpose: pi themes can fold a colour into a compound SGR, such as
 * `ESC[1mESC[38;2;...m`. This reads truecolor only; a 256-colour or default-foreground escape is
 * `null`, which callers treat as "cannot blend".
 */
export function ansiToRgb(ansi: string): [number, number, number] | null {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching a terminal escape sequence
	const match = ansi.match(/\x1b\[38;2;(\d+);(\d+);(\d+)m/);
	if (!match) return null;
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Render one fade shade by blending the colorizer's colour toward the active theme's dim colour.
 * Falls back to the plain colorizer when either colour is not truecolor.
 */
export function fadeThemeColorString(
	text: string,
	shade: number,
	theme: Pick<Theme, "getFgAnsi">,
	colorizer: (text: string) => string,
	shadeCount: number = FADE_SHADE_COUNT,
): string {
	if (!text) return "";
	const source = ansiToRgb(colorizer("x"));
	const dim = ansiToRgb(theme.getFgAnsi("dim"));
	if (!source || !dim) return colorizer(text);
	const clampedShade = Math.max(0, Math.min(shadeCount - 1, Math.floor(shade)));
	const eased = easeFade((clampedShade + 1) / shadeCount);
	const blended = source.map((channel, index) =>
		Math.round(channel * (1 - eased) + (dim[index] ?? 0) * eased),
	);
	return `\x1b[38;2;${blended[0]};${blended[1]};${blended[2]}m${text}\x1b[0m`;
}

const SHIMMER_SWEEP_S = 2.0;
const SHIMMER_BAND_HALF = 5.0;
const SHIMMER_PADDING = 10;

/**
 * Codex-style light-sweep shimmer using the active Pi theme.
 *
 * The sweep geometry (band half-width, padding, speed scaling) is load-bearing for visual
 * parity across the family. With `invert=true`, the text colour is used at rest and the sweep
 * moves toward the theme's dim colour.
 */
export function shimmerString(
	text: string,
	elapsedMs: number,
	theme: AnsiTheme,
	direction: "ltr" | "rtl" = "ltr",
	speed: "slow" | "normal" | "fast" = "normal",
	invert = false,
): string {
	const chars = [...text];
	if (chars.length === 0) return "";
	const shimmerBase = ansiToRgb(theme.getFgAnsi(invert ? "text" : "dim"));
	const shimmerHighlight = ansiToRgb(theme.getFgAnsi(invert ? "dim" : "text"));
	if (!shimmerBase || !shimmerHighlight) return theme.fg("text", text);
	const period = chars.length + SHIMMER_PADDING * 2;
	const unitsPerS = period / SHIMMER_SWEEP_S;
	// The band crosses padding at either end while every character is still dim. Scaling only
	// the stretch where it actually overlaps the text keeps that dark pause identical at every
	// speed, so `speed` changes the sweep alone rather than the whole cycle.
	const litEnter = SHIMMER_PADDING - SHIMMER_BAND_HALF;
	const litExit = SHIMMER_PADDING + chars.length - 1 + SHIMMER_BAND_HALF;
	const enterS = litEnter / unitsPerS;
	const litS =
		(litExit - litEnter) /
		unitsPerS /
		(speed === "slow" ? 0.5 : speed === "fast" ? 2 : 1);
	const phase =
		(elapsedMs / 1000) % (enterS + litS + (period - litExit) / unitsPerS);
	const linear =
		phase < enterS
			? phase * unitsPerS
			: phase < enterS + litS
				? litEnter + ((phase - enterS) / litS) * (litExit - litEnter)
				: litExit + (phase - enterS - litS) * unitsPerS;
	const pos = direction === "rtl" ? period - linear : linear;

	let out = "";
	for (let i = 0; i < chars.length; i++) {
		const ch = chars[i];
		const dist = Math.abs(i + SHIMMER_PADDING - pos);
		const t =
			dist <= SHIMMER_BAND_HALF
				? 0.5 * (1 + Math.cos((Math.PI * dist) / SHIMMER_BAND_HALF))
				: 0;
		const alpha = t * 0.9;
		const r = Math.round(
			shimmerHighlight[0] * alpha + shimmerBase[0] * (1 - alpha),
		);
		const g = Math.round(
			shimmerHighlight[1] * alpha + shimmerBase[1] * (1 - alpha),
		);
		const b = Math.round(
			shimmerHighlight[2] * alpha + shimmerBase[2] * (1 - alpha),
		);
		const bold = !invert && t > 0.2 ? "\x1b[1m" : "";
		out += `${bold}\x1b[38;2;${r};${g};${b}m${ch}\x1b[22m`;
	}
	return `${out}\x1b[0m`;
}
