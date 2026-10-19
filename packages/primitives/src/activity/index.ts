/**
 * Token-activity maths: the scrolling meter, the EMA rate tracker and its hold-and-fade
 * readout, token accounting from a message stream, fades, elapsed formatters and a run clock.
 * No rendering; `./activity-tui` turns these into coloured strings.
 *
 * Contract:
 * - Pure and clock-free: every time-dependent call takes `now`, or an injected `now()`.
 *   Nothing here schedules, prints or touches the filesystem.
 * - No module state: two copies of this package in one process do not interfere. Every exported
 *   object is frozen; the mutable things are classes the caller constructs.
 * - The meter ceiling is inclusive. `DEFAULT_METER_UPPER_BOUND_TPS` (80) reads full at exactly
 *   80 tokens per second; `LEGACY_METER_UPPER_BOUND_TPS` (40) is the pre-0.3.0 widget ceiling.
 * - `RateHoldFade` holds a rate only when the total grew since the last sample, so the EMA
 *   decaying during quiet output never re-arms the hold.
 * - `OutputTokenAccount` ignores usage that is not a finite non-negative number and falls
 *   back to its word-count estimate.
 * - The one runtime import outside this directory is `WORKING_STATUS_SLIDE_MS` from
 *   `./contracts`. Pi is imported for types only (`bindUIPromptWaits`).
 */

export {
	bindUIPromptWaits,
	MIN_WAIT_DISPLAY_MS,
	RunClock,
	type RunClockOptions,
} from "./clock.js";
export {
	type ElapsedUnitsOptions,
	formatElapsedClock,
	formatElapsedUnits,
} from "./elapsed.js";
export {
	easeFade,
	FADE_SHADE_COUNT,
	fadeShade,
	slideOutTail,
} from "./fade.js";
export {
	ACTIVITY_METER_WIDTH,
	ActivityMeter,
	ActivityMeterLevel,
	type ActivityMeterOptions,
	DEFAULT_METER_UPPER_BOUND_TPS,
	LEGACY_METER_UPPER_BOUND_TPS,
	METER_GLYPHS,
	METER_UPPER_BOUND_TPS_MAX,
	METER_UPPER_BOUND_TPS_MIN,
	type MeterCellColorizer,
	type MeterDirection,
	type RateToLevelOptions,
	rateToLevel,
} from "./meter.js";
export {
	OutputTokenAccount,
	type OutputTokenEvent,
	type OutputTokenMessage,
	type OutputTokenSnapshot,
} from "./output-account.js";
export {
	type RateDisplay,
	RateHoldFade,
	type RateHoldFadeOptions,
	type RatePhase,
	TokRateTracker,
} from "./rate.js";
export { StreamingWordCounter } from "./word-counter.js";
