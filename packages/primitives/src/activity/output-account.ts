import { StreamingWordCounter } from "./word-counter.js";

/** Cumulative generated-output reading for an activity monitor. */
export interface OutputTokenSnapshot {
	/** Tokens generated so far: confirmed turns plus the in-flight turn. */
	tokens: number;
	/**
	 * Bumped whenever exact provider usage replaces a differing estimate.
	 * Consumers reset their rate tracker on a change so the correction doesn't
	 * register as a burst of generation that never happened.
	 */
	revision: number;
}

/** The slice of a streamed assistant event the account reads. */
export interface OutputTokenEvent {
	type?: string;
	delta?: unknown;
}

/** The slice of a message the account reads. Only assistant messages count. */
export interface OutputTokenMessage {
	role?: string;
	usage?: { output?: unknown };
}

function isPositiveFinite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonnegativeFinite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Tracks how much text a task is generating, for an activity monitor.
 *
 * Providers vary in what they report: some stream `usage.output` on the in-flight partial, some
 * only attach usage to the finished message, some never report it at all. Exact usage always
 * wins; otherwise words are counted incrementally off the streamed deltas so the meter still
 * moves. Usage that is negative, NaN or infinite is not exact usage and is ignored.
 */
export class OutputTokenAccount {
	#counter = new StreamingWordCounter();
	#confirmed = 0;
	#liveExact: number | undefined;
	#liveWords = 0;
	#revision = 0;

	/** Begin a new assistant turn, discarding only the previous turn's live estimate. */
	messageStart(message?: { role?: string }): void {
		if (message?.role !== "assistant") return;
		this.#resetTurn();
	}

	/** Feed one streamed event, with the in-flight message when the host provides it. */
	messageUpdate(event?: OutputTokenEvent, partial?: OutputTokenMessage): void {
		const exact =
			partial?.role === "assistant" ? partial.usage?.output : undefined;
		if (isPositiveFinite(exact)) this.#liveExact = exact;
		if (event?.type !== "text_delta" && event?.type !== "thinking_delta")
			return;
		if (typeof event.delta !== "string") return;
		// Counted per stream kind so a word split across deltas isn't double
		// counted, and interleaved thinking/text streams don't corrupt each other.
		this.#liveWords += this.#counter.count(event.delta, event.type);
	}

	/** Confirm the turn: exact usage when valid, else the estimate. */
	messageEnd(message?: OutputTokenMessage): void {
		if (message?.role !== "assistant") return;
		const exact = message.usage?.output;
		const estimate = this.#liveExact ?? this.#liveWords;
		if (isNonnegativeFinite(exact)) {
			this.#confirmed += exact;
			if (exact !== estimate) this.#revision++;
		} else {
			this.#confirmed += estimate;
		}
		this.#resetTurn();
	}

	snapshot(): OutputTokenSnapshot {
		return {
			tokens: this.#confirmed + (this.#liveExact ?? this.#liveWords),
			revision: this.#revision,
		};
	}

	/** Forget everything, including the revision. */
	reset(): void {
		this.#confirmed = 0;
		this.#revision = 0;
		this.#resetTurn();
	}

	#resetTurn(): void {
		this.#liveExact = undefined;
		this.#liveWords = 0;
		this.#counter.reset();
	}
}
