// Shared helpers for the classifier suites. Not a `.test.ts` file, so it is typechecked but not
// run on its own. The fake theme emits real SGR codes so visibleWidth()/truncateToWidth() behave
// as they do with pi's theme, and the fake registry records the calls the helpers make.
import type {
	ClassifierApi,
	ClassifierContext,
	ClassifierModel,
	ClassifierResult,
	ModelsClassifierOptions,
} from "@earendil-works/pi-ai";
import type {
	ClassifierCatalog,
	ClassifyRegistry,
	JevModel,
	JevRegistry,
} from "../src/classifier/jev.js";
import type { ClassifierPickerTheme } from "../src/classifier/picker.js";

/** Raw terminal input for each physical key the picker matches. */
export const KEY = Object.freeze({
	up: "\x1b[A",
	down: "\x1b[B",
	enter: "\r",
	escape: "\x1b",
	backspace: "\x7f",
});

export const RESET = "\x1b[0m";

const FG: Readonly<Record<string, string>> = Object.freeze({
	accent: "\x1b[36m",
	dim: "\x1b[2m",
	muted: "\x1b[90m",
	border: "\x1b[37m",
});

/** Emits a reset after every span, matching how pi's theme closes a style. */
export function fakeTheme(): ClassifierPickerTheme {
	return { fg: (color, text) => `${FG[color] ?? ""}${text}${RESET}` };
}

export function stripAnsi(text: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping real SGR codes
	return text.replace(/\x1b\[[0-9;]*m/g, "");
}

export const jevModel: ClassifierModel<ClassifierApi> = {
	type: "classifier",
	id: "jev-latest",
	name: "Jev",
	api: "typesafe-system-one",
	provider: "typesafe",
	baseUrl: "https://api.typesafe.ai/v1/",
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 64_000,
};

export interface FakeRegistryOptions {
	configured?: string[];
	models?: { provider: string; id: string }[];
	classify?: (
		model: unknown,
		context: ClassifierContext,
		options?: ModelsClassifierOptions,
	) => Promise<ClassifierResult>;
}

export type FakeRegistry = JevRegistry &
	ClassifyRegistry &
	ClassifierCatalog & {
		calls: { context: ClassifierContext; options?: ModelsClassifierOptions }[];
	};

/** A registry stub that resolves only the models it is given, and records every classify call. */
export function fakeRegistry(options: FakeRegistryOptions = {}): FakeRegistry {
	const configured = new Set(options.configured ?? ["typesafe"]);
	const models = options.models ?? [{ provider: "typesafe", id: "jev-latest" }];
	const calls: {
		context: ClassifierContext;
		options?: ModelsClassifierOptions;
	}[] = [];
	return {
		calls,
		findOfType: (_type, provider, id) =>
			models.some((model) => model.provider === provider && model.id === id)
				? ({
						...jevModel,
						provider,
						id,
					} satisfies ClassifierModel<ClassifierApi>)
				: undefined,
		getProviderAuthStatus: (provider) => ({
			configured: configured.has(provider),
			source: "environment",
		}),
		getModelsOfType: () =>
			models.map((model) => ({
				...jevModel,
				provider: model.provider,
				id: model.id,
			})),
		async classify(model, context, classifyOptions) {
			calls.push({ context, options: classifyOptions });
			return options.classify
				? options.classify(model, context, classifyOptions)
				: okResult("MEDIUM");
		},
	};
}

/** A stopped result whose `tier` answer a caller can override. */
export function okResult(
	choice: string,
	confidence = 0.91,
	overrides: Partial<ClassifierResult> = {},
): ClassifierResult {
	return {
		api: "typesafe-system-one",
		provider: "typesafe",
		model: "jev-1.13.0",
		answers: {
			tier: {
				type: "choice",
				choice,
				confidence,
				probabilities: {
					SIMPLE: 0.02,
					MEDIUM: 0.05,
					COMPLEX: 0.91,
					REASONING: 0.02,
				},
			},
		},
		usage: {
			input: 300,
			output: 4,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 304,
			cost: {
				input: 0.00001,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				total: 0.00001,
			},
		},
		stopReason: "stop",
		timestamp: 1,
		...overrides,
	};
}

/** A `JevModel` that is not the default fixture, for catalogue ordering tests. */
export function otherModel(
	provider: string,
	id: string,
	api = "typesafe-system-one",
): JevModel {
	return { ...jevModel, provider, id, api };
}
