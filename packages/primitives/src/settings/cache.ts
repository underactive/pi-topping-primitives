import type { CachedSettings } from "./types.js";

export interface SettingsCache<T> {
	cached: CachedSettings<T>;
	/** Called by the owning store after its own successful write. */
	seed(value: T, stamp: string | undefined): void;
}

function sameValue(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	try {
		return JSON.stringify(a) === JSON.stringify(b);
	} catch {
		return false;
	}
}

/** Stamp-validated cache over `read`. All state lives in this closure. */
export function createSettingsCache<T>(
	read: () => T,
	stamp: () => string | undefined,
	onDiagnostic: (message: string) => void,
): SettingsCache<T> {
	let loaded = false;
	let stale = true;
	let value: T | undefined;
	let seen: string | undefined;
	const listeners = new Set<(next: T, previous: T) => void>();

	function notify(next: T, previous: T): void {
		for (const listener of [...listeners]) {
			try {
				listener(next, previous);
			} catch (error) {
				try {
					onDiagnostic(
						`settings change listener failed: ${error instanceof Error ? error.message : String(error)}`,
					);
				} catch {
					// A failing diagnostic sink must not turn a listener error into a result change.
				}
			}
		}
	}

	const cached: CachedSettings<T> = {
		current() {
			const now = stamp();
			if (loaded && !stale && now === seen) return value as T;
			const hadValue = loaded;
			const previous = value as T;
			const next = read();
			value = next;
			seen = now;
			loaded = true;
			stale = false;
			if (hadValue && !sameValue(previous, next)) notify(next, previous);
			return next;
		},
		invalidate() {
			stale = true;
		},
		onChange(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};

	return {
		cached,
		seed(next, nextStamp) {
			const hadValue = loaded;
			const previous = value as T;
			value = next;
			seen = nextStamp;
			loaded = true;
			stale = false;
			notify(next, hadValue ? previous : next);
		},
	};
}
