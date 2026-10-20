import { existsSync } from "node:fs";
import { basename } from "node:path";

/** A command and the arguments to pass it. */
export interface PiInvocation {
	command: string;
	args: string[];
}

/**
 * How `resolvePiInvocation` found pi:
 * - `script`: the running pi's entry file, run by the running runtime.
 * - `executable`: the running process is itself the pi binary (a compiled build).
 * - `path`: neither is usable, so the only option left is whatever `pi` is first on PATH.
 */
export type PiInvocationVia = "script" | "executable" | "path";

export interface ResolvedPiInvocation extends PiInvocation {
	readonly via: PiInvocationVia;
}

/** The process facts the resolver reads. Each defaults to the live value, read on every call. */
export interface PiProcessFacts {
	/** The running entry script. Defaults to `process.argv[1]`; pass `undefined` to say there is none. */
	argv1?: string | undefined;
	/** Defaults to `process.execPath`. */
	execPath?: string;
	/** Defaults to `fs.existsSync`. */
	exists?: (path: string) => boolean;
}

/** Bun's embedded entry point lives under this virtual root and cannot be re-run as a file. */
const BUN_VIRTUAL_ROOT = "/$bunfs/root/";

/** Runtimes that host a script, as opposed to a binary that is pi itself. `nodejs` is Debian's name for node. */
const GENERIC_RUNTIME = /^(?:node|nodejs|bun)(?:\.exe)?$/;

/**
 * The command that starts the pi hosting this process, with `args` appended. Ported from
 * moa-fusion's `getPiInvocation`.
 *
 * Tried in order: the running entry script under the running runtime (`via: "script"`); the
 * running executable when it is not a generic runtime, as in a compiled pi (`"executable"`);
 * and last `pi` on PATH (`"path"`).
 *
 * `via` is the host's policy hook. Nothing here wraps a Windows shell: `cmd.exe /c` re-parses
 * its arguments, so a host that passes arbitrary text (moa-fusion passes task text) must not
 * get one by default. A host that validates its arguments adds the shell itself, and only when
 * `via` is `"path"`. A host that must not run an unrelated `pi` refuses when `via` is `"path"`.
 *
 * The facts are read on every call, because tests change `process.argv[1]`. The returned
 * `args` is always a fresh array.
 */
export function resolvePiInvocation(
	args: readonly string[] = [],
	facts: PiProcessFacts = {},
): ResolvedPiInvocation {
	const argv1 = Object.hasOwn(facts, "argv1") ? facts.argv1 : process.argv[1];
	const execPath = facts.execPath ?? process.execPath;
	const exists = facts.exists ?? existsSync;

	if (argv1 && !argv1.startsWith(BUN_VIRTUAL_ROOT) && exists(argv1)) {
		return { command: execPath, args: [argv1, ...args], via: "script" };
	}

	if (!GENERIC_RUNTIME.test(basename(execPath).toLowerCase())) {
		return { command: execPath, args: [...args], via: "executable" };
	}

	return { command: "pi", args: [...args], via: "path" };
}
