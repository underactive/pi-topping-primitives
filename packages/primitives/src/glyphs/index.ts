/**
 * Glyph tables the toppings draw with: rectangular frames, spinner frames and thinking-level labels. Data and one pure lookup.
 *
 * Contract:
 * - No imports, no rendering, no module state. Every exported table is frozen at every level,
 *   so a host that mutates one fails loudly instead of changing every other topping's frame.
 * - `THINKING_LEVEL_LABELS` holds statusline's three presets for the graded levels; `off` has no
 *   label. `thinkingLevelLabel` returns `""` for `off`, absent and unknown levels. There is no
 *   raw-text fallback; a host that wants unknown levels visible adds that at its own call site.
 * - `GradedThinkingLevel` is declared here, not imported, and the tests hold it to `./models`.
 * - `BoxGlyphs` is the six glyphs of a plain rectangle. Frames that also need T-junctions
 *   (moa-fusion's progress table) keep their own wider type; joins are frame policy.
 * - `BOX_STYLES` is the four border styles pi-topping's User Prompt box and statusline's boxed
 *   layout both offer; `ASCII_BOX` is the plain-text fallback for terminals without box drawing.
 * - `SPINNER_FRAMES` is the braille set pi-tui's own Loader cycles, at `SPINNER_FRAME_MS` per
 *   frame. `QUADRANT_SPINNER_FRAMES` is the four-step circle the progress tables use.
 * - The spinner tables are frozen `readonly` tuples, so they do not satisfy an API typed as a
 *   mutable `string[]` (pi-tui's `Loader` takes one). Pass a copy: `[...SPINNER_FRAMES]`.
 */

/** The six glyphs of a rectangular frame. */
export interface BoxGlyphs {
	readonly topLeft: string;
	readonly topRight: string;
	readonly bottomLeft: string;
	readonly bottomRight: string;
	readonly horizontal: string;
	readonly vertical: string;
}

/** The border styles hosts offer in their settings. */
export type BoxStyle = "rounded" | "heavy" | "double" | "single";

/** Plain-text frame for presets that must not rely on box-drawing glyphs. */
export const ASCII_BOX: BoxGlyphs = Object.freeze({
	topLeft: "+",
	topRight: "+",
	bottomLeft: "+",
	bottomRight: "+",
	horizontal: "-",
	vertical: "|",
});

/** Frame glyphs per style. */
export const BOX_STYLES: Readonly<Record<BoxStyle, BoxGlyphs>> = Object.freeze({
	rounded: Object.freeze({
		topLeft: "╭",
		topRight: "╮",
		bottomLeft: "╰",
		bottomRight: "╯",
		horizontal: "─",
		vertical: "│",
	}),
	heavy: Object.freeze({
		topLeft: "┏",
		topRight: "┓",
		bottomLeft: "┗",
		bottomRight: "┛",
		horizontal: "━",
		vertical: "┃",
	}),
	double: Object.freeze({
		topLeft: "╔",
		topRight: "╗",
		bottomLeft: "╚",
		bottomRight: "╝",
		horizontal: "═",
		vertical: "║",
	}),
	single: Object.freeze({
		topLeft: "┌",
		topRight: "┐",
		bottomLeft: "└",
		bottomRight: "┘",
		horizontal: "─",
		vertical: "│",
	}),
});

/** The braille spinner pi-tui's Loader cycles. moa-fusion calls it `BRAILLE_SPINNER_FRAMES`. */
export const SPINNER_FRAMES = Object.freeze([
	"⠋",
	"⠙",
	"⠹",
	"⠸",
	"⠼",
	"⠴",
	"⠦",
	"⠧",
	"⠇",
	"⠏",
] as const);

/** Milliseconds per `SPINNER_FRAMES` frame, matching pi-tui's Loader cadence. */
export const SPINNER_FRAME_MS = 80;

/** The four-step circle spinner the MoA and audit progress tables use. */
export const QUADRANT_SPINNER_FRAMES = Object.freeze([
	"◐",
	"◓",
	"◑",
	"◒",
] as const);

/** Pi's thinking levels above `off`. Declared here because this module imports nothing. */
export type GradedThinkingLevel =
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh"
	| "max";

/** The symbol presets the thinking-level labels come in, named as statusline's `SymbolPreset`. */
export type ThinkingGlyphPreset = "nerd" | "unicode" | "ascii";

/** A glyph and short name per graded thinking level, as statusline's model segment draws them. */
export const THINKING_LEVEL_LABELS: Readonly<
	Record<ThinkingGlyphPreset, Readonly<Record<GradedThinkingLevel, string>>>
> = Object.freeze({
	nerd: Object.freeze({
		minimal: "\u{f0a9e} min",
		low: "\u{f0a9f} low",
		medium: "\u{f0aa1} med",
		high: "\u{f0aa3} high",
		xhigh: "\u{f0aa5} xhigh",
		max: "\u{f06d} max",
	}),
	unicode: Object.freeze({
		minimal: "○ min",
		low: "◔ low",
		medium: "◑ med",
		high: "◒ high",
		xhigh: "◕ xhigh",
		max: "◉ max",
	}),
	ascii: Object.freeze({
		minimal: "[min]",
		low: "[low]",
		medium: "[med]",
		high: "[high]",
		xhigh: "[xhigh]",
		max: "[max]",
	}),
});

/**
 * The label for a thinking level in a preset, or "" for `off`, an absent level and anything
 * that is not a graded level. An own-key check, so `"constructor"` gives "" too. Takes any
 * string so a host's own level union fits without a cast.
 */
export function thinkingLevelLabel(
	level: string | undefined,
	preset: ThinkingGlyphPreset,
): string {
	const labels = THINKING_LEVEL_LABELS[preset];
	if (level === undefined || !Object.hasOwn(labels, level)) return "";
	return labels[level as GradedThinkingLevel];
}
