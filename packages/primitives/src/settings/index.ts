/**
 * Atomic JSON settings files: a validating store, a directory lock, field sanitisers and the
 * conventional `<agent dir>/<package>/settings.json` path.
 *
 * Contract:
 * - `store.read()` never throws; a missing, oversized or corrupt file reads as the codec's defaults.
 * - `store.update()` is the only locked path and refuses a file that is not valid JSON.
 * - Failures are result values. `atomicWriteFile` is the one exception: it throws.
 * - Nothing is printed; diagnostics go to `onDiagnostic`.
 * - No module state: two copies of this package in one process interoperate through the filesystem.
 * - The one runtime pi import is `getAgentDir`, used by `toppingSettingsPath`.
 */
export { atomicWriteFile, fileStamp } from "./atomic-write.js";
export {
	acquireDirLock,
	type DirLockOptions,
	dirLockStale,
	isProcessAlive,
	releaseDirLock,
} from "./file-lock.js";
export { memorySettingsStore } from "./memory.js";
export { toppingSettingsPath } from "./paths.js";
export { type NumberBounds, sanitize } from "./sanitize.js";
export { createSettingsStore } from "./store.js";
export type {
	CachedSettings,
	SettingsChange,
	SettingsCodec,
	SettingsFileMode,
	SettingsStore,
	SettingsStoreOptions,
	SettingsVersion,
	SettingsWriteFailure,
	SettingsWriteResult,
} from "./types.js";
