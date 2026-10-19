import type { DirLockOptions } from "./file-lock.js";

export interface SettingsFileMode {
	/** Default 0600. */
	file?: number;
	/** Default 0700. Applied only to directories this call creates. */
	dir?: number;
}

export interface SettingsVersion {
	/** Top-level key that holds the schema version. Written first. */
	key: string;
	current: number;
	/** Back up, once, a file whose stored version is not a number >= backupBelow. */
	backupBelow?: number;
	/** Default `<dir>/<stem>.v<stored>.json`; a non-number stored version counts as 1. */
	backupPath?: (settingsPath: string, storedVersion: number) => string;
}

export interface SettingsCodec<T> {
	/** `raw === undefined` means missing or unreadable. Must not throw. */
	sanitize(raw: unknown, diagnose: (message: string) => void): T;
	/** Default `JSON.stringify(value, null, 2) + "\n"`. */
	serialize?(value: T): string;
	/**
	 * Keep top-level keys the value does not mention. Needs a serializer that writes every own
	 * key of the object it is given; a codec that rebuilds the object drops them again.
	 */
	preserveUnknownKeys?: boolean;
	version?: SettingsVersion;
}

export interface SettingsStoreOptions<T> {
	path: () => string;
	codec: SettingsCodec<T>;
	/** A non-empty value of this environment variable replaces `path()`. */
	pathEnv?: string;
	/** Files larger than this read as missing (and refuse `update`). */
	maxBytes?: number;
	mode?: SettingsFileMode;
	/** Receives every non-fatal problem. Default: dropped. Nothing is ever printed. */
	onDiagnostic?: (message: string) => void;
	/** Lock `update()` with `<path>.lock`. Default true. */
	lock?: boolean | DirLockOptions;
}

/**
 * Returns the next value, or `{ error }` to refuse. A settings type must not itself have the
 * shape `{ error: string }`.
 */
export type SettingsChange<T> = (current: T) => T | { error: string };

export type SettingsWriteFailure = {
	ok: false;
	reason: "busy" | "refused" | "write_failed";
	message: string;
};

export type SettingsWriteResult<T> =
	| { ok: true; value: T; stamp: string | undefined }
	| SettingsWriteFailure;

export interface CachedSettings<T> {
	current(): T;
	invalidate(): void;
	/** Fires when the value changes under the cache. Returns an unsubscribe function. */
	onChange(listener: (next: T, previous: T) => void): () => void;
}

export interface SettingsStore<T> {
	path(): string;
	/** Never throws. */
	read(): T;
	/** Unlocked whole-value write. Use `update` for read-modify-write. */
	write(value: T): SettingsWriteResult<T>;
	/** Locked read-modify-write. Refuses a file that exists but is not valid JSON. */
	update(change: SettingsChange<T>): SettingsWriteResult<T>;
	stamp(): string | undefined;
	cached(): CachedSettings<T>;
}
