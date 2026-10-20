// Immutable once built, so sharing one across calls is not module state in the sense the
// hygiene rule means: nothing here can be mutated by one caller and seen by another.
const COUNT_FORMATTER = new Intl.NumberFormat("en-US");

/**
 * A duration in milliseconds as a short string: `842ms`, `3.2s`, `1m05s`. Below 999.5 ms it is
 * whole milliseconds, below 59.95 s it is seconds to one decimal, and from there minutes and
 * zero-padded seconds. The thresholds sit half a unit below the boundary so rounding never
 * prints `1000ms` or `60.0s`. Expects a finite, non-negative number: NaN and the infinities
 * are not special-cased and print as `NaN`. For the other clock styles see `formatElapsedClock`
 * and `formatElapsedUnits` in `./activity`.
 */
export function formatDurationCompact(ms: number): string {
	if (ms < 999.5) return `${Math.round(ms)}ms`;
	if (ms < 59_950) return `${(ms / 1000).toFixed(1)}s`;
	const totalSeconds = Math.round(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}m${String(seconds).padStart(2, "0")}s`;
}

/** A count with `en-US` thousands separators: `1234567` becomes `1,234,567`. */
export function formatCount(n: number): string {
	return COUNT_FORMATTER.format(n);
}

/** A 0 to 1 fraction as a percentage: `formatPercent(0.6789, 1)` is `67.9%`. NaN prints as `NaN%`. */
export function formatPercent(fraction: number, decimals = 0): string {
	return `${(fraction * 100).toFixed(decimals)}%`;
}

/**
 * A cumulative USD cost to three decimals, the precision pi's usage footer shows: `$0.123`.
 * Undefined and non-finite amounts read `—` (the model is not in the registry); a negative
 * amount reads as zero.
 */
export function formatCostUsd(costUsd: number | undefined): string {
	if (costUsd === undefined || !Number.isFinite(costUsd)) return "—";
	return `$${Math.max(0, costUsd).toFixed(3)}`;
}
