/**
 * True when an error is a DOM-style `AbortError`: an `Error` whose `name` is `"AbortError"`.
 * It matches what `abortError` builds and what `fetch` and `AbortSignal` reject with.
 * Adapted from pi-advisor's `advisor/execute.ts` through sensei's `src/core/abort.ts`
 * (see THIRD_PARTY_NOTICES.md).
 */
export function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

/**
 * An `AbortError` carrying `message`. Adapted from pi-advisor's `advisor/execute.ts` through
 * sensei's `src/core/abort.ts` (see THIRD_PARTY_NOTICES.md).
 */
export function abortError(message: string): Error {
	const error = new Error(message);
	error.name = "AbortError";
	return error;
}
