/**
 * Stable names and parsers for contracts shared across pi-topping extensions.
 *
 * Compatibility rules: names never change; payloads only gain fields; parsers
 * ignore unknown fields. The `V1` suffix is used only on versioned payloads.
 * An incompatible change to an unversioned payload must take a new name.
 */
export const CHANNELS = Object.freeze({
	routedModel: "pi-topping-routesense:routed-model",
	workingStatusEmbedded: "pi-topping-statusline:working-status-embedded",
} as const);
export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

export const ENTRY_TYPES = Object.freeze({
	compactSavings: "pi-topping-compact/savings",
	compactCompactionSavings: "pi-topping-compact/compaction-savings",
	compactCompaction: "pi-topping-compact/compaction",
	browser: "pi-topping-web-tools/browser",
	splashLocalChanges: "pi-topping-splash:local-changes",
} as const);
export type EntryType = (typeof ENTRY_TYPES)[keyof typeof ENTRY_TYPES];

/** pi's VIRTUAL_MODEL_API (core/virtual-models); not exported from pi's root at 1.3.0. */
export const PI_VIRTUAL_MODEL_API = "pi-virtual";
/** Statusline's embedded-status slide; pi-topping slides its response model on the same clock. */
export const WORKING_STATUS_SLIDE_MS = 300;

/** Mirrors pi's ModelRouteReason. */
export type RouteReason = "user" | "continuation" | "retry" | "direct";

/** Wire payload routesense emits (emit side, strict). Open-ended fields are `string` so new values stay additive. */
export interface RoutedModelAnnouncementV1 {
	version: 1;
	provider: string;
	modelId: string;
	model: string;
	name: string;
	thinkingLevel: string;
	reason: RouteReason;
	cause: string;
	tier?: string;
	toolSignal?: string;
	hold?: string;
	ts: number;
}

/** What subscribers receive: the sanitised core every reader uses. Fields may be added later, never removed. */
export interface ParsedRoutedModel {
	provider: string;
	modelId: string;
	reason: RouteReason;
	thinkingLevel?: string;
}

export interface EmbeddedAnnouncement {
	embedded: boolean;
}

export interface ChannelPayloads {
	[CHANNELS.routedModel]: RoutedModelAnnouncementV1;
	[CHANNELS.workingStatusEmbedded]: EmbeddedAnnouncement;
}

export interface ParsedChannelPayloads {
	[CHANNELS.routedModel]: ParsedRoutedModel;
	[CHANNELS.workingStatusEmbedded]: EmbeddedAnnouncement;
}

export interface SavingsEntry {
	savedUsd: number;
}

export interface CompactionOutcomeEntry {
	tokensBefore: number;
	estimatedTokensAfter: number | null;
	contextWindow: number;
	percentBefore: number;
	percentAfter: number | null;
	/** "threshold" | "idle" | "manual" | "overflow" today; readers must tolerate others. */
	reason: string;
	label: string;
}

export interface BrowserFeedPayload {
	label: string;
	open: 0 | 1;
}

export interface EntryPayloads {
	[ENTRY_TYPES.compactSavings]: SavingsEntry;
	[ENTRY_TYPES.compactCompactionSavings]: SavingsEntry;
	[ENTRY_TYPES.compactCompaction]: CompactionOutcomeEntry;
	[ENTRY_TYPES.browser]: BrowserFeedPayload;
	/** Name reserved here; the payload and its strict validator stay owned by splash. */
	[ENTRY_TYPES.splashLocalChanges]: unknown;
}

/** pi.events, structurally (pi's EventBus). */
export interface EventBusLike {
	emit(channel: string, data: unknown): void;
	on(channel: string, handler: (data: unknown) => void): () => void;
}

const ROUTE_REASONS = Object.freeze([
	"user",
	"continuation",
	"retry",
	"direct",
] as const);

function isRecord(data: unknown): data is Record<string, unknown> {
	return typeof data === "object" && data !== null && !Array.isArray(data);
}

function sanitizedText(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	return value.replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
}

/**
 * Validate a version-1 routesense announcement and return only the stable fields.
 * Required text fields are stripped of control/format characters and trimmed;
 * unknown fields are ignored and an empty optional thinking level is omitted.
 */
export function parseRoutedModel(data: unknown): ParsedRoutedModel | undefined {
	if (!isRecord(data) || data.version !== 1) return undefined;

	const provider = sanitizedText(data.provider);
	const modelId = sanitizedText(data.modelId);
	const reason = sanitizedText(data.reason);
	if (
		!provider ||
		!modelId ||
		!reason ||
		!ROUTE_REASONS.some((candidate) => candidate === reason)
	) {
		return undefined;
	}

	const thinkingLevel = sanitizedText(data.thinkingLevel);
	return thinkingLevel
		? { provider, modelId, reason: reason as RouteReason, thinkingLevel }
		: { provider, modelId, reason: reason as RouteReason };
}

/** Accept only an object with a boolean `embedded`; all other fields are ignored. */
export function parseEmbeddedAnnouncement(
	data: unknown,
): EmbeddedAnnouncement | undefined {
	if (!isRecord(data) || typeof data.embedded !== "boolean") return undefined;
	return { embedded: data.embedded };
}

/** Emit the strict wire payload unchanged; validation belongs to subscribers. */
export function emit<C extends Channel>(
	events: Pick<EventBusLike, "emit">,
	channel: C,
	payload: ChannelPayloads[C],
): void {
	events.emit(channel, payload);
}

const PARSERS: {
	[C in Channel]: (data: unknown) => ParsedChannelPayloads[C] | undefined;
} = Object.freeze({
	[CHANNELS.routedModel]: parseRoutedModel,
	[CHANNELS.workingStatusEmbedded]: parseEmbeddedAnnouncement,
});

/** Parse, filter and forward one channel; return the event bus's own unsubscriber. */
export function subscribe<C extends Channel>(
	events: Pick<EventBusLike, "on">,
	channel: C,
	handler: (payload: ParsedChannelPayloads[C]) => void,
): () => void {
	return events.on(channel, (data) => {
		const parsed = PARSERS[channel](data);
		if (parsed === undefined) return;
		return handler(parsed as ParsedChannelPayloads[C]);
	});
}
