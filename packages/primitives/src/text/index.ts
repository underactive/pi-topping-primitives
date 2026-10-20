/**
 * Text measurement and layout, sanitisers, and the small formatters the toppings share.
 *
 * Contract:
 * - `layout` is the one runtime pi-tui importer (`visibleWidth`, `sliceByColumn`); everything
 *   else here needs only Node. Pi's measuring is the ruler for wide characters, graphemes and
 *   escape sequences, so widths agree with what the renderer will draw.
 * - Four sanitisers, not one. `stripControlChars` and `sanitizedText` delete Unicode control
 *   and format characters; `sanitizeTerminalBytes` deletes C0, DEL and C1; `sanitizeLabel`
 *   strips the terminal sequences Node's regex covers first and turns the rest into spaces.
 *   They differ about tab, about invisible format characters and about whether a gap is left,
 *   and each docblock names the vendored copy it came from and what it does not do. None
 *   replaces pi-tui's `stripTerminalSequences` for untrusted input that can carry whole
 *   escape sequences.
 * - `stripSgr` removes colour and style escapes only, so an OSC 8 hyperlink survives it.
 * - `pickFitting([])` returns an empty string. Splash's copy threw.
 * - The elapsed formatters live in `./activity` (`formatElapsedClock`, `formatElapsedUnits`)
 *   and `dimAttribute` in `./activity-tui`; they are not repeated here.
 * - There is no token formatter: the toppings use five incompatible styles, so each host keeps
 *   its own until they agree. Cost has one style, `formatCostUsd`'s.
 * - The non-text helpers the toppings also copied (`isPlainObject`, the env-flag and
 *   notification helpers, `combineSignals`, `raceAbort`, `createDeadline`, `stableStringify`)
 *   are not here. `hostBelow` shipped in `./process` (0.8.0); the rest wait for web-tools',
 *   sensei's and compact's own adoption, so this subpath stays about text.
 * - No mutable module state. The module level holds one immutable `Intl.NumberFormat` and two
 *   global regular expressions (in `ansi.ts` and `sanitize.ts`), each only ever used through
 *   `String.prototype.replace`, which resets `lastIndex`, so calls cannot affect each other.
 *   Every exported value is a function or a string.
 */
export { stripSgr } from "./ansi.js";
export {
	formatCostUsd,
	formatCount,
	formatDurationCompact,
	formatPercent,
} from "./format.js";
export {
	ELLIPSIS,
	fitCell,
	joinParts,
	padCenter,
	padRight,
	pickFitting,
	truncateVisible,
	wrapCommaDelimited,
} from "./layout.js";
export {
	sanitizedText,
	sanitizeLabel,
	sanitizeTerminalBytes,
	stripControlChars,
} from "./sanitize.js";
