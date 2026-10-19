import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import {
	ACTIVITY_METER_WIDTH,
	type ActivityMeter,
	ActivityMeterLevel,
	METER_GLYPHS,
} from "../activity/meter.js";

/** The slice of pi's `Theme` the meter needs. Structural, so a test can supply a stub. */
export interface FgTheme {
	fg(color: ThemeColor, text: string): string;
}

/**
 * How active cells are coloured: a theme colour, or a function that colours text, such as pi's
 * thinking-level border colour (see `thinkingLevelColorizer`).
 */
export type Colorize = ThemeColor | ((text: string) => string);

/**
 * Wrap text in ANSI dim (SGR 2 / reset 22).
 *
 * `theme.fg("dim", ...)` sets a gray colour instead of the ANSI dim attribute, so it would
 * overwrite an already-applied accent colour rather than darkening it; the raw SGR codes are
 * needed to dim on top of an existing colour.
 */
export function dimAttribute(text: string): string {
	return `\x1b[2m${text}\x1b[22m`;
}

/** Colourise one meter cell: dim at `IDLE`, `colorize` otherwise, and `dimmed` darkens the latter. */
export function colorizeMeterCell(
	level: ActivityMeterLevel,
	glyph: string,
	theme: FgTheme,
	colorize: Colorize,
	dimmed?: boolean,
): string {
	if (level === ActivityMeterLevel.IDLE) return theme.fg("dim", glyph);
	const colored =
		typeof colorize === "string" ? theme.fg(colorize, glyph) : colorize(glyph);
	return dimmed ? dimAttribute(colored) : colored;
}

/** Render a meter with every cell coloured by `colorizeMeterCell`. */
export function renderMeter(
	meter: ActivityMeter,
	theme: FgTheme,
	colorize: Colorize,
	dimmed?: boolean,
): string {
	return meter.render((level, glyph) =>
		colorizeMeterCell(level, glyph, theme, colorize, dimmed),
	);
}

/** The placeholder for a row that has no meter yet: a dim run of idle cells. */
export function renderIdleMeter(
	theme: FgTheme,
	width: number = ACTIVITY_METER_WIDTH,
): string {
	return theme.fg("dim", METER_GLYPHS[ActivityMeterLevel.IDLE].repeat(width));
}
