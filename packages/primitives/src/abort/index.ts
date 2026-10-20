/**
 * Abort errors, a promise-versus-signal race, and the two ways the toppings bound a call with a
 * timeout.
 *
 * Contract:
 * - No pi package is imported and there is no module state; every exported value is a function.
 *   Nothing starts a timer until `createDeadline` is called, and nothing here is unref'd.
 * - `createDeadline` and `combineSignals` solve the same problem for different hosts, so both
 *   stay. `createDeadline` owns a `setTimeout` it must be told to `dispose()` and answers
 *   `timedOut()`; `combineSignals` uses `AbortSignal.timeout` and registers an `AbortController`
 *   in a set the host aborts on shutdown. They are not interchangeable.
 * - Both clamp a timeout above 2^31 - 1 ms to that value instead of letting Node fire it after
 *   about a millisecond.
 * - `isAbortError`, `abortError` and `raceAbort` are adapted from pi-advisor (MIT); the notice is
 *   in THIRD_PARTY_NOTICES.md and moves with the code.
 * - `stableStringify` is not here: sensei is its only user.
 */

export type { Deadline } from "./deadline.js";
export { createDeadline } from "./deadline.js";
export { abortError, isAbortError } from "./errors.js";
export { raceAbort } from "./race.js";
export type { CombinedSignals } from "./signals.js";
export { combineSignals } from "./signals.js";
