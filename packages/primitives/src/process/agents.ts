import { type Dirent, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	CONFIG_DIR_NAME,
	parseFrontmatter,
} from "@earendil-works/pi-coding-agent";

/**
 * A subagent definition read from a markdown file with YAML frontmatter.
 * `S` is the host's own source labels (`"user" | "project"`, or persona-audit's three);
 * `T` is the host's thinking-level type and is `never` when the host does not read one.
 */
export interface AgentDefinition<S extends string = string, T = never> {
	name: string;
	description: string;
	/** Frontmatter `tools:` entries as written, or `undefined` when none are listed. */
	tools?: string[] | undefined;
	model?: string | undefined;
	/** Present (possibly `undefined`) only when the host passed `parseThinking`. */
	thinking?: T | undefined;
	systemPrompt: string;
	source: S;
	filePath: string;
}

export interface AgentFileOptions<T> {
	/**
	 * Read the frontmatter `thinking:` value. Receives the trimmed, non-empty string and returns
	 * the host's level, or `undefined` to drop an unrecognised one. When this is omitted the
	 * result has no `thinking` key at all.
	 */
	parseThinking?: (raw: string) => T | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `value` as a string, `undefined` when absent (YAML `null` counts as absent), or `null` when it is some other type. */
function optionalString(value: unknown): string | undefined | null {
	if (value === undefined || value === null) return undefined;
	return typeof value === "string" ? value : null;
}

/**
 * Parse one agent file, or return `undefined` to skip it. A file is skipped when it cannot be
 * read, its YAML is malformed, its frontmatter is not a mapping, `name` or `description` is not
 * a non-empty string, or `tools`, `model` (or `thinking`, when `parseThinking` is given) is
 * present but not a string. The key order is name, description, tools, model, thinking (only
 * with `parseThinking`), systemPrompt, source, filePath; `tools` and `model` keys are always
 * present.
 */
export function parseAgentFile<S extends string, T = never>(
	filePath: string,
	source: S,
	options?: AgentFileOptions<T>,
): AgentDefinition<S, T> | undefined {
	let content: string;
	try {
		content = readFileSync(filePath, "utf-8");
	} catch {
		return undefined;
	}

	let parsed: { frontmatter: Record<string, unknown>; body: string };
	try {
		parsed = parseFrontmatter<Record<string, unknown>>(content);
	} catch {
		return undefined;
	}
	const { frontmatter, body } = parsed;
	if (!isRecord(frontmatter)) return undefined;

	const { name, description } = frontmatter;
	if (typeof name !== "string" || name === "") return undefined;
	if (typeof description !== "string" || description === "") return undefined;

	const rawTools = optionalString(frontmatter.tools);
	const model = optionalString(frontmatter.model);
	if (rawTools === null || model === null) return undefined;

	const tools = rawTools
		?.split(",")
		.map((t) => t.trim())
		.filter(Boolean);

	const head = {
		name,
		description,
		tools: tools && tools.length > 0 ? tools : undefined,
		model,
	};
	const tail = { systemPrompt: body, source, filePath };

	if (!options?.parseThinking) return { ...head, ...tail };

	const rawThinking = optionalString(frontmatter.thinking);
	if (rawThinking === null) return undefined;
	const trimmed = rawThinking?.trim();
	return {
		...head,
		thinking: trimmed ? options.parseThinking(trimmed) : undefined,
		...tail,
	};
}

/**
 * Every `*.md` file (or symlink) directly in `dir`, parsed with `parseAgentFile`, in directory
 * order. A missing or unreadable directory gives `[]`; a file that is skipped never stops the
 * rest from loading.
 */
export function loadAgentsFromDir<S extends string, T = never>(
	dir: string,
	source: S,
	options?: AgentFileOptions<T>,
): AgentDefinition<S, T>[] {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}

	const agents: AgentDefinition<S, T>[] = [];
	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;
		const agent = parseAgentFile(join(dir, entry.name), source, options);
		if (agent) agents.push(agent);
	}
	return agents;
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/** The nearest `<CONFIG_DIR_NAME>/agents` directory at or above `cwd`, or `null`. */
export function findNearestProjectAgentsDir(cwd: string): string | null {
	let currentDir = cwd;
	while (true) {
		const candidate = join(currentDir, CONFIG_DIR_NAME, "agents");
		if (isDirectory(candidate)) return candidate;

		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}
