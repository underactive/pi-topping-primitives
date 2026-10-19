import assert from "node:assert/strict";
import { cpSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as first from "@underactive/pi-topping-primitives/activity";
import {
	ActivityMeter,
	ActivityMeterLevel,
	formatElapsedUnits,
	OutputTokenAccount,
	RateHoldFade,
	rateToLevel,
} from "@underactive/pi-topping-primitives/activity";

test("compiled meter pushes, scrolls and renders", () => {
	const meter = new ActivityMeter({ direction: "rtl" });
	meter.push(rateToLevel(80));
	meter.push(rateToLevel(0));
	assert.equal(meter.render(), "⢀⢀⢀⢀⢀⢀⣿⢀");
	assert.equal(ActivityMeterLevel.FULL, 7);
});

test("compiled rate hold fades and goes idle", () => {
	const rate = new RateHoldFade({
		holdMs: 1_500,
		fadeMs: 250,
		shadeCount: 5,
		sampleIntervalMs: 100,
	});
	rate.sample(0, 1_000);
	assert.equal(rate.sample(2, 1_100), true);
	assert.deepEqual(rate.display(1_100), {
		rate: 8,
		phase: "active",
		fadeShade: 0,
	});
	assert.deepEqual(rate.display(2_600), {
		rate: 8,
		phase: "fading",
		fadeShade: 0,
	});
	assert.deepEqual(rate.display(2_850), {
		rate: null,
		phase: "idle",
		fadeShade: 0,
	});
});

test("compiled output account and elapsed formatters work", () => {
	const account = new OutputTokenAccount();
	account.messageStart({ role: "assistant" });
	account.messageUpdate({ type: "text_delta", delta: "one two " });
	assert.deepEqual(account.snapshot(), { tokens: 2, revision: 0 });
	assert.equal(formatElapsedUnits(286_000), "4m 46s");
});

test("an independent copy of the module interoperates through plain data", async () => {
	// A full copy of dist/activity (not a ?copy query on the barrel, which would share the
	// sibling modules) gives a second module graph with its own class bindings. It keeps the
	// relative `../contracts` import valid because the copy is a sibling of dist/contracts.
	const distDir = dirname(
		fileURLToPath(
			import.meta.resolve("@underactive/pi-topping-primitives/activity"),
		),
	);
	const copyDir = join(dirname(distDir), `activity-copy-${process.pid}`);
	try {
		cpSync(distDir, copyDir, { recursive: true });
		const second = (await import(
			pathToFileURL(join(copyDir, "index.js")).href
		)) as typeof first;
		assert.notStrictEqual(second.ActivityMeter, first.ActivityMeter);
		assert.notStrictEqual(second.RateHoldFade, first.RateHoldFade);

		// A trace captured from one copy restores into the other: levels are plain numbers, and
		// nothing checks a prototype across the boundary.
		const a = new first.ActivityMeter({ direction: "rtl" });
		for (const level of [1, 3, 5, 7] as const) a.push(level);
		const b = new second.ActivityMeter({ direction: "rtl" });
		b.setLevels(a.levels());
		assert.equal(b.render(), a.render());

		// Two readouts from the two copies, fed the same samples, agree.
		const options = {
			holdMs: 1_500,
			fadeMs: 250,
			shadeCount: 5,
			sampleIntervalMs: 100,
		};
		const x = new first.RateHoldFade(options);
		const y = new second.RateHoldFade(options);
		for (const [total, now] of [
			[0, 1_000],
			[5, 1_100],
			[9, 1_200],
		] as const) {
			x.sample(total, now);
			y.sample(total, now);
		}
		assert.deepEqual(x.display(1_200), y.display(1_200));
	} finally {
		rmSync(copyDir, { recursive: true, force: true });
	}
});
