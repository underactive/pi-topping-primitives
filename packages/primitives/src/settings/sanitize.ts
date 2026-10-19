/** Bounds for `sanitize.numberOr`. A value outside them falls back; it is never clamped. */
export interface NumberBounds {
	min?: number;
	max?: number;
	exclusiveMin?: number;
	integer?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function booleanOr(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function numberOr(
	value: unknown,
	fallback: number,
	bounds: NumberBounds = {},
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	if (bounds.integer && !Number.isInteger(value)) return fallback;
	if (bounds.min !== undefined && value < bounds.min) return fallback;
	if (bounds.exclusiveMin !== undefined && value <= bounds.exclusiveMin) {
		return fallback;
	}
	if (bounds.max !== undefined && value > bounds.max) return fallback;
	return value;
}

function enumOr<T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T,
): T {
	return allowed.find((candidate) => candidate === value) ?? fallback;
}

/** Trimmed, non-empty strings only. A non-array gives `[]`. */
function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter(
			(item): item is string =>
				typeof item === "string" && item.trim().length > 0,
		)
		.map((item) => item.trim());
}

/** Accepts `"on"`, `"off"` or a boolean. */
function onOff(value: unknown, fallback: boolean): boolean {
	if (value === "on") return true;
	if (value === "off") return false;
	return booleanOr(value, fallback);
}

/** Field sanitisers for settings codecs: wrong type or out of range means "use the fallback". */
export const sanitize = Object.freeze({
	isRecord,
	booleanOr,
	numberOr,
	enumOr,
	stringList,
	onOff,
});
