import type { ChildProcess } from "node:child_process";

/** How long a SIGTERMed process gets before SIGKILL. */
export const DEFAULT_KILL_GRACE_MS = 5_000;

/** The part of a `ChildProcess` the kill helpers use, so tests can pass a fake. */
export interface KillableProcess {
	readonly exitCode: number | null;
	readonly signalCode: NodeJS.Signals | null;
	kill(signal?: NodeJS.Signals | number): boolean;
}

/**
 * A process has settled once it has an exit code or a terminating signal. `proc.killed` is not
 * consulted: it turns true when a signal is sent, not when the process is gone, so a child that
 * ignores SIGTERM would otherwise never get SIGKILL.
 */
function hasSettled(proc: KillableProcess): boolean {
	return proc.exitCode !== null || proc.signalCode !== null;
}

/**
 * Send SIGTERM, then force a still-live process down after the grace period. Does nothing for a
 * process that has already settled. If SIGTERM cannot be sent, SIGKILL is not attempted. The
 * SIGKILL timer is `unref`'d, so it never keeps the host alive.
 */
export function escalateKill(
	proc: KillableProcess,
	termTimeoutMs = DEFAULT_KILL_GRACE_MS,
): void {
	if (hasSettled(proc)) return;
	try {
		proc.kill("SIGTERM");
	} catch {
		return;
	}
	setTimeout(() => {
		if (hasSettled(proc)) return;
		try {
			proc.kill("SIGKILL");
		} catch {
			/* already gone */
		}
	}, termTimeoutMs).unref();
}

/**
 * A set of live processes an extension has started, so its shutdown (or `/reload`) can kill
 * exactly those. `add`, `delete`, `has` and `size` behave like the `Set` this replaces.
 */
export interface ProcessTracker<P extends KillableProcess = ChildProcess> {
	add(proc: P): void;
	delete(proc: P): boolean;
	has(proc: P): boolean;
	readonly size: number;
	/**
	 * SIGTERM every tracked process that has not settled, empty the tracker at once, then SIGKILL
	 * (after `termTimeoutMs`) every process from the snapshot that still has not settled. Safe to
	 * call repeatedly.
	 */
	cleanup(termTimeoutMs?: number): void;
}

/**
 * A new, empty tracker. Each extension makes its own, so a `/reload` kills only what that
 * extension started and a second copy of this package in one pi process shares nothing.
 */
export function createProcessTracker<
	P extends KillableProcess = ChildProcess,
>(): ProcessTracker<P> {
	const live = new Set<P>();
	return Object.freeze({
		add(proc: P): void {
			live.add(proc);
		},
		delete(proc: P): boolean {
			return live.delete(proc);
		},
		has(proc: P): boolean {
			return live.has(proc);
		},
		get size(): number {
			return live.size;
		},
		cleanup(termTimeoutMs = DEFAULT_KILL_GRACE_MS): void {
			// Snapshot targets before clearing so the delayed SIGKILL pass still reaches the same
			// processes that were just signalled.
			const snapshot = [...live];
			for (const proc of snapshot) {
				if (hasSettled(proc)) continue;
				try {
					proc.kill("SIGTERM");
				} catch {
					/* already gone */
				}
			}
			live.clear();

			// Give SIGTERM a moment, then SIGKILL any process that has not exited.
			setTimeout(() => {
				for (const proc of snapshot) {
					if (hasSettled(proc)) continue;
					try {
						proc.kill("SIGKILL");
					} catch {
						/* already gone */
					}
				}
			}, termTimeoutMs).unref();
		},
	});
}
