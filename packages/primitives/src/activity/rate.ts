import { fadeShade } from "./fade.js";

const EMA_ALPHA = 0.4;

/** EMA-smoothed rate tracker for a cumulative output-token estimate. */
export class TokRateTracker {
	#lastTotal = 0;
	#lastTime = 0;
	#rate = 0;
	#hasSample = false;
	#pendingTokens = 0;

	/** Latest EMA-smoothed output-token rate. */
	get tokenRate(): number {
		return this.#rate;
	}

	sample(totalTokens: number, now: number): number {
		if (!this.#hasSample) {
			this.#lastTotal = totalTokens;
			this.#hasSample = true;
			this.#lastTime = now;
			return this.#rate;
		}

		const elapsedSeconds = (now - this.#lastTime) / 1_000;
		if (elapsedSeconds <= 0) {
			this.#pendingTokens += Math.max(0, totalTokens - this.#lastTotal);
			this.#lastTotal = totalTokens;
			return this.#rate;
		}

		const totalDelta =
			this.#pendingTokens + Math.max(0, totalTokens - this.#lastTotal);
		const instantRate = totalDelta / elapsedSeconds;
		this.#rate = EMA_ALPHA * instantRate + (1 - EMA_ALPHA) * this.#rate;
		this.#lastTotal = totalTokens;
		this.#lastTime = now;
		this.#pendingTokens = 0;
		return this.#rate;
	}

	reset(): void {
		this.#lastTotal = 0;
		this.#lastTime = 0;
		this.#rate = 0;
		this.#hasSample = false;
		this.#pendingTokens = 0;
	}
}

export interface RateHoldFadeOptions {
	/** Milliseconds a freshly measured rate stays at full colour. */
	holdMs: number;
	/** Milliseconds over which the held rate then fades out. */
	fadeMs: number;
	/** Discrete steps the fade is split into. */
	shadeCount: number;
	/** Minimum milliseconds between samples; a closer `sample()` call is a no-op. */
	sampleIntervalMs: number;
}

export type RatePhase = "active" | "fading" | "idle";

export interface RateDisplay {
	/** The held rate, rounded; `null` once the fade has finished or before any rate was seen. */
	rate: number | null;
	phase: RatePhase;
	/** Discrete fade step, `0` to `shadeCount - 1`; only meaningful while `phase` is `"fading"`. */
	fadeShade: number;
}

/**
 * Turns a cumulative token total into a token-rate readout that holds its last measurement,
 * fades it, then goes idle.
 *
 * Callers feed `sample(total, now)` from their own timer and read `display(now)` on any frame;
 * the clock is always the caller's, so nothing here schedules anything. A rate is held only
 * when the total grew since the previous sample, so the EMA decaying while output is quiet
 * does not re-arm the hold.
 */
export class RateHoldFade {
	/** The tracker behind the readout, for callers that also want the raw smoothed rate. */
	readonly tracker = new TokRateTracker();
	readonly #holdMs: number;
	readonly #fadeMs: number;
	readonly #shadeCount: number;
	readonly #sampleIntervalMs: number;
	// 0 is the "never sampled" sentinel: the first sample at any real clock time is due at once.
	#lastSampledAt = 0;
	#lastSampleTotal = 0;
	#heldRate: number | null = null;
	#fadeStartsAt = 0;

	constructor(options: RateHoldFadeOptions) {
		this.#holdMs = options.holdMs;
		this.#fadeMs = options.fadeMs;
		this.#shadeCount = options.shadeCount;
		this.#sampleIntervalMs = options.sampleIntervalMs;
	}

	/**
	 * Take a sample if `sampleIntervalMs` has passed since the last one.
	 * Returns whether a sample was taken, so a caller can push to a meter only then.
	 */
	sample(totalTokens: number, now: number): boolean {
		if (now - this.#lastSampledAt < this.#sampleIntervalMs) return false;
		// Do not reset the fade for an EMA-only decay while output is quiet.
		const hasNewTokens = totalTokens > this.#lastSampleTotal;
		this.#lastSampleTotal = totalTokens;
		this.tracker.sample(totalTokens, now);
		this.#lastSampledAt = now;
		const rounded = Math.round(this.tracker.tokenRate);
		if (rounded > 0 && hasNewTokens) {
			this.#heldRate = rounded;
			this.#fadeStartsAt = now + this.#holdMs;
		}
		return true;
	}

	/** Pure snapshot of the readout at `now`; safe to call on any frame. */
	display(now: number): RateDisplay {
		if (this.#heldRate !== null && now < this.#fadeStartsAt) {
			return { rate: this.#heldRate, phase: "active", fadeShade: 0 };
		}
		if (this.#heldRate !== null && now < this.#fadeStartsAt + this.#fadeMs) {
			return {
				rate: this.#heldRate,
				phase: "fading",
				fadeShade: fadeShade(
					now - this.#fadeStartsAt,
					this.#fadeMs,
					this.#shadeCount,
				),
			};
		}
		return { rate: null, phase: "idle", fadeShade: 0 };
	}

	/**
	 * Restart the EMA from `totalTokens` without touching the held rate or its fade. Call it when
	 * the total is corrected at a message boundary, so the correction does not read as a burst;
	 * the held rate bridges the gap until fresh samples rebuild the average.
	 */
	resetSampling(totalTokens: number): void {
		this.tracker.reset();
		this.#lastSampledAt = 0;
		this.#lastSampleTotal = totalTokens;
	}

	/** Forget everything, including the held rate. */
	reset(): void {
		this.tracker.reset();
		this.#lastSampledAt = 0;
		this.#lastSampleTotal = 0;
		this.#heldRate = null;
		this.#fadeStartsAt = 0;
	}
}
