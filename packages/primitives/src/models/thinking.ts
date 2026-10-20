import { THINKING_LEVELS, type ThinkingLevel } from "./refs.js";

/** Canonical registry levels, or a copied host fallback when none are offered. */
export function thinkingOptionsForModel(
	registryLevels: readonly string[] | undefined,
	options?: { fallback?: readonly ThinkingLevel[] },
): ThinkingLevel[] {
	const levels = THINKING_LEVELS.filter((level) =>
		registryLevels?.includes(level),
	);
	return levels.length > 0 ? levels : [...(options?.fallback ?? [])];
}

/** Prefer an offered saved override, current level, medium, then the first offered level. */
export function defaultThinkingForModel(
	key: string,
	overrides: Readonly<Record<string, ThinkingLevel>>,
	currentLevel: ThinkingLevel,
	registryLevels: readonly string[] | undefined,
): ThinkingLevel {
	const options = thinkingOptionsForModel(registryLevels);
	const saved = overrides[key];
	if (saved && options.includes(saved)) return saved;
	if (options.includes(currentLevel)) return currentLevel;
	if (options.includes("medium")) return "medium";
	return options[0] ?? "medium";
}
