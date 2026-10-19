import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { hostname as systemHostname } from "node:os";

interface LockOwner {
	pid: number;
	hostname: string;
	at: number;
}

export interface DirLockOptions {
	pid?: number;
	hostname?: string;
	now?: () => number;
	attempts?: number;
	retryMs?: number;
	missingOwnerStaleMs?: number;
	isAlive?: (pid: number) => boolean;
}

const DEFAULT_ATTEMPTS = 40;
const DEFAULT_RETRY_MS = 25;
const DEFAULT_MISSING_OWNER_STALE_MS = 10_000;

/** Checks process liveness without treating permission denial as death. */
export function isProcessAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (typeof error === "object" && error !== null && "code" in error) {
			if (error.code === "ESRCH") return false;
			if (error.code === "EPERM") return true;
		}
		// Unknown errors are not proof of death; fail closed and keep the lock.
		return true;
	}
}

function readOwner(path: string): LockOwner | undefined {
	try {
		const value: unknown = JSON.parse(
			readFileSync(`${path}/owner.json`, "utf8"),
		);
		if (typeof value !== "object" || value === null || Array.isArray(value))
			return undefined;
		const record = value as Record<string, unknown>;
		if (
			typeof record.pid !== "number" ||
			!Number.isInteger(record.pid) ||
			typeof record.hostname !== "string" ||
			typeof record.at !== "number"
		)
			return undefined;
		return { pid: record.pid, hostname: record.hostname, at: record.at };
	} catch {
		return undefined;
	}
}

function staleLock(
	path: string,
	options: Required<
		Pick<DirLockOptions, "hostname" | "now" | "missingOwnerStaleMs" | "isAlive">
	>,
): boolean {
	const ownerPath = `${path}/owner.json`;
	const owner = existsSync(ownerPath) ? readOwner(path) : undefined;
	if (owner?.hostname === options.hostname) return !options.isAlive(owner.pid);

	try {
		const directory = statSync(path);
		return options.now() - directory.mtimeMs > options.missingOwnerStaleMs;
	} catch {
		return false;
	}
}

export function dirLockStale(
	path: string,
	options: DirLockOptions = {},
): boolean {
	return staleLock(path, {
		hostname: options.hostname ?? systemHostname(),
		now: options.now ?? Date.now,
		missingOwnerStaleMs:
			options.missingOwnerStaleMs ?? DEFAULT_MISSING_OWNER_STALE_MS,
		isAlive: options.isAlive ?? isProcessAlive,
	});
}

function waitSync(milliseconds: number): void {
	if (milliseconds <= 0) return;
	const signal = new Int32Array(
		new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
	);
	Atomics.wait(signal, 0, 0, milliseconds);
}

/** Acquires a mkdir-based lock, retrying briefly and breaking only demonstrably stale locks. */
export function acquireDirLock(
	path: string,
	options: DirLockOptions = {},
): boolean {
	const settings = {
		pid: options.pid ?? process.pid,
		hostname: options.hostname ?? systemHostname(),
		now: options.now ?? Date.now,
		attempts: options.attempts ?? DEFAULT_ATTEMPTS,
		retryMs: options.retryMs ?? DEFAULT_RETRY_MS,
		missingOwnerStaleMs:
			options.missingOwnerStaleMs ?? DEFAULT_MISSING_OWNER_STALE_MS,
		isAlive: options.isAlive ?? isProcessAlive,
	};
	const owner: LockOwner = {
		pid: settings.pid,
		hostname: settings.hostname,
		at: settings.now(),
	};

	let reclaimed = false;
	for (let attempt = 0; attempt < settings.attempts; attempt += 1) {
		try {
			mkdirSync(path, { mode: 0o700 });
			try {
				writeFileSync(`${path}/owner.json`, `${JSON.stringify(owner)}\n`, {
					encoding: "utf8",
					mode: 0o600,
					flag: "wx",
				});
				return true;
			} catch {
				releaseDirLock(path);
				return false;
			}
		} catch (error) {
			if (
				!(
					typeof error === "object" &&
					error !== null &&
					"code" in error &&
					error.code === "EEXIST"
				)
			)
				return false;
			if (!reclaimed && staleLock(path, settings)) {
				try {
					rmSync(path, { recursive: true, force: true });
				} catch {
					// Another contender may already have reclaimed it; retry below.
				}
				reclaimed = true;
				attempt -= 1;
				continue;
			}
			if (attempt + 1 < settings.attempts) waitSync(settings.retryMs);
		}
	}
	return false;
}

/** Releases a lock acquired by acquireDirLock. */
export function releaseDirLock(path: string): void {
	try {
		rmSync(path, { recursive: true, force: true });
	} catch {
		// Releasing a lock must not hide the original operation's result.
	}
}
