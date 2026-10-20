import type { TerminalColorMode } from "@earendil-works/pi-tui";
import {
	channelsToFgAnsi,
	type Rgb,
	SGR_COLOR_RE,
	xterm256ToRgb,
} from "./rgb.js";

/**
 * Stand-in for the terminal's default foreground when a fade must recolour it: the terminal
 * will not say what it is, so a light neutral keeps plain labels fading with their coloured
 * neighbours.
 */
const DEFAULT_FG_STAND_IN: Rgb = Object.freeze([204, 204, 204] as const);

/**
 * `SGR_COLOR_RE` with the global flag, for `replace`. A global regex keeps `lastIndex` between
 * calls, but `String.prototype.replace` resets it to 0 before it starts and leaves it at 0
 * after, so sharing one instance at module level is safe as long as it is only used there.
 */
const SGR_COLORS = new RegExp(SGR_COLOR_RE.source, "g");

const SHIMMER_BAND_HALF = 5;
const SHIMMER_PEAK_ALPHA = 0.9;
const SHIMMER_BOLD_ABOVE = 0.2;

/**
 * Raised-cosine falloff: 1 at distance 0, falling to 0 at `halfWidth` and staying 0 beyond. The
 * distance is a magnitude, so a negative one reads as its absolute value, and a `halfWidth` of
 * zero or less is all zero.
 */
export function cosineFalloff(distance: number, halfWidth: number): number {
	const magnitude = Math.abs(distance);
	if (!(magnitude < halfWidth)) return 0;
	return 0.5 * (1 + Math.cos((Math.PI * magnitude) / halfWidth));
}

/**
 * Blend every colour already present in `text` toward `target` by `opacity` (1 leaves the text
 * untouched, 0 sinks it fully into `target`; values outside 0 to 1 clamp, and NaN reads as no
 * fade), so a fully styled group can fade as a whole without re-rendering its parts.
 *
 * Recognised: truecolor and 256-colour foregrounds and backgrounds, each written back in the
 * same plane and in `mode`, and `ESC[39m`, which is recoloured from a neutral stand-in so a
 * plain label fades alongside its coloured neighbours. `ESC[49m` is left alone so a
 * transparent bar keeps the terminal's own background. A colour folded into a compound SGR
 * (`ESC[1;38;2;...m`) is not recognised and passes through unchanged.
 *
 * Each channel becomes `round(c * opacity + target * (1 - opacity))`. Indexed colours resolve
 * through `xterm256ToRgb`, so indices 0 to 15 fade as black.
 */
export function fadeRgbToward(
	text: string,
	target: Rgb,
	opacity: number,
	mode: TerminalColorMode,
): string {
	const alpha = Math.max(0, Math.min(1, opacity));
	// Also true for NaN, which would otherwise write `NaN` into every channel.
	if (!(alpha < 1)) return text;
	return text.replace(
		SGR_COLORS,
		(
			_match: string,
			truecolorPlane?: string,
			r?: string,
			g?: string,
			b?: string,
			indexedPlane?: string,
			index?: string,
		) => {
			let plane = "38";
			let red = DEFAULT_FG_STAND_IN[0];
			let green = DEFAULT_FG_STAND_IN[1];
			let blue = DEFAULT_FG_STAND_IN[2];
			if (truecolorPlane) {
				plane = truecolorPlane;
				red = Number(r);
				green = Number(g);
				blue = Number(b);
			} else if (indexedPlane) {
				plane = indexedPlane;
				const indexed = xterm256ToRgb(Number(index));
				red = indexed[0];
				green = indexed[1];
				blue = indexed[2];
			}
			const fg = channelsToFgAnsi(
				Math.round(red * alpha + target[0] * (1 - alpha)),
				Math.round(green * alpha + target[1] * (1 - alpha)),
				Math.round(blue * alpha + target[2] * (1 - alpha)),
				mode,
			);
			return plane === "38" ? fg : fg.replace("\x1b[38;", "\x1b[48;");
		},
	);
}

/** The two inks `shimmerCell` blends between. */
export interface ShimmerCellPalette {
	readonly base: Rgb;
	readonly highlight: Rgb;
}

/** Geometry of one shimmer band. Every field is optional. */
export interface ShimmerCellOptions {
	/** Half-width of the band in cells (default 5). A cell farther than this is all base ink. */
	readonly bandHalf?: number;
	/** Peak blend toward the highlight at the crest (default 0.9, so a trace of base remains). */
	readonly peakAlpha?: number;
	/** Cells whose band strength exceeds this are also bold (default 0.2). */
	readonly boldAbove?: number;
}

/**
 * One cell of a shimmer: a raised-cosine crest blending `palette.base` into
 * `palette.highlight` at `dist` cells from the band's centre, fading back to the base ink
 * outside `bandHalf`. `dist` is a magnitude (a negative one reads as its absolute value), and a
 * `bandHalf` of zero or less, or a non-finite `dist`, is all base ink. Always truecolor: callers
 * fall back to a settled line on a 256-colour theme. A cell past `boldAbove` is wrapped in bold
 * (`ESC[1m` ... `ESC[22m`); the colour is never closed, so a surrounding line closes it with its
 * own `ESC[39m`.
 *
 * `./activity-tui`'s `shimmerString` runs its own loop, because it always closes every cell
 * with `ESC[22m` and sweeps a string rather than painting one cell.
 */
export function shimmerCell(
	ch: string,
	dist: number,
	palette: ShimmerCellPalette,
	options?: ShimmerCellOptions,
): string {
	const bandHalf = options?.bandHalf ?? SHIMMER_BAND_HALF;
	const peakAlpha = options?.peakAlpha ?? SHIMMER_PEAK_ALPHA;
	const boldAbove = options?.boldAbove ?? SHIMMER_BOLD_ABOVE;
	const magnitude = Math.abs(dist);
	const t =
		magnitude <= bandHalf && bandHalf > 0
			? 0.5 * (1 + Math.cos((Math.PI * magnitude) / bandHalf))
			: 0;
	const alpha = t * peakAlpha;
	const { base, highlight } = palette;
	const r = Math.round(highlight[0] * alpha + base[0] * (1 - alpha));
	const g = Math.round(highlight[1] * alpha + base[1] * (1 - alpha));
	const b = Math.round(highlight[2] * alpha + base[2] * (1 - alpha));
	const fg = `\x1b[38;2;${r};${g};${b}m`;
	return t > boldAbove ? `\x1b[1m${fg}${ch}\x1b[22m` : `${fg}${ch}`;
}
