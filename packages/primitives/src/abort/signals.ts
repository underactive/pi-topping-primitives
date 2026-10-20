import { MAX_TIMER_MS } from "./limits.js";

/** What `combineSignals` returns. */
export interface CombinedSignals {
	/** Aborts on the caller's signal, on the timeout, or when the registered controller is aborted. */
	signal: AbortSignal;
	/** Unregister the controller. Call it when the request settles. */
	cleanup: () => void;
}

/**
 * A request signal that aborts on the caller's signal, on a timeout, or on shutdown.
 * Ported from web-tools' `combineSignals` (`src/abort-utils.ts`).
 *
 * The controller made here is added to `activeFetches` before the signal is returned, so the
 * host can abort every request in flight by walking its own set on `session_shutdown` or reload.
 * `cleanup()` removes it again; skipping it leaves the controller in the set until the host
 * clears it. The set belongs to the caller: nothing here is shared between callers.
 *
 * - The timeout is `AbortSignal.timeout`, which has no timer to clear, so `cleanup` only
 *   unregisters. There is no `timedOut()`: use `createDeadline` when a timeout has to be told
 *   apart from a caller abort.
 * - `timeoutMs` above 2^31 - 1 (and `Infinity`) is clamped to that; web-tools' copy let
 *   `AbortSignal.timeout` fire after about a millisecond in that range. `NaN`, a negative number
 *   and a fraction still throw `ERR_OUT_OF_RANGE` from `AbortSignal.timeout`, now before the
 *   controller is registered, so a throw no longer leaves a stale entry in `activeFetches`.
 */
export function combineSignals(
	userSignal: AbortSignal | undefined,
	timeoutMs: number,
	activeFetches: Set<AbortController>,
): CombinedSignals {
	const timeoutSignal = AbortSignal.timeout(Math.min(timeoutMs, MAX_TIMER_MS));
	const controller = new AbortController();
	activeFetches.add(controller);
	const signals: AbortSignal[] = [controller.signal, timeoutSignal];
	if (userSignal) signals.push(userSignal);
	return {
		signal: AbortSignal.any(signals),
		cleanup: () => {
			activeFetches.delete(controller);
		},
	};
}
