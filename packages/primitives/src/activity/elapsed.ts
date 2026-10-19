export interface ElapsedUnitsOptions {
	/**
	 * Show a day unit once the span reaches 24 hours (default `true`). Off, hours keep counting:
	 * 25 hours reads `25h`, not `1d 1h`.
	 */
	includeDays?: boolean;
	/**
	 * Once a larger unit is shown, show every smaller one too (default `false`). Off, zero units
	 * in the middle drop out: `1h 0s`. On, they stay: `1h 0m 0s`.
	 */
	fillLowerUnits?: boolean;
}

/**
 * Format elapsed milliseconds as a compact duration such as `4m 46s`, skipping leading zero
 * units. Seconds always show.
 */
export function formatElapsedUnits(
	ms: number,
	options: ElapsedUnitsOptions = {},
): string {
	const includeDays = options.includeDays ?? true;
	const fill = options.fillLowerUnits ?? false;
	let totalSeconds = Math.max(0, Math.floor(ms / 1000));

	let days = 0;
	if (includeDays) {
		days = Math.floor(totalSeconds / 86400);
		totalSeconds -= days * 86400;
	}
	const hours = Math.floor(totalSeconds / 3600);
	totalSeconds -= hours * 3600;
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	const parts: string[] = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0 || (fill && days > 0)) parts.push(`${hours}h`);
	if (minutes > 0 || (fill && (days > 0 || hours > 0))) {
		parts.push(`${minutes}m`);
	}
	parts.push(`${seconds}s`);
	return parts.join(" ");
}

/** Elapsed time as `M:SS`. Minutes keep counting past 60 rather than rolling into an hours field. */
export function formatElapsedClock(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}
