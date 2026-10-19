/**
 * Rendering for `./activity`: meter cells and rows, thinking-level colours, the shimmer and
 * colour fades, and tool-activity labels.
 *
 * Contract:
 * - Colour is the host's: every function takes a theme (or a structural stub of the one or two
 *   methods it uses) and nothing reads a global theme.
 * - No module state: two copies of this package in one process do not interfere.
 * - `ansiToRgb` reads truecolor only and finds the escape anywhere in the string. It is not a
 *   general colour parser; a 256-colour or default-foreground escape reads `null`.
 * - `formatToolActivity` treats tool arguments as untrusted: it strips terminal sequences and
 *   stray control characters before it collapses whitespace and truncates.
 * - Pi is imported for types, plus one runtime function, `stripTerminalSequences` from pi-tui.
 */
export {
	type Colorize,
	colorizeMeterCell,
	dimAttribute,
	type FgTheme,
	renderIdleMeter,
	renderMeter,
} from "./meter.js";
export {
	type AnsiTheme,
	ansiToRgb,
	fadeThemeColorString,
	shimmerString,
} from "./shimmer.js";
export {
	type ThinkingLevel,
	thinkingLevelColorizer,
	thinkingLevelThemeColor,
} from "./thinking.js";
export {
	type ActivityTheme,
	formatToolActivity,
	highlightActivity,
} from "./tool-activity.js";
