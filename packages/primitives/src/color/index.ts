/**
 * Colour maths pi-tui does not export: tuple RGB, 256-colour conversion, hue conversion, the
 * fade, the shimmer cell, the Switchyard palette and the phosphor comet bar. pi-tui's own
 * `parseColor`, `colorToHex`, `mixColors`, `foregroundAnsi`, `getTerminalColorMode` and
 * friends are not repeated here; use those where they fit.
 *
 * Contract:
 * - No runtime pi import. The one pi reference is the `TerminalColorMode` type. The host
 *   passes `mode` on every call that emits an escape (statusline's capability-cached
 *   `detectColorMode`, compact's `getTerminalColorMode`), so nothing here reads global state
 *   and the maths can be tested without touching pi-tui's capability cache.
 * - `parseSgrColor` reads truecolor, 256-colour and `ESC[39m` escapes. It is deliberately not
 *   `./activity-tui`'s `ansiToRgb`, which reads a truecolor foreground only and returns `null`
 *   for the rest, because the shimmer and the colour fade rely on `null` meaning "cannot
 *   blend". The names and the result shapes differ so one cannot be swapped for the other.
 * - `easeFade` and `FADE_SHADE_COUNT` live in `./activity`; `dimAttribute` lives in
 *   `./activity-tui`. They are not repeated here.
 * - Hot paths allocate no more than the vendored copies did: `channelsToFgAnsi` takes channels
 *   instead of a tuple, and the palettes are frozen at module load rather than built per call.
 * - Statusline's `StatusTheme`, its `NvidiaGreenBorder` and `RainbowBorder`, and splash's
 *   backdrop samplers stay in their repos: they are policy over these primitives.
 * - No mutable module state, and every exported table is frozen. `fade.ts` keeps one module-level
 *   global regular expression; it is only ever used through `String.prototype.replace`, which
 *   resets its `lastIndex`, so calls cannot affect each other.
 */
export type { TerminalColorMode } from "@earendil-works/pi-tui";
export {
	BAR_CELLS,
	BAR_FILLED,
	BAR_TROUGH,
	type CometBarOptions,
	renderCometBar,
} from "./comet-bar.js";
export {
	cosineFalloff,
	fadeRgbToward,
	type ShimmerCellOptions,
	type ShimmerCellPalette,
	shimmerCell,
} from "./fade.js";
export { hslToRgb, hsvToRgb, wrapDeg } from "./hue.js";
export {
	type CometPalette,
	isSwitchyardProvider,
	NVIDIA_GREEN_DARK_HEX,
	NVIDIA_GREEN_HEX,
	SWITCHYARD_PROVIDER,
	SYNTHWAVE_GREENS,
} from "./palette.js";
export {
	channelsToFgAnsi,
	hexToFgAnsi,
	mixRgb,
	parseHex,
	parseSgrColor,
	type Rgb,
	rgbTo256,
	rgbToFgAnsi,
	type SgrColor,
	xterm256ToRgb,
} from "./rgb.js";
