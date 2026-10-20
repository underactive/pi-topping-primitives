import type { Rgb } from "./rgb.js";

/** Provider id whose models are drawn in NVIDIA green: pi-switchyard's. */
export const SWITCHYARD_PROVIDER = "switchyard";

/** Bright NVIDIA green. */
export const NVIDIA_GREEN_HEX = "#84c51a";

/** Dark end of the NVIDIA green ramp used by statusline's Switchyard border. */
export const NVIDIA_GREEN_DARK_HEX = "#0b3d20";

/** True for the Switchyard provider id, ignoring case and surrounding whitespace. */
export function isSwitchyardProvider(provider?: string): boolean {
	return provider?.trim().toLowerCase() === SWITCHYARD_PROVIDER;
}

/** The four colours `renderCometBar` mixes: a dark floor, the body, the crest, and the empty trough. */
export interface CometPalette {
	readonly deep: Rgb;
	readonly base: Rgb;
	readonly light: Rgb;
	readonly trough: Rgb;
}

/**
 * Synthwave 84 greens, with a muted green trough so the bar stays coherent without competing
 * with the brighter phosphor head.
 */
export const SYNTHWAVE_GREENS: CometPalette = Object.freeze({
	deep: Object.freeze([11, 61, 32] as const),
	base: Object.freeze([114, 241, 184] as const),
	light: Object.freeze([185, 248, 217] as const),
	trough: Object.freeze([38, 100, 70] as const),
});
