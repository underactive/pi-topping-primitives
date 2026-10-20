import { MAX_TIMER_MS } from "./limits.js";

/** The composed abort state for one call. */
export interface Deadline {
	/** The signal to hand to the callee, or `undefined` when there is no timeout and no caller signal. */
	signal: AbortSignal | undefined;
	/** True once the timeout fired, as opposed to the caller aborting. */
	timedOut(): boolean;
	/** Clear the timer. Idempotent, and safe on every terminal path. */
	dispose(): void;
}

/**
 * One timer and one signal for one call, from a timeout and an optional caller signal.
 * Ported from sensei's `createDeadline` (`src/review/deadline.ts`).
 *
 * - A positive `timeoutMs` creates exactly one timer. Zero, a negative number and `NaN` create
 *   none and supply no timeout signal.
 * - `signal` is the caller's signal, the timeout's, or their `AbortSignal.any` composition when
 *   both exist. With neither it is `undefined`.
 * - `timedOut()` tells a timeout apart from a caller abort on that shared signal. A caller abort
 *   that arrives first leaves it false.
 * - `dispose()` clears the timer; call it on every terminal path. The timer is not unref'd, so
 *   an undisposed deadline keeps the process alive until it fires.
 * - `timeoutMs` above 2^31 - 1 (and `Infinity`) is clamped to that. Sensei's copy handed it to
 *   `setTimeout` as it was, which fires after about a millisecond.
 */
export function createDeadline(
	timeoutMs: number,
	callerSignal: AbortSignal | undefined,
): Deadline {
	let timeoutController: AbortController | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	if (timeoutMs > 0) {
		const controller = new AbortController();
		timeoutController = controller;
		timer = setTimeout(
			() => controller.abort(),
			Math.min(timeoutMs, MAX_TIMER_MS),
		);
	}

	const timeoutSignal = timeoutController?.signal;
	let signal: AbortSignal | undefined;
	if (timeoutSignal && callerSignal) {
		signal = AbortSignal.any([timeoutSignal, callerSignal]);
	} else {
		signal = timeoutSignal ?? callerSignal;
	}

	return {
		signal,
		timedOut: () => timeoutSignal?.aborted === true,
		dispose: () => {
			if (timer !== undefined) {
				clearTimeout(timer);
				timer = undefined;
			}
		},
	};
}
