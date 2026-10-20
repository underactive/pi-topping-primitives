import type { ModelThinkingLevel } from "@earendil-works/pi-ai";

export interface ModelRef {
	provider: string;
	id: string;
}

/**
 * Pi's canonical thinking-level order. This is the same union as ./activity-tui's
 * theme-derived alias and pi-agent-core's ThinkingLevel. xhigh and max remain distinct.
 */
export const THINKING_LEVELS = Object.freeze([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const) satisfies readonly ModelThinkingLevel[];
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export const COMMON_THINKING_LEVELS = Object.freeze([
	"off",
	"low",
	"medium",
	"high",
] as const);

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return (
		typeof value === "string" &&
		(THINKING_LEVELS as readonly string[]).includes(value)
	);
}

/** Require non-empty provider and id strings; additional keys are ignored. */
export function isModelRef(value: unknown): value is ModelRef {
	return (
		!!value &&
		typeof value === "object" &&
		"provider" in value &&
		typeof value.provider === "string" &&
		value.provider.length > 0 &&
		"id" in value &&
		typeof value.id === "string" &&
		value.id.length > 0
	);
}

export function modelRefLabel(ref: ModelRef): string {
	return `${ref.provider}/${ref.id}`;
}

/** Lenient inverse of modelRefLabel: split at the first slash, or use an empty id. Never throws. */
export function parseRef(value: string): ModelRef {
	const idx = value.indexOf("/");
	if (idx === -1) return { provider: value, id: "" };
	return { provider: value.slice(0, idx), id: value.slice(idx + 1) };
}

/** Parse a model key into provider and id, or undefined when malformed. */
export function parseModelKey(key: string): ModelRef | undefined {
	// Model ids may contain slashes, so the first slash separates the provider.
	const slash = key.indexOf("/");
	if (slash !== -1) {
		if (slash < 1) return undefined;
		return { provider: key.slice(0, slash), id: key.slice(slash + 1) };
	}
	const colon = key.indexOf(":");
	if (colon < 1) return undefined;
	return { provider: key.slice(0, colon), id: key.slice(colon + 1) };
}

/** Compose a canonical `provider/id` model key. */
export function composeModelKey(provider: string, id: string): string {
	return `${provider}/${id}`;
}

const MODEL_ATTR_SEGMENTS = Object.freeze([
	"pro",
	"plus",
	"max",
	"ultra",
	"mini",
	"flash",
	"turbo",
	"coder",
	"instruct",
	"preview",
	"lite",
	"base",
	"sonnet",
	"opus",
	"haiku",
	"thinking",
	"reasoning",
]);
const CLAUDE_FAMILY_SEGMENTS = Object.freeze(["sonnet", "opus", "haiku"]);

function isVersionOrAttrSegment(segment: string): boolean {
	const seg = segment.toLowerCase();
	if (MODEL_ATTR_SEGMENTS.includes(seg)) return true;
	if (/^v\d/.test(seg)) return true;
	if (/^k\d/.test(seg)) return true;
	if (/^[a-z]\d+(\.\d+)*$/i.test(seg)) return true;
	if (/^\d+(\.\d+)*$/.test(seg)) return true;
	return false;
}

function modelIdBase(ref: ModelRef): string {
	const slashIdx = ref.id.lastIndexOf("/");
	return slashIdx >= 0 ? ref.id.slice(slashIdx + 1) : ref.id;
}

/** Short display name for MoA overlay (e.g. "claude-opus-4-6" → "opus", "deepseek-v4-pro" → "deepseek"). */
export function shortModelName(ref: ModelRef): string {
	const base = modelIdBase(ref);
	const segments = base.split("-").filter(Boolean);
	// Claude's family is its useful compact identifier; "claude" only names
	// the product and does not distinguish Opus, Sonnet, and Haiku.
	if (segments[0]?.toLowerCase() === "claude") {
		const family = segments.find((segment) =>
			CLAUDE_FAMILY_SEGMENTS.includes(segment.toLowerCase()),
		);
		if (family) return family.toLowerCase();
	}
	const kept = segments.filter((s) => !isVersionOrAttrSegment(s));
	let name = kept.length > 0 ? kept.join("-") : base;
	name = name.replace(/\d+(\.\d+)*$/, "");
	return name.toLowerCase() || base;
}
