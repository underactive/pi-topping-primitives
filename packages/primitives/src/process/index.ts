/**
 * Finding and starting pi, killing what was started, and the small helpers around it.
 *
 * Contract:
 * - Nothing spawns on import and there is no module state. `createProcessTracker()` returns a
 *   new registry each call, so each extension owns the processes it started and a `/reload`
 *   kills only those. Every exported value is a function or a number.
 * - `agents.ts` is the only runtime pi-coding-agent importer (`parseFrontmatter`,
 *   `CONFIG_DIR_NAME`), which makes this the second such subpath after `./settings`.
 * - `resolvePiInvocation` wraps no Windows shell. Its `via` field is the host's policy hook:
 *   a host that validates its arguments adds `cmd.exe /c` itself and only when `via` is
 *   `"path"`; a host that must not run an unrelated `pi` refuses when `via` is `"path"`.
 * - Agent layering (user over project, or persona-audit's bundled layer and its
 *   `persona-audit-*` shadow guard) and the sub-run transports stay in the hosts. Only the
 *   per-file and per-directory loader and the upward `.pi/agents` walk are here.
 * - `hostBelow` is not `versionAtLeast`: it is anchored, and an unparseable version counts as
 *   new enough.
 * - `isProcessAlive` and `acquireDirLock` stay in `./settings`.
 * - The other non-text helpers the toppings copied (the env-flag and notification helpers,
 *   `combineSignals`, `raceAbort`, `createDeadline`, `stableStringify`) are not here.
 */

export type { AgentDefinition, AgentFileOptions } from "./agents.js";
export {
	findNearestProjectAgentsDir,
	loadAgentsFromDir,
	parseAgentFile,
} from "./agents.js";
export { mapWithConcurrencyLimit } from "./concurrency.js";
export type {
	PiInvocation,
	PiInvocationVia,
	PiProcessFacts,
	ResolvedPiInvocation,
} from "./invocation.js";
export { resolvePiInvocation } from "./invocation.js";
export type { KillableProcess, ProcessTracker } from "./kill.js";
export {
	createProcessTracker,
	DEFAULT_KILL_GRACE_MS,
	escalateKill,
} from "./kill.js";
export type { SpawnCollectOptions, SpawnCollectResult } from "./spawn.js";
export { SPAWN_TIMEOUT_EXIT_CODE, spawnCollect } from "./spawn.js";
export type { PiVersion } from "./version.js";
export { hostBelow, parsePiVersion, versionAtLeast } from "./version.js";
