import assert from "node:assert/strict";
import { test } from "node:test";
import { RateHoldFade, TokRateTracker } from "../src/activity/index.js";

test("TokRateTracker exposes the latest EMA rate and resets it", () => {
	const tracker = new TokRateTracker();
	const readOnly: { readonly tokenRate: number } = tracker;

	assert.equal(readOnly.tokenRate, 0);
	assert.equal(
		tracker.sample(0, 0),
		0,
		"the first sample only sets the baseline",
	);
	assert.equal(tracker.sample(3, 200), 6, "alpha 0.4 × 15 tps");
	assert.equal(readOnly.tokenRate, 6);
	assert.equal(tracker.sample(9, 400), 15.6);
	assert.equal(
		tracker.sample(20, 400),
		15.6,
		"a duplicate timestamp carries its tokens",
	);
	// The 11 pending tokens at the duplicate timestamp are included at 600 ms:
	// 0.4 × (11 / 0.2) + 0.6 × 15.6 = 31.36.
	assert.equal(tracker.sample(0, 600), 31.36);

	tracker.reset();
	assert.equal(readOnly.tokenRate, 0);
	assert.equal(tracker.sample(100, 2_000), 0);
});

// Mirrors pi-topping's lifecycle timeline (tests/lifecycle.test.ts, "token rate holds, fades,
// and resets to full brightness on updates"): hold 1500, fade 250 over 5 shades, 100 ms interval.
function pitopping(): RateHoldFade {
	return new RateHoldFade({
		holdMs: 1_500,
		fadeMs: 250,
		shadeCount: 5,
		sampleIntervalMs: 100,
	});
}

test("RateHoldFade replays pi-topping's hold and fade timeline", () => {
	const rate = pitopping();

	assert.equal(rate.sample(0, 1_000), true, "baseline");
	assert.deepEqual(rate.display(1_000), {
		rate: null,
		phase: "idle",
		fadeShade: 0,
	});

	assert.equal(rate.sample(2, 1_100), true);
	assert.equal(rate.tracker.tokenRate, 8, "0.4 × 20 tps");
	assert.deepEqual(rate.display(1_100), {
		rate: 8,
		phase: "active",
		fadeShade: 0,
	});

	// message_end with exact usage: restart the EMA, keep the held 8.
	rate.resetSampling(2);
	assert.equal(
		rate.sample(2, 1_350),
		true,
		"the sentinel makes the next sample due at once",
	);
	assert.deepEqual(rate.display(1_350), {
		rate: 8,
		phase: "active",
		fadeShade: 0,
	});

	// Second turn: five more words arrive.
	assert.equal(rate.sample(7, 1_450), true);
	assert.deepEqual(rate.display(1_450), {
		rate: 20,
		phase: "active",
		fadeShade: 0,
	});
	rate.resetSampling(7);

	// Held until 1450 + 1500 = 2950, then fades.
	assert.equal(rate.display(2_949).phase, "active");
	assert.deepEqual(rate.display(2_950), {
		rate: 20,
		phase: "fading",
		fadeShade: 0,
	});
	assert.deepEqual(rate.display(3_000), {
		rate: 20,
		phase: "fading",
		fadeShade: 1,
	});

	// A fresh burst re-arms the hold at full brightness.
	assert.equal(rate.sample(7, 2_949), true, "baseline after the reset");
	assert.equal(rate.sample(12, 3_049), true);
	assert.deepEqual(rate.display(3_049), {
		rate: 20,
		phase: "active",
		fadeShade: 0,
	});

	assert.deepEqual(rate.display(4_549), {
		rate: 20,
		phase: "fading",
		fadeShade: 0,
	});
	assert.deepEqual(rate.display(4_798), {
		rate: 20,
		phase: "fading",
		fadeShade: 4,
	});
	assert.deepEqual(rate.display(4_799), {
		rate: null,
		phase: "idle",
		fadeShade: 0,
	});
});

test("RateHoldFade at statusline's 500 ms fade profile", () => {
	const rate = new RateHoldFade({
		holdMs: 1_500,
		fadeMs: 500,
		shadeCount: 5,
		sampleIntervalMs: 100,
	});
	rate.sample(0, 1_000);
	rate.sample(5, 1_100);
	assert.equal(rate.tracker.tokenRate, 20, "0.4 × 50 tps");
	const startsAt = 1_100 + 1_500;

	assert.equal(rate.display(startsAt - 1).phase, "active");
	assert.deepEqual(rate.display(startsAt), {
		rate: 20,
		phase: "fading",
		fadeShade: 0,
	});
	assert.equal(rate.display(startsAt + 99).fadeShade, 0);
	assert.equal(rate.display(startsAt + 100).fadeShade, 1);
	assert.equal(rate.display(startsAt + 499).fadeShade, 4);
	assert.deepEqual(rate.display(startsAt + 500), {
		rate: null,
		phase: "idle",
		fadeShade: 0,
	});
});

test("the EMA decaying while output is quiet does not re-arm the hold", () => {
	const rate = pitopping();
	rate.sample(0, 1_000);
	rate.sample(5, 1_100);
	assert.equal(rate.display(1_100).rate, 20);

	// Output stops; the EMA is still above zero for several samples.
	rate.sample(5, 1_200);
	assert.ok(
		rate.tracker.tokenRate > 1,
		"the EMA has decayed but is still positive",
	);
	assert.equal(rate.display(2_599).phase, "active");
	rate.sample(5, 2_600);
	// The hold was armed at 1100, so it fades from 2600 regardless of the later samples.
	assert.deepEqual(rate.display(2_600), {
		rate: 20,
		phase: "fading",
		fadeShade: 0,
	});
});

test("a rate that rounds to zero is not held", () => {
	const rate = pitopping();
	rate.sample(0, 1_000);
	// One token in 10 s: 0.4 × 0.1 tps = 0.04, which rounds to 0.
	rate.sample(1, 11_000);
	assert.ok(
		rate.tracker.tokenRate > 0 && Math.round(rate.tracker.tokenRate) === 0,
	);
	assert.deepEqual(rate.display(11_000), {
		rate: null,
		phase: "idle",
		fadeShade: 0,
	});
});

test("resetSampling keeps the held rate and its fade, and restarts the EMA", () => {
	const rate = pitopping();
	rate.sample(0, 1_000);
	rate.sample(5, 1_100);
	const before = rate.display(1_100);

	rate.resetSampling(5);
	assert.equal(rate.tracker.tokenRate, 0);
	assert.deepEqual(rate.display(1_100), before);
	assert.equal(rate.display(2_599).phase, "active");
	assert.equal(rate.display(2_600).phase, "fading");
});

test("reset forgets the held rate", () => {
	const rate = pitopping();
	rate.sample(0, 1_000);
	rate.sample(5, 1_100);
	rate.reset();

	assert.deepEqual(rate.display(1_100), {
		rate: null,
		phase: "idle",
		fadeShade: 0,
	});
	assert.equal(rate.tracker.tokenRate, 0);
	assert.equal(
		rate.sample(0, 1_100),
		true,
		"reset clears the sample interval too",
	);
});

test("sample is a no-op inside the sample interval", () => {
	const rate = pitopping();
	assert.equal(rate.sample(0, 1_000), true);
	assert.equal(rate.sample(50, 1_099), false);
	assert.equal(
		rate.tracker.tokenRate,
		0,
		"the gated call did not reach the tracker",
	);
	assert.equal(rate.sample(2, 1_100), true, "the boundary is inclusive");
	assert.equal(
		rate.tracker.tokenRate,
		8,
		"the total jump of 50 was never seen",
	);
});
