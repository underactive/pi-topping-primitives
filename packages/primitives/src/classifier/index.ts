/**
 * Jev classifier plumbing shared by the pi-topping extensions: the known model
 * chain and its credentialed catalogue, one normalized `classify` call, answer
 * readers, the circuit breaker, and the picker that lets a user pin a model.
 *
 * Contract:
 * - Every registry surface is structural; pi's `ModelRegistry` satisfies them
 *   as-is, and a test can supply a three-method stub.
 * - Nothing here is agentic: no tools, no repo access. A host that needs the
 *   repository keeps that work in its own phase and classifies a summary.
 * - Colour and keys are the host's: the picker takes a structural theme and the
 *   host's `KeybindingsManager`, falling back to pi's global keybindings only
 *   when a host constructs the component directly.
 * - No module state. Exported tables are deeply frozen.
 * - Runtime pi imports: pi-coding-agent's `getKeybindings` and `getSelectListTheme`;
 *   pi-tui's `SelectList`, `fuzzyFilter`, `decodeKittyPrintable`, `truncateToWidth`
 *   and `visibleWidth`.
 */
export {
	type Answers,
	type BoolAnswer,
	boolAnswer,
	type ChoiceAnswer,
	choiceAnswer,
	type ScoreAnswer,
	scoreAnswer,
} from "./answers.js";
export {
	type ClassificationFailureKind,
	type ClassificationOutcome,
	type ClassifyOptions,
	failureReason,
	isProbability,
	looksLikeTimeout,
	runClassification,
} from "./classify.js";
export {
	AUTO_CLASSIFIER,
	clampCooldownSeconds,
	clampTimeoutMs,
	DEFAULT_CIRCUIT_BREAKER_COOLDOWN_SECONDS,
	DEFAULT_CLASSIFIER_CONFIG,
	DEFAULT_CLASSIFIER_TIMEOUT_MS,
	isPinnedClassifier,
	type JevClassifierConfig,
	preferredClassifier,
} from "./config.js";
export {
	availableClassifiers,
	type BreakerState,
	CircuitBreaker,
	type ClassifierCatalog,
	type ClassifyRegistry,
	JEV_MODELS,
	type JevModel,
	type JevRegistry,
	modelName,
	selectJevModel,
} from "./jev.js";
export {
	type ClassifierOption,
	ClassifierPickerComponent,
	type ClassifierPickerConfig,
	type ClassifierPickerTheme,
	classifierPickerOptions,
	showClassifierPicker,
} from "./picker.js";
