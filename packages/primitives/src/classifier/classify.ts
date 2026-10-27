/**
 * One classifier call, normalized: a resolved answer set, or a failure whose
 * `kind` tells the host whether to retry, fall back, or open the circuit.
 *
 * Contract:
 * - The registry's `classify` never rejects, but a host's stub can throw, so a
 *   thrown error is reported as a failure rather than propagated.
 * - `kind: "timeout"` covers a reported timeout, a deadline-shaped error, and a
 *   call that outlived `timeoutMs`; every other failure is `"error"`.
 * - `cost` and `latencyMs` are reported even on failure, so a host can account
 *   for a call that billed and then failed.
 */
import type {
	ClassifierAnswer,
	ClassifierContext,
	ClassifierResult,
} from "@earendil-works/pi-ai";
import type { ClassifyRegistry, JevModel } from "./jev.js";

export type ClassificationFailureKind = "timeout" | "aborted" | "error";

export type ClassificationOutcome =
	| {
			ok: true;
			answers: Record<string, ClassifierAnswer>;
			latencyMs: number;
			cost: number;
			model: string;
	  }
	| {
			ok: false;
			kind: ClassificationFailureKind;
			reason: string;
			latencyMs: number;
			cost: number;
			model: string;
	  };

export interface ClassifyOptions {
	signal?: AbortSignal;
	timeoutMs: number;
	/** Injected clock; defaults to `Date.now`. */
	now?: () => number;
}

const MAX_REASON_CHARS = 200;

/** Flatten an error-ish value into one short line, whatever the host threw. */
export function failureReason(message: string | undefined): string {
	const collapsed = message?.replace(/\s+/g, " ").trim() ?? "";
	if (collapsed === "") return "unknown error";
	return collapsed.length <= MAX_REASON_CHARS
		? collapsed
		: `${collapsed.slice(0, MAX_REASON_CHARS - 1)}…`;
}

/** Deadline-shaped wording, so a provider's own timeout counts as a timeout. */
export function looksLikeTimeout(message: string | undefined): boolean {
	return /timed? ?out|timeout|deadline/i.test(message ?? "");
}

/** A probability as the classifier API defines it: finite and within [0, 1]. */
export function isProbability(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isFinite(value) &&
		value >= 0 &&
		value <= 1
	);
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Run one classification and normalize every way it can end. */
export async function runClassification(
	registry: ClassifyRegistry,
	model: JevModel,
	context: ClassifierContext,
	options: ClassifyOptions,
): Promise<ClassificationOutcome> {
	const now = options.now ?? Date.now;
	const started = now();
	const name = `${model.provider}/${model.id}`;
	let result: ClassifierResult;
	try {
		result = await registry.classify(model, context, {
			signal: options.signal,
			timeoutMs: options.timeoutMs,
			maxRetries: 0,
		});
	} catch (error) {
		const latencyMs = now() - started;
		const reason = failureReason(errorText(error));
		return {
			ok: false,
			kind: looksLikeTimeout(reason) ? "timeout" : "error",
			reason,
			latencyMs,
			cost: 0,
			model: name,
		};
	}
	const latencyMs = now() - started;
	if (result.stopReason === "aborted") {
		return {
			ok: false,
			kind: "aborted",
			reason: "aborted",
			latencyMs,
			cost: 0,
			model: name,
		};
	}
	if (result.stopReason !== "stop") {
		const reason = failureReason(result.errorMessage);
		const timedOut =
			looksLikeTimeout(result.errorMessage) || latencyMs >= options.timeoutMs;
		return {
			ok: false,
			kind: timedOut ? "timeout" : "error",
			reason,
			latencyMs,
			cost: result.usage?.cost.total ?? 0,
			model: name,
		};
	}
	return {
		ok: true,
		answers: result.answers,
		latencyMs,
		cost: result.usage?.cost.total ?? 0,
		model: name,
	};
}
