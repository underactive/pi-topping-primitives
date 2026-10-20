import { abortError } from "./errors.js";

/**
 * Resolve `promise`, or reject with `abortError(message)` when `signal` fires first.
 *
 * - With no `signal` the promise is returned as it is.
 * - An already aborted `signal` rejects at once, and the promise is still observed, so its own
 *   late rejection is not reported as unhandled.
 * - Whichever side settles first wins; the abort listener is removed when the promise settles,
 *   so a long-lived signal does not collect listeners across calls.
 *
 * Adapted from pi-advisor's `advisor/execute.ts` through sensei's `src/core/abort.ts`
 * (see THIRD_PARTY_NOTICES.md).
 */
export function raceAbort<T>(
	promise: Promise<T>,
	signal: AbortSignal | undefined,
	message: string,
): Promise<T> {
	if (!signal) return promise;
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(abortError(message));
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener("abort", onAbort);
				resolve(value);
			},
			(error: unknown) => {
				signal.removeEventListener("abort", onAbort);
				reject(error);
			},
		);
		if (signal.aborted) onAbort();
	});
}
