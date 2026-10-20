/** Normalize degrees into the range 0 (inclusive) to 360 (exclusive). */
export function wrapDeg(deg: number): number {
	return ((deg % 360) + 360) % 360;
}

/**
 * HSL to RGB. `h` is degrees and is not wrapped here: pass a value from `wrapDeg` or already
 * in 0 to 360. `s` and `l` are 0 to 1. Channels are rounded to integers 0 to 255.
 */
export function hslToRgb(
	h: number,
	s: number,
	l: number,
): [number, number, number] {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	let r: number;
	let g: number;
	let b: number;
	if (h < 60) {
		r = c;
		g = x;
		b = 0;
	} else if (h < 120) {
		r = x;
		g = c;
		b = 0;
	} else if (h < 180) {
		r = 0;
		g = c;
		b = x;
	} else if (h < 240) {
		r = 0;
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		g = 0;
		b = c;
	} else {
		r = c;
		g = 0;
		b = x;
	}
	return [
		Math.round((r + m) * 255),
		Math.round((g + m) * 255),
		Math.round((b + m) * 255),
	];
}

/**
 * HSV to RGB. `h` is degrees and wraps, so negative and multi-turn values are fine. `s` and
 * `v` are 0 to 1. Returns a tuple; splash's `hsvRgb` returns the same numbers joined as
 * `r;g;b` and keeps its own copy because a swatch paints one cell per call.
 */
export function hsvToRgb(
	h: number,
	s: number,
	v: number,
): [number, number, number] {
	const chroma = v * s;
	const sector = wrapDeg(h) / 60;
	const x = chroma * (1 - Math.abs((sector % 2) - 1));
	let r: number;
	let g: number;
	let b: number;
	if (sector < 1) {
		r = chroma;
		g = x;
		b = 0;
	} else if (sector < 2) {
		r = x;
		g = chroma;
		b = 0;
	} else if (sector < 3) {
		r = 0;
		g = chroma;
		b = x;
	} else if (sector < 4) {
		r = 0;
		g = x;
		b = chroma;
	} else if (sector < 5) {
		r = x;
		g = 0;
		b = chroma;
	} else {
		r = chroma;
		g = 0;
		b = x;
	}
	const base = v - chroma;
	return [
		Math.round((r + base) * 255),
		Math.round((g + base) * 255),
		Math.round((b + base) * 255),
	];
}
