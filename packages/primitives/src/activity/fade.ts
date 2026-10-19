import { WORKING_STATUS_SLIDE_MS } from "../contracts/index.js";

/** Number of discrete, eased shades used by the token-rate and response-model fades. */
export const FADE_SHADE_COUNT = 5;

/** Raised-cosine ease shared by the discrete and continuous fades. Clamps `progress` to 0..1. */
export function easeFade(progress: number): number {
	const clamped = Math.max(0, Math.min(1, progress));
	return 0.5 * (1 - Math.cos(Math.PI * clamped));
}

/**
 * The discrete shade, `0` to `shadeCount - 1`, `elapsedMs` into a fade of `fadeMs` split into
 * `shadeCount` equal steps. Out-of-range elapsed times clamp rather than overflow.
 */
export function fadeShade(
	elapsedMs: number,
	fadeMs: number,
	shadeCount: number,
): number {
	const last = Math.max(0, Math.floor(shadeCount) - 1);
	const step = fadeMs / shadeCount;
	if (!(step > 0)) return last;
	const shade = Math.floor(elapsedMs / step);
	return Number.isNaN(shade) ? 0 : Math.max(0, Math.min(last, shade));
}

/**
 * The part of a sliding label visible `elapsedMs` after it appeared. It emerges tail first from
 * behind the separator before it, and shows whole once `slideMs` has passed. Counts code points,
 * so an astral character is never cut in half.
 */
export function slideOutTail(
	text: string,
	elapsedMs: number,
	slideMs: number = WORKING_STATUS_SLIDE_MS,
): string {
	if (elapsedMs >= slideMs) return text;
	const chars = [...text];
	const progress = Math.max(0, elapsedMs) / slideMs;
	const shown = Math.round(chars.length * easeFade(progress));
	return chars.slice(chars.length - shown).join("");
}
