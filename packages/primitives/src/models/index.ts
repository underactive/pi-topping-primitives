/**
 * Model references, registry catalogues, thinking policy and the unframed two-pane picker.
 *
 * Contract:
 * - Colour and selection policy belong to the host; no global theme is read.
 * - The only module state is a WeakMap keyed by the host's registry. It dies with that
 *   registry; a second package copy has its own cache. Exported tables are frozen.
 * - Keys are physical pi-tui keys, with Escape as the only default back key. Hosts can
 *   override backKeys. Frames, overlays, warnings and persistence stay with the host.
 * - Without requestRender the picker is render-pure: owners schedule their own repaint.
 * - Runtime pi imports: pi-ai's getSupportedThinkingLevels; pi-tui's SelectList,
 *   fuzzyFilter, Key, matchesKey, decodeKittyPrintable, truncateToWidth, visibleWidth
 *   and wrapTextWithAnsi. pi-coding-agent is imported for theme types only.
 */
export {
	type CatalogueRegistry,
	getModelCatalogue,
	type ModelCatalogue,
	registryLevelOptions,
	validateSavedChoice,
} from "./catalogue.js";
export { fuzzyRanked } from "./filter.js";
export {
	MODEL_LIST_LAYOUT,
	modelThinkingPaneWidths,
	smartTruncateModelLabel,
} from "./label.js";
export {
	type ModelPickerTheme,
	TwoPaneModelThinking,
	type TwoPaneModelThinkingOptions,
} from "./picker.js";
export {
	COMMON_THINKING_LEVELS,
	composeModelKey,
	isModelRef,
	isThinkingLevel,
	type ModelRef,
	modelRefLabel,
	parseModelKey,
	parseRef,
	shortModelName,
	THINKING_LEVELS,
	type ThinkingLevel,
} from "./refs.js";
export {
	defaultThinkingForModel,
	thinkingOptionsForModel,
} from "./thinking.js";
