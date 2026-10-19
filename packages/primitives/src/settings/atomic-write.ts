import { randomUUID } from "node:crypto";
import {
	mkdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { SettingsFileMode } from "./types.js";

/**
 * Writes `contents` to `path` through a uniquely named temp file and a rename, so a reader
 * never sees a torn file. Creates missing parent directories (default 0700, never chmods an
 * existing one). The file is created 0600 unless `mode.file` says otherwise. Throws on failure
 * after removing the temp file.
 */
export function atomicWriteFile(
	path: string,
	contents: string,
	mode: SettingsFileMode = {},
): void {
	mkdirSync(dirname(path), { recursive: true, mode: mode.dir ?? 0o700 });
	const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
	try {
		writeFileSync(tmp, contents, {
			encoding: "utf8",
			flag: "wx",
			mode: mode.file ?? 0o600,
		});
		renameSync(tmp, path);
	} catch (error) {
		try {
			rmSync(tmp, { force: true });
		} catch {
			// Cleanup must not hide the original failure.
		}
		throw error;
	}
}

/** `mtimeMs:size:ino`, or `undefined` when the file is absent or unreadable. */
export function fileStamp(path: string): string | undefined {
	try {
		const stat = statSync(path);
		return `${stat.mtimeMs}:${stat.size}:${stat.ino}`;
	} catch {
		return undefined;
	}
}
