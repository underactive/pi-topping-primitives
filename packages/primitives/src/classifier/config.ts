/**
 * Persisted classifier selection and its resilience bounds, shared by every host
 * that lets a user pin a Jev model in settings.
 *
 * Contract:
 * - `provider`/`model` are `"auto"` when unset, meaning "first configured known
 *   Jev model" (see `selectJevModel`). A pinned `"provider/model"` overrides it.
 * - The numbers are bounds a host may narrow, never widen past these defaults.
 */

/** The settings value that means "first configured known Jev model". */
export const AUTO_CLASSIFIER = "auto";

/** LiteLLM's classifier deadline: a call that outlives it is a timeout, not an error. */
export const DEFAULT_CLASSIFIER_TIMEOUT_MS = 3000;

/** How long a recognised timeout keeps the circuit open before one probe is admitted. */
export const DEFAULT_CIRCUIT_BREAKER_COOLDOWN_SECONDS = 30;

export interface JevClassifierConfig {
	/** Classifier provider in pi's catalog; `"auto"` picks the first configured known Jev model. */
	provider?: string;
	/** Classifier model id in pi's catalog; `"auto"` picks the first configured known Jev model. */
	model?: string;
	timeoutMs: number;
	circuitBreakerEnabled: boolean;
	circuitBreakerCooldownSeconds: number;
}

/** The bounds a host starts from before its own sanitize narrows them. */
export const DEFAULT_CLASSIFIER_CONFIG: JevClassifierConfig = Object.freeze({
	provider: AUTO_CLASSIFIER,
	model: AUTO_CLASSIFIER,
	timeoutMs: DEFAULT_CLASSIFIER_TIMEOUT_MS,
	circuitBreakerEnabled: true,
	circuitBreakerCooldownSeconds: DEFAULT_CIRCUIT_BREAKER_COOLDOWN_SECONDS,
});

/** Whether a stored selection names a model rather than the auto sentinel. */
export function isPinnedClassifier(
	selection: { provider?: string; model?: string } | undefined,
): boolean {
	return preferredClassifier(selection) !== undefined;
}

/** The `provider`/`model` pair `selectJevModel` takes, or undefined for auto or an unusable selection. */
export function preferredClassifier(
	selection: { provider?: string; model?: string } | undefined,
): { provider: string; model: string } | undefined {
	if (!selection) return undefined;
	const { provider, model } = selection;
	if (!provider || !model) return undefined;
	if (provider === AUTO_CLASSIFIER && model === AUTO_CLASSIFIER)
		return undefined;
	return { provider, model };
}

/** Clamp a stored timeout to a positive whole number of milliseconds. */
export function clampTimeoutMs(
	value: unknown,
	fallback: number = DEFAULT_CLASSIFIER_TIMEOUT_MS,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.max(1, Math.round(value));
}

/** Clamp a stored cooldown to a non-negative whole number of seconds. */
export function clampCooldownSeconds(
	value: unknown,
	fallback: number = DEFAULT_CIRCUIT_BREAKER_COOLDOWN_SECONDS,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.max(0, Math.round(value));
}
