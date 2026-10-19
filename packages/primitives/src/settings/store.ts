import {
	constants,
	copyFileSync,
	mkdirSync,
	readFileSync,
	statSync,
} from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { atomicWriteFile, fileStamp } from "./atomic-write.js";
import { createSettingsCache } from "./cache.js";
import {
	acquireDirLock,
	type DirLockOptions,
	releaseDirLock,
} from "./file-lock.js";
import { sanitize } from "./sanitize.js";
import type {
	SettingsChange,
	SettingsStore,
	SettingsStoreOptions,
	SettingsWriteFailure,
	SettingsWriteResult,
} from "./types.js";

type RawRead =
	| { kind: "missing" }
	| { kind: "ok"; raw: unknown }
	| { kind: "failed"; message: string };

function errorCode(error: unknown): unknown {
	return sanitize.isRecord(error) ? error.code : undefined;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function failure(
	reason: SettingsWriteFailure["reason"],
	message: string,
): SettingsWriteFailure {
	return { ok: false, reason, message };
}

/** True for a returned `{ error: "…" }` and nothing wider, so a settings object is never mistaken for it. */
function isRefusal(value: unknown): value is { error: string } {
	if (!sanitize.isRecord(value)) return false;
	const keys = Object.keys(value);
	return (
		keys.length === 1 && keys[0] === "error" && typeof value.error === "string"
	);
}

/**
 * A JSON settings file with a validating codec.
 *
 * `read()` never throws. `write()` replaces the file without a lock; `update()` is the locked
 * read-modify-write and refuses to overwrite a file that exists but is not valid JSON. Every
 * failure comes back as a result value; nothing is printed.
 */
export function createSettingsStore<T>(
	options: SettingsStoreOptions<T>,
): SettingsStore<T> {
	const { codec } = options;
	const onDiagnostic = options.onDiagnostic ?? (() => {});

	function path(): string {
		const override = options.pathEnv ? process.env[options.pathEnv] : undefined;
		return override ? override : options.path();
	}

	function readRaw(file: string): RawRead {
		try {
			if (options.maxBytes !== undefined) {
				const size = statSync(file).size;
				if (size > options.maxBytes) {
					return {
						kind: "failed",
						message: `${file} is larger than ${options.maxBytes} bytes`,
					};
				}
			}
			return { kind: "ok", raw: JSON.parse(readFileSync(file, "utf8")) };
		} catch (error) {
			if (errorCode(error) === "ENOENT") return { kind: "missing" };
			if (error instanceof SyntaxError) {
				return {
					kind: "failed",
					message: `${file} is not valid JSON (${error.message}); fix or remove it before saving`,
				};
			}
			return { kind: "failed", message: `${file}: ${errorMessage(error)}` };
		}
	}

	function fromRaw(raw: unknown): T {
		try {
			return codec.sanitize(raw, onDiagnostic);
		} catch (error) {
			onDiagnostic(`settings codec failed: ${errorMessage(error)}`);
			return codec.sanitize(undefined, onDiagnostic);
		}
	}

	function read(): T {
		const file = path();
		const result = readRaw(file);
		if (result.kind === "ok") return fromRaw(result.raw);
		if (result.kind === "failed") onDiagnostic(result.message);
		return fromRaw(undefined);
	}

	function backupIfOld(file: string, raw: unknown): string | undefined {
		const version = codec.version;
		if (version?.backupBelow === undefined) return undefined;
		const stored = sanitize.isRecord(raw) ? raw[version.key] : undefined;
		if (typeof stored === "number" && stored >= version.backupBelow) {
			return undefined;
		}
		const storedNumber = typeof stored === "number" ? stored : 1;
		const target = version.backupPath
			? version.backupPath(file, storedNumber)
			: join(
					dirname(file),
					`${basename(file, extname(file))}.v${storedNumber}${extname(file)}`,
				);
		try {
			copyFileSync(file, target, constants.COPYFILE_EXCL);
		} catch (error) {
			// An existing backup is the earliest copy and stays; a missing source needs none.
			if (errorCode(error) === "EEXIST" || errorCode(error) === "ENOENT") {
				return undefined;
			}
			return errorMessage(error);
		}
		return undefined;
	}

	function persist(
		file: string,
		value: T,
		raw: unknown,
	): SettingsWriteResult<T> {
		try {
			const backupError = backupIfOld(file, raw);
			if (backupError !== undefined)
				return failure("write_failed", backupError);
			let onDisk: unknown = value;
			if (codec.version || codec.preserveUnknownKeys) {
				onDisk = {
					...(codec.preserveUnknownKeys && sanitize.isRecord(raw) ? raw : {}),
					...(codec.version
						? { [codec.version.key]: codec.version.current }
						: {}),
					...(sanitize.isRecord(value) ? value : {}),
				};
			}
			const text = codec.serialize
				? codec.serialize(onDisk as T)
				: `${JSON.stringify(onDisk, null, 2)}\n`;
			atomicWriteFile(file, text, options.mode);
			return { ok: true, value, stamp: fileStamp(file) };
		} catch (error) {
			return failure("write_failed", errorMessage(error));
		}
	}

	function lockOptions(): DirLockOptions | undefined {
		return typeof options.lock === "object" ? options.lock : undefined;
	}

	const cache = createSettingsCache(
		read,
		() => fileStamp(path()),
		onDiagnostic,
	);

	function seeded(result: SettingsWriteResult<T>): SettingsWriteResult<T> {
		if (result.ok) cache.seed(result.value, result.stamp);
		return result;
	}

	function write(value: T): SettingsWriteResult<T> {
		const file = path();
		const existing = readRaw(file);
		return seeded(
			persist(file, value, existing.kind === "ok" ? existing.raw : undefined),
		);
	}

	function update(change: SettingsChange<T>): SettingsWriteResult<T> {
		const file = path();
		try {
			mkdirSync(dirname(file), {
				recursive: true,
				mode: options.mode?.dir ?? 0o700,
			});
		} catch (error) {
			return failure("write_failed", errorMessage(error));
		}

		const lockPath = `${file}.lock`;
		const locked = options.lock !== false;
		if (locked && !acquireDirLock(lockPath, lockOptions())) {
			return failure("busy", `settings lock is busy: ${lockPath}`);
		}
		try {
			const existing = readRaw(file);
			if (existing.kind === "failed")
				return failure("refused", existing.message);
			const raw = existing.kind === "ok" ? existing.raw : undefined;
			const current = fromRaw(raw);
			let next: T | { error: string };
			try {
				next = change(current);
			} catch (error) {
				return failure("refused", errorMessage(error));
			}
			if (isRefusal(next)) return failure("refused", next.error);
			return seeded(persist(file, next as T, raw));
		} finally {
			if (locked) releaseDirLock(lockPath);
		}
	}

	return {
		path,
		read,
		write,
		update,
		stamp: () => fileStamp(path()),
		cached: () => cache.cached,
	};
}
