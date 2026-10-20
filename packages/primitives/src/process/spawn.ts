import { type ChildProcess, spawn } from "node:child_process";
import { DEFAULT_KILL_GRACE_MS, escalateKill } from "./kill.js";

/** The exit code `spawnCollect` reports when its timeout fires (the `timeout(1)` convention). */
export const SPAWN_TIMEOUT_EXIT_CODE = 124;

/** The longest delay `setTimeout` honours; a larger one fires at once. */
const MAX_TIMER_MS = 2_147_483_647;

export interface SpawnCollectOptions {
	/** Kill the child after this many milliseconds. Zero, negative and non-finite values mean no timeout. */
	timeoutMs: number;
	/** Grace between SIGTERM and SIGKILL on timeout. Defaults to `DEFAULT_KILL_GRACE_MS`. */
	killGraceMs?: number;
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	windowsHide?: boolean;
}

export interface SpawnCollectResult {
	/** The exit code; 1 for a spawn error or a signal exit; `SPAWN_TIMEOUT_EXIT_CODE` on timeout. */
	code: number;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

/** `text` with `line` on a new line after it, or `line` alone when `text` is empty. */
function appendLine(text: string, line: string): string {
	return `${text}${text ? "\n" : ""}${line}`;
}

/**
 * Run `command` without a shell, collect its output, and resolve with the result. Never rejects.
 *
 * - Output is decoded as UTF-8 across chunk boundaries.
 * - A spawn error (ENOENT, or a synchronous throw such as a NUL in an argument) resolves with
 *   `code: 1` and the message appended to `stderr`.
 * - On timeout the child gets `escalateKill`, and the result resolves at once with
 *   `code: 124`, `timedOut: true` and `[timed out after Nms]` appended to `stderr`; it does not
 *   wait for the child to exit.
 * - A process that closes with only a signal reports `code: 1`.
 *
 * Stdin is closed (`ignore`). This is for short commands with small output.
 */
export function spawnCollect(
	command: string,
	args: readonly string[],
	options: SpawnCollectOptions,
): Promise<SpawnCollectResult> {
	return new Promise((resolve) => {
		let stdout = "";
		let stderr = "";
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const finish = (result: SpawnCollectResult): void => {
			if (settled) return;
			settled = true;
			if (timer !== undefined) clearTimeout(timer);
			resolve(result);
		};

		let child: ChildProcess;
		try {
			child = spawn(command, [...args], {
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
				cwd: options.cwd,
				env: options.env,
				windowsHide: options.windowsHide,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			finish({ code: 1, stdout: "", stderr: message, timedOut: false });
			return;
		}

		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			if (!settled) stdout += chunk;
		});
		child.stderr?.on("data", (chunk: string) => {
			if (!settled) stderr += chunk;
		});
		child.on("error", (error) => {
			finish({
				code: 1,
				stdout,
				stderr: appendLine(stderr, error.message),
				timedOut: false,
			});
		});
		child.on("close", (code) => {
			finish({ code: code ?? 1, stdout, stderr, timedOut: false });
		});

		if (Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
			timer = setTimeout(
				() => {
					escalateKill(child, options.killGraceMs ?? DEFAULT_KILL_GRACE_MS);
					finish({
						code: SPAWN_TIMEOUT_EXIT_CODE,
						stdout,
						stderr: appendLine(
							stderr,
							`[timed out after ${options.timeoutMs}ms]`,
						),
						timedOut: true,
					});
				},
				Math.min(options.timeoutMs, MAX_TIMER_MS),
			);
			// The child's pipes keep the loop alive while it runs; the timer must not outlive it.
			timer.unref();
		}
	});
}
