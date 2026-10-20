import type { TerminalColorMode } from "@earendil-works/pi-tui";

/** An sRGB colour as `[r, g, b]`, each channel 0 to 255. */
export type Rgb = readonly [number, number, number];

const HEX_RE = /^#?([0-9a-f]{6})$/i;

/**
 * Every SGR colour the toppings emit: a truecolor or 256-colour foreground or background, or the
 * default-foreground reset. Not global, so `exec` carries no `lastIndex` state between calls;
 * `./fade` derives its global twin from `source`.
 */
export const SGR_COLOR_RE =
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching a terminal escape sequence
	/\x1b\[(38|48);2;(\d+);(\d+);(\d+)m|\x1b\[(38|48);5;(\d+)m|\x1b\[39m/;

/** Parse `#rrggbb` (the `#` is optional, case is ignored). Anything else is `undefined`. */
export function parseHex(hex: string): [number, number, number] | undefined {
	const digits = HEX_RE.exec(hex)?.[1];
	if (digits === undefined) return undefined;
	const n = Number.parseInt(digits, 16);
	return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function cubeLevel(v: number): number {
	return v === 0 ? 0 : 55 + v * 40;
}

/** Linear blend of `from` toward `to`; `amount` clamps to 0..1 (NaN reads as 0) and channels round. */
export function mixRgb(
	from: Rgb,
	to: Rgb,
	amount: number,
): [number, number, number] {
	const clamped = amount > 0 ? Math.min(1, amount) : 0;
	return [
		Math.round(from[0] + (to[0] - from[0]) * clamped),
		Math.round(from[1] + (to[1] - from[1]) * clamped),
		Math.round(from[2] + (to[2] - from[2]) * clamped),
	];
}

/**
 * The xterm-256 index nearest to an RGB colour. Equal channels take the 24-step gray ramp
 * (below 8 is black, above 248 is white); anything else takes the 6x6x6 cube by scaling each
 * channel linearly. That is an approximation, not a search for the nearest entry, and it is
 * what the vendored copies did, kept so converted colours match byte for byte.
 */
export function rgbTo256(r: number, g: number, b: number): number {
	if (r === g && g === b) {
		if (r < 8) return 16;
		if (r > 248) return 231;
		return 232 + Math.round(((r - 8) / 247) * 24);
	}
	const scale = (v: number) => Math.round((v / 255) * 5);
	return 16 + 36 * scale(r) + 6 * scale(g) + scale(b);
}

/**
 * Resolve an xterm-256 index to RGB: 16 to 231 are the 6x6x6 cube at levels 0, 95, 135, 175,
 * 215 and 255, matching pi-tui's `colorToRgb(indexedColor(n))`; 232 to 255 are the gray ramp
 * `8 + 10k`. Indices 0 to 15 are the terminal's own theme colours, which no escape can read
 * back, so they go through the cube formula at index 0 and come out black to keep fades
 * deterministic.
 *
 * 0.6.0 and earlier used statusline's `55 + v * 51`; 0.7.0 corrects it, so a partial fade of
 * indices 17–231 changes.
 */
export function xterm256ToRgb(n: number): [number, number, number] {
	if (n >= 232) {
		const v = 8 + (n - 232) * 10;
		return [v, v, v];
	}
	const i = Math.max(0, n - 16);
	return [
		cubeLevel(Math.floor(i / 36) % 6),
		cubeLevel(Math.floor(i / 6) % 6),
		cubeLevel(i % 6),
	];
}

/**
 * Foreground escape for three channels. Takes the channels rather than a tuple so a caller on
 * a hot path (a per-cell fade, a per-frame sweep) does not allocate one per colour.
 */
export function channelsToFgAnsi(
	r: number,
	g: number,
	b: number,
	mode: TerminalColorMode,
): string {
	return mode === "truecolor"
		? `\x1b[38;2;${r};${g};${b}m`
		: `\x1b[38;5;${rgbTo256(r, g, b)}m`;
}

/** Foreground escape for a tuple. `mode` is the host's: this module reads no terminal state. */
export function rgbToFgAnsi(rgb: Rgb, mode: TerminalColorMode): string {
	return channelsToFgAnsi(rgb[0], rgb[1], rgb[2], mode);
}

/** Foreground escape for `#rrggbb`, or an empty string when `hex` does not parse. */
export function hexToFgAnsi(hex: string, mode: TerminalColorMode): string {
	const rgb = parseHex(hex);
	return rgb === undefined ? "" : rgbToFgAnsi(rgb, mode);
}

/** What `parseSgrColor` found. `rgb` is resolved for indexed colours; `default` has none. */
export type SgrColor =
	| {
			readonly kind: "truecolor";
			readonly plane: "fg" | "bg";
			readonly rgb: Rgb;
	  }
	| {
			readonly kind: "indexed";
			readonly plane: "fg" | "bg";
			readonly index: number;
			readonly rgb: Rgb;
	  }
	| { readonly kind: "default"; readonly plane: "fg" };

/**
 * Read the first colour escape anywhere in `text`: `ESC[38;2;R;G;Bm` or `ESC[48;2;R;G;Bm`,
 * `ESC[38;5;Nm` or `ESC[48;5;Nm`, or `ESC[39m`. `ESC[49m` is not a colour and reads as
 * nothing. Unanchored, so a colour sitting after `ESC[1m` is found.
 *
 * This is deliberately not `./activity-tui`'s `ansiToRgb`. That one answers a different
 * question, "can this foreground be blended?", and returns `null` for everything but a
 * truecolor foreground. The two results have different shapes so one cannot be passed where
 * the other is expected.
 */
export function parseSgrColor(text: string): SgrColor | undefined {
	const match = SGR_COLOR_RE.exec(text);
	if (match === null) return undefined;
	const [, truecolorPlane, r, g, b, indexedPlane, index] = match;
	if (truecolorPlane !== undefined) {
		return {
			kind: "truecolor",
			plane: truecolorPlane === "38" ? "fg" : "bg",
			rgb: [Number(r), Number(g), Number(b)],
		};
	}
	if (indexedPlane !== undefined) {
		return {
			kind: "indexed",
			plane: indexedPlane === "38" ? "fg" : "bg",
			index: Number(index),
			rgb: xterm256ToRgb(Number(index)),
		};
	}
	return { kind: "default", plane: "fg" };
}
