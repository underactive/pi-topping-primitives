import {
	type Api,
	getSupportedThinkingLevels,
	type Model,
} from "@earendil-works/pi-ai";
import {
	type ModelRef,
	modelRefLabel,
	parseRef,
	type ThinkingLevel,
} from "./refs.js";
import { thinkingOptionsForModel } from "./thinking.js";

/** The slice of pi's ModelRegistry needed to build a catalogue. */
export interface CatalogueRegistry {
	getAvailable(): readonly Model<Api>[];
}

export interface ModelCatalogue {
	/** Selectable models sorted by provider/id, with fresh ref objects on every call. */
	availableRefs(): ModelRef[];
	/** Fresh levels in pi's canonical order, or [] for an unknown model. */
	thinkingLevelsFor(ref: ModelRef): ThinkingLevel[];
}

const CATALOGUES = new WeakMap<CatalogueRegistry, ModelCatalogue>(); // hygiene-allow: module-state keyed by the host's registry object so the cache dies with it; a second package copy holds its own

export function getModelCatalogue(registry: CatalogueRegistry): ModelCatalogue {
	const cached = CATALOGUES.get(registry);
	if (cached) return cached;
	const built = buildCatalogue(registry);
	CATALOGUES.set(registry, built);
	return built;
}

function buildCatalogue(registry: CatalogueRegistry): ModelCatalogue {
	const levels = new Map<string, ThinkingLevel[]>();
	for (const model of registry.getAvailable()) {
		const key = modelRefLabel(model);
		if (levels.has(key)) continue;
		levels.set(key, thinkingOptionsForModel(getSupportedThinkingLevels(model)));
	}
	const refs = [...levels.keys()]
		.sort((a, b) => a.localeCompare(b))
		.map(parseRef);
	return {
		availableRefs: () => refs.map((ref) => ({ ...ref })),
		thinkingLevelsFor: (ref) => [...(levels.get(modelRefLabel(ref)) ?? [])],
	};
}

/** Drop retired choices by exact provider/id, but preserve them if the catalogue is empty. */
export function validateSavedChoice<T extends { ref: ModelRef }>(
	choice: T | undefined,
	available: readonly ModelRef[],
): { choice?: T; dropped?: string } {
	if (!choice) return {};
	// An empty catalogue means nothing resolves at all; dropping every saved
	// choice there would trade one clear failure for a confusing warning.
	if (available.length === 0) return { choice };
	const label = modelRefLabel(choice.ref);
	return available.some((ref) => modelRefLabel(ref) === label)
		? { choice }
		: { dropped: label };
}

/** Close over the cached registry view to supply a picker's levelOptions policy. */
export function registryLevelOptions(
	registry: CatalogueRegistry,
	options?: { fallback?: readonly ThinkingLevel[] },
): (ref: ModelRef) => ThinkingLevel[] {
	const catalogue = getModelCatalogue(registry);
	return (ref) =>
		thinkingOptionsForModel(catalogue.thinkingLevelsFor(ref), options);
}
