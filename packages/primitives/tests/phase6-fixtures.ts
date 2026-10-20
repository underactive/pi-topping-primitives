import { readFileSync } from "node:fs";

/**
 * JSON cannot hold NaN, either infinity or `undefined`, so the Phase 6 fixtures write them as
 * these strings and `null`. Every fixture was captured from the vendored code the primitives
 * replaced; its `source` field names the files and commits.
 */
export type EncodedNumber = number | "NaN" | "Infinity" | "-Infinity" | null;

export function decodeNumber(value: EncodedNumber): number | undefined {
	if (value === null) return undefined;
	if (value === "NaN") return Number.NaN;
	if (value === "Infinity") return Number.POSITIVE_INFINITY;
	if (value === "-Infinity") return Number.NEGATIVE_INFINITY;
	return value;
}

export function readFixture<T>(name: string): T {
	const url = new URL(`./fixtures/phase6/${name}.json`, import.meta.url);
	return JSON.parse(readFileSync(url, "utf8")) as T;
}
