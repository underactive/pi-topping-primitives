/**
 * Jev classifier models as pi serves them: the known provider chain, the
 * credentialed-catalogue view, and the circuit breaker that keeps a dead
 * classifier off the hot path.
 *
 * Contract:
 * - The registry is structural, so a host (or a test) supplies only the slice it
 *   has; pi's `ModelRegistry` satisfies every interface here as-is.
 * - No module state. The exported tables are deeply frozen.
 */
import type {
	ClassifierApi,
	ClassifierContext,
	ClassifierModel,
	ClassifierResult,
	ModelsClassifierOptions,
} from "@earendil-works/pi-ai";

export type JevModel = ClassifierModel<ClassifierApi>;

/** The slice of a model registry the classifier helpers read. */
export interface JevRegistry {
	findOfType(
		type: "classifier",
		provider: string,
		modelId: string,
	): JevModel | undefined;
	getProviderAuthStatus(provider: string): {
		configured: boolean;
		source?: string;
	};
}

/** The slice of a model registry that classifies structured state. */
export interface ClassifyRegistry {
	classify(
		model: JevModel,
		context: ClassifierContext,
		options?: ModelsClassifierOptions,
	): Promise<ClassifierResult>;
}

/** The registry slice that lists classifier choices. */
export interface ClassifierCatalog {
	getModelsOfType(type: "classifier"): readonly JevModel[];
	getProviderAuthStatus(provider: string): { configured: boolean };
}

/** Jev models pi serves, in the order pi documents them; the first whose provider has credentials is used. */
export const JEV_MODELS: ReadonlyArray<{ provider: string; id: string }> =
	Object.freeze([
		Object.freeze({ provider: "typesafe", id: "jev-latest" }),
		Object.freeze({ provider: "openrouter", id: "typesafe/jev-1.13" }),
		Object.freeze({ provider: "cloudflare-workers-ai", id: "typesafe/jev" }),
		Object.freeze({ provider: "vercel-ai-gateway", id: "typesafe-ai/jev" }),
		Object.freeze({ provider: "opencode", id: "jev-1.13" }),
	]);

/** Classifier models whose provider has credentials: known Jev models in auto order, then the rest by name. */
export function availableClassifiers(registry: ClassifierCatalog): JevModel[] {
	const known = (model: JevModel): number =>
		JEV_MODELS.findIndex(
			(entry) => entry.provider === model.provider && entry.id === model.id,
		);
	return registry
		.getModelsOfType("classifier")
		.filter(
			(model) => registry.getProviderAuthStatus(model.provider).configured,
		)
		.sort((left, right) => {
			const leftKnown = known(left);
			const rightKnown = known(right);
			if (leftKnown !== -1 || rightKnown !== -1) {
				return (
					(leftKnown === -1 ? Infinity : leftKnown) -
					(rightKnown === -1 ? Infinity : rightKnown)
				);
			}
			return modelName(left).localeCompare(modelName(right));
		});
}

/** `provider/model-id`, the form a pinned setting stores and the picker displays. */
export function modelName(model: Pick<JevModel, "provider" | "id">): string {
	return `${model.provider}/${model.id}`;
}

/** The configured classifier model when it exists and has credentials, else the first configured known Jev model. */
export function selectJevModel(
	registry: JevRegistry,
	preferred?: { provider?: string; model?: string },
): JevModel | undefined {
	const candidates =
		preferred?.provider && preferred.model
			? [{ provider: preferred.provider, id: preferred.model }, ...JEV_MODELS]
			: JEV_MODELS;
	for (const { provider, id } of candidates) {
		const model = registry.findOfType("classifier", provider, id);
		if (model && registry.getProviderAuthStatus(provider).configured)
			return model;
	}
	return undefined;
}

export type BreakerState = "closed" | "open" | "half-open";

/**
 * LiteLLM's classifier circuit breaker: a recognised timeout opens the circuit for the cooldown,
 * one probe request is allowed afterwards, success closes it and failure starts another cooldown.
 * Non-timeout errors never open it.
 */
export class CircuitBreaker {
	#cooldownMs: () => number;
	#now: () => number;
	#openedAt: number | undefined;
	#probing = false;
	#opens = 0;

	constructor(
		cooldownMs: number | (() => number),
		now: () => number = Date.now,
	) {
		this.#cooldownMs =
			typeof cooldownMs === "number" ? () => cooldownMs : cooldownMs;
		this.#now = now;
	}

	/** How many times the circuit has opened since the last reset. */
	get opens(): number {
		return this.#opens;
	}

	state(): BreakerState {
		if (this.#openedAt === undefined) return "closed";
		if (this.#probing) return "half-open";
		return this.#now() - this.#openedAt >= this.#cooldownMs()
			? "half-open"
			: "open";
	}

	/** Whether a classifier call may be made now; a half-open circuit admits exactly one probe. */
	allow(): boolean {
		if (this.#openedAt === undefined) return true;
		if (this.#probing) return false;
		if (this.#now() - this.#openedAt < this.#cooldownMs()) return false;
		this.#probing = true;
		return true;
	}

	recordTimeout(): void {
		this.#openedAt = this.#now();
		this.#probing = false;
		this.#opens += 1;
	}

	recordSuccess(): void {
		this.#openedAt = undefined;
		this.#probing = false;
	}

	/** A non-timeout failure during a probe ends the probe without re-opening on its own. */
	recordFailure(): void {
		if (this.#openedAt !== undefined) {
			this.#openedAt = this.#now();
			this.#probing = false;
		}
	}

	reset(): void {
		this.#openedAt = undefined;
		this.#probing = false;
		this.#opens = 0;
	}
}
