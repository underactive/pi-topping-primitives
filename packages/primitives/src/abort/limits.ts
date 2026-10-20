/**
 * The longest delay `setTimeout` and `AbortSignal.timeout` honour. Anything above it, `Infinity`
 * included, runs after about a millisecond (Node prints `TimeoutOverflowWarning` and carries on),
 * and `AbortSignal.timeout` throws from 2^32 up. The timeouts here are clamped to it, which is
 * about 24.8 days. `spawnCollect` in `./process` clamps to the same value.
 */
export const MAX_TIMER_MS = 2_147_483_647;
