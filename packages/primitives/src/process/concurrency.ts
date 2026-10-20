/**
 * `fn` over `items` with at most `concurrency` calls in flight, results in input order.
 * Ported from moa-fusion's `mapWithConcurrencyLimit` (and persona-audit's copy, which lacked
 * `onStart`).
 *
 * - `onStart(index)` runs just before `fn(item, index)`, in the order items are pulled.
 * - The limit is clamped to `1..items.length` and floored; `NaN` counts as 1. The vendored
 *   copies threw `RangeError` for `NaN` and fractional limits.
 * - If `fn` rejects, the call rejects, but the other workers keep draining the remaining items.
 */
export async function mapWithConcurrencyLimit<TIn, TOut>(
	items: readonly TIn[],
	concurrency: number,
	fn: (item: TIn, index: number) => Promise<TOut>,
	onStart?: (index: number) => void,
): Promise<TOut[]> {
	if (items.length === 0) return [];
	const requested = Number.isNaN(concurrency) ? 1 : concurrency;
	const limit = Math.max(1, Math.floor(Math.min(requested, items.length)));
	const results: TOut[] = new Array(items.length);
	let nextIndex = 0;
	const workers = Array.from({ length: limit }, async () => {
		while (true) {
			const current = nextIndex++;
			if (current >= items.length) return;
			onStart?.(current);
			// `current` is below `items.length`, so the element exists; the cast only lifts
			// the `undefined` that `noUncheckedIndexedAccess` adds (and `TIn` may include it).
			results[current] = await fn(items[current] as TIn, current);
		}
	});
	await Promise.all(workers);
	return results;
}
