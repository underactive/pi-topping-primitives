import type { TerminalColorMode } from "@earendil-works/pi-tui";
import { cosineFalloff } from "./fade.js";
import { type CometPalette, SYNTHWAVE_GREENS } from "./palette.js";
import { mixRgb, rgbToFgAnsi } from "./rgb.js";

/** Cells in the bar. The context graph and the compaction bar share this width. */
export const BAR_CELLS = 20;

/** The filled-cell glyph (left five-eighths block). */
export const BAR_FILLED = "\u258b";

/** The empty-cell glyph (light shade). */
export const BAR_TROUGH = "\u2591";

const COMET_SWEEP_MS = 2_000;
const COMET_START_PADDING_CELLS = 2;
const COMET_END_PADDING_CELLS = 6;
const COMET_HALF_WIDTH_CELLS = 1.5;
const COMET_TRAIL_DECAY_CELLS = 3.2;

/** What a bar needs from its host. */
export interface CometBarOptions {
	/** Escape depth. Required: this module reads no terminal state. */
	readonly mode: TerminalColorMode;
	/**
	 * Time into the sweep. Anything but a finite positive number reads as 0, which parks the
	 * comet at its start. The comet crosses the bar right to left every 2 seconds.
	 */
	readonly elapsedMs?: number;
	/** Defaults to `SYNTHWAVE_GREENS`. */
	readonly palette?: CometPalette;
}

function normalizeElapsedMs(elapsedMs: number | undefined): number {
	return Number.isFinite(elapsedMs) && elapsedMs !== undefined && elapsedMs > 0
		? elapsedMs
		: 0;
}

function renderCometCell(
	position: number,
	filled: number,
	elapsedMs: number,
	mode: TerminalColorMode,
	palette: CometPalette,
): string {
	const phase = (elapsedMs % COMET_SWEEP_MS) / COMET_SWEEP_MS;
	const head =
		filled +
		COMET_START_PADDING_CELLS -
		phase * (filled + COMET_END_PADDING_CELLS);
	const behind = position - head;
	const trail = behind >= 0 ? Math.exp(-behind / COMET_TRAIL_DECAY_CELLS) : 0;
	const crest = cosineFalloff(
		Math.abs(position - head),
		COMET_HALF_WIDTH_CELLS,
	);
	const intensity = Math.min(1, Math.max(trail * 0.82, crest));
	const trailBase = mixRgb(palette.deep, palette.base, 0.62 + 0.38 * trail);
	const color = mixRgb(trailBase, palette.light, intensity * 0.9);
	const emphasized = crest > 0.25;
	return `${emphasized ? "\x1b[1m" : ""}${rgbToFgAnsi(color, mode)}${BAR_FILLED}${emphasized ? "\x1b[22m" : ""}`;
}

/**
 * A 20-cell progress bar with a phosphor comet sweeping through its filled part: `percent`
 * (clamped to 0..100; NaN and the infinities read as 0) fills that share of `BAR_CELLS` and the
 * rest is a dim trough. The bar carries its own colour and ends with `ESC[39m`.
 *
 * Resets stay foreground- and attribute-only (`39`, `22`, never `0`), so a background fill the
 * caller painted underneath survives the whole run.
 */
export function renderCometBar(
	percent: number,
	options: CometBarOptions,
): string {
	const { mode } = options;
	const palette = options.palette ?? SYNTHWAVE_GREENS;
	const clamped = Number.isFinite(percent)
		? Math.min(100, Math.max(0, percent))
		: 0;
	const filled = Math.min(
		BAR_CELLS,
		Math.max(0, Math.round((clamped * BAR_CELLS) / 100)),
	);
	const elapsedMs = normalizeElapsedMs(options.elapsedMs);
	let bar = "";
	for (let i = 0; i < filled; i++) {
		bar += renderCometCell(i, filled, elapsedMs, mode, palette);
	}
	if (filled < BAR_CELLS) {
		bar += `\x1b[39m\x1b[2m${rgbToFgAnsi(palette.trough, mode)}${BAR_TROUGH.repeat(BAR_CELLS - filled)}\x1b[22m`;
	}
	bar += "\x1b[39m";
	return bar;
}
