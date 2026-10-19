import { createSettingsCache } from "./cache.js";
import { isRefusal } from "./refusal.js";
import type {
	SettingsChange,
	SettingsStore,
	SettingsWriteResult,
} from "./types.js";

/** An in-memory `SettingsStore` for tests. Values are cloned on the way in and out. */
export function memorySettingsStore<T>(initial: T): SettingsStore<T> {
	let held = structuredClone(initial);
	let revision = 0;

	const stamp = (): string => `memory:${revision}`;
	const read = (): T => structuredClone(held);
	const cache = createSettingsCache<T>(read, stamp, () => {});

	function commit(value: T): SettingsWriteResult<T> {
		held = structuredClone(value);
		revision += 1;
		const result: SettingsWriteResult<T> = {
			ok: true,
			value: structuredClone(held),
			stamp: stamp(),
		};
		cache.seed(result.value, result.stamp);
		return result;
	}

	return {
		path: () => "<memory>",
		read,
		write: commit,
		update(change: SettingsChange<T>) {
			let next: T | { error: string };
			try {
				next = change(read());
			} catch (error) {
				return {
					ok: false,
					reason: "refused",
					message: error instanceof Error ? error.message : String(error),
				};
			}
			if (isRefusal(next)) {
				return { ok: false, reason: "refused", message: next.error };
			}
			return commit(next as T);
		},
		stamp,
		cached: () => cache.cached,
	};
}
