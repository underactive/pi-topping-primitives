/** Levels of one meter cell, lowest to highest. A cell renders as the braille glyph for its level. */
export const ActivityMeterLevel = Object.freeze({
	IDLE: 0,
	LOW: 1,
	MEDIUM: 2,
	HIGH: 3,
	PEAK_1: 4,
	PEAK_2: 5,
	PEAK_3: 6,
	FULL: 7,
} as const);

export type ActivityMeterLevel =
	(typeof ActivityMeterLevel)[keyof typeof ActivityMeterLevel];

/** Which end the newest cell enters at. `rtl` puts the newest cell on the right. */
export type MeterDirection = "ltr" | "rtl";

/** Cells in a default meter. */
export const ACTIVITY_METER_WIDTH = 8;

/**
 * Rate at or above which a cell is full. Inclusive: 80 tokens per second reads full, where
 * the legacy 40 tps scale needed a rate strictly above it to reach the same top level.
 */
export const DEFAULT_METER_UPPER_BOUND_TPS = 80;

/** The pre-0.3.0 widget ceiling. Pass it to `rateToLevel` where the old look must be kept. */
export const LEGACY_METER_UPPER_BOUND_TPS = 40;

/** Lowest and highest ceiling a settings UI should offer. `rateToLevel` itself does not clamp. */
export const METER_UPPER_BOUND_TPS_MIN = 10;
export const METER_UPPER_BOUND_TPS_MAX = 1000;

/** The braille ramp, indexed by level. */
export const METER_GLYPHS: Readonly<Record<ActivityMeterLevel, string>> =
	Object.freeze({
		[ActivityMeterLevel.IDLE]: "⢀",
		[ActivityMeterLevel.LOW]: "⣀",
		[ActivityMeterLevel.MEDIUM]: "⣠",
		[ActivityMeterLevel.HIGH]: "⣤",
		[ActivityMeterLevel.PEAK_1]: "⣴",
		[ActivityMeterLevel.PEAK_2]: "⣶",
		[ActivityMeterLevel.PEAK_3]: "⣾",
		[ActivityMeterLevel.FULL]: "⣿",
	});

// Levels below full retain the original 40 tps scale's proportions.
const LEGACY_FULL_SCALE_TPS = 40;
const RATE_THRESHOLDS = [0, 5, 10, 15, 22, 30] as const;

export interface RateToLevelOptions {
	/**
	 * `"idle"` reads NaN and both infinities as `IDLE`. Left out, +Infinity reads full and NaN
	 * and negative rates fall through to `IDLE`.
	 */
	nonFiniteRate?: "idle";
}

/**
 * Convert an estimated output-token rate to a display level. Rates at or above `upperBoundTps`
 * render as full; the lower levels scale in proportion to the bound.
 */
export function rateToLevel(
	tokensPerSecond: number,
	upperBoundTps: number = DEFAULT_METER_UPPER_BOUND_TPS,
	options?: RateToLevelOptions,
): ActivityMeterLevel {
	if (options?.nonFiniteRate === "idle" && !Number.isFinite(tokensPerSecond)) {
		return ActivityMeterLevel.IDLE;
	}
	if (tokensPerSecond >= upperBoundTps) return ActivityMeterLevel.FULL;
	for (let i = RATE_THRESHOLDS.length - 1; i >= 0; i--) {
		if (
			tokensPerSecond * LEGACY_FULL_SCALE_TPS >
			(RATE_THRESHOLDS[i] ?? 0) * upperBoundTps
		) {
			return (i + 1) as ActivityMeterLevel;
		}
	}
	return ActivityMeterLevel.IDLE;
}

function isMeterLevel(value: unknown): value is ActivityMeterLevel {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= ActivityMeterLevel.IDLE &&
		value <= ActivityMeterLevel.FULL
	);
}

export interface ActivityMeterOptions {
	/** Defaults to `"ltr"`. */
	direction?: MeterDirection;
	/** Cell count. Anything but a positive integer reads as `ACTIVITY_METER_WIDTH`. */
	width?: number;
}

export type MeterCellColorizer = (
	level: ActivityMeterLevel,
	glyph: string,
) => string;

/** A scrolling meter of fixed width. Colour is the caller's: `render` takes a per-cell colorizer. */
export class ActivityMeter {
	readonly width: number;
	#levels: ActivityMeterLevel[];
	#direction: MeterDirection;

	constructor(options: ActivityMeterOptions = {}) {
		const width = options.width;
		this.width =
			typeof width === "number" && Number.isInteger(width) && width > 0
				? width
				: ACTIVITY_METER_WIDTH;
		this.#levels = Array<ActivityMeterLevel>(this.width).fill(
			ActivityMeterLevel.IDLE,
		);
		this.#direction = options.direction ?? "ltr";
	}

	setDirection(direction: MeterDirection): void {
		if (direction !== this.#direction) {
			this.#direction = direction;
			// Reverse the existing data so the visual flow instantly flips.
			this.#levels.reverse();
		}
	}

	push(level: ActivityMeterLevel): void {
		if (this.#direction === "rtl") {
			this.#levels.shift();
			this.#levels.push(level);
		} else {
			this.#levels.pop();
			this.#levels.unshift(level);
		}
	}

	render(colorize?: MeterCellColorizer): string {
		return this.#levels
			.map((level) => {
				const glyph = METER_GLYPHS[level];
				return colorize ? colorize(level, glyph) : glyph;
			})
			.join("");
	}

	/**
	 * Snapshot the trace in display order for this meter's direction, e.g. to persist alongside
	 * a frozen transcript copy. Restore it into a meter of the same direction and width.
	 */
	levels(): ActivityMeterLevel[] {
		return [...this.#levels];
	}

	/**
	 * Restore a captured trace, padding or trimming to this meter's width. An entry that is not
	 * an integer level from 0 to 7 reads as `IDLE`.
	 */
	setLevels(levels: readonly number[]): void {
		const restored = Array<ActivityMeterLevel>(this.width).fill(
			ActivityMeterLevel.IDLE,
		);
		for (let i = 0; i < this.width; i++) {
			const level = levels[i];
			if (isMeterLevel(level)) restored[i] = level;
		}
		this.#levels = restored;
	}

	reset(): void {
		this.#levels.fill(ActivityMeterLevel.IDLE);
	}
}
