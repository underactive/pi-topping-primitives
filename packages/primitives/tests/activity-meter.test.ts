import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ACTIVITY_METER_WIDTH,
	ActivityMeter,
	ActivityMeterLevel,
	DEFAULT_METER_UPPER_BOUND_TPS,
	LEGACY_METER_UPPER_BOUND_TPS,
	METER_GLYPHS,
	METER_UPPER_BOUND_TPS_MAX,
	METER_UPPER_BOUND_TPS_MIN,
	rateToLevel,
} from "../src/activity/index.js";

test("the bound constants are the documented ones", () => {
	assert.equal(ACTIVITY_METER_WIDTH, 8);
	assert.equal(DEFAULT_METER_UPPER_BOUND_TPS, 80);
	assert.equal(LEGACY_METER_UPPER_BOUND_TPS, 40);
	assert.equal(METER_UPPER_BOUND_TPS_MIN, 10);
	assert.equal(METER_UPPER_BOUND_TPS_MAX, 1_000);
});

test("every level has a distinct glyph and the ramp is frozen", () => {
	const glyphs = Object.values(ActivityMeterLevel).map(
		(level) => METER_GLYPHS[level],
	);
	assert.equal(new Set(glyphs).size, 8);
	assert.ok(Object.isFrozen(METER_GLYPHS));
	assert.ok(Object.isFrozen(ActivityMeterLevel));
});

test("rateToLevel keeps the legacy token-rate boundaries at a 40 tps bound", () => {
	assert.equal(rateToLevel(0, 40), 0);
	assert.equal(rateToLevel(1, 40), 1);
	assert.equal(rateToLevel(5, 40), 1);
	assert.equal(rateToLevel(5.1, 40), 2);
	assert.equal(rateToLevel(10, 40), 2);
	assert.equal(rateToLevel(10.1, 40), 3);
	assert.equal(rateToLevel(15, 40), 3);
	assert.equal(rateToLevel(15.1, 40), 4);
	assert.equal(rateToLevel(22, 40), 4);
	assert.equal(rateToLevel(22.1, 40), 5);
	assert.equal(rateToLevel(30, 40), 5);
	assert.equal(rateToLevel(30.1, 40), 6);
	// Full scale is inclusive, so exactly 40 tps is full rather than PEAK_3.
	assert.equal(rateToLevel(39.9, 40), 6);
	assert.equal(rateToLevel(40, 40), 7);
	assert.equal(rateToLevel(40.1, 40), 7);
});

test("rateToLevel scales its boundaries to the default 80 tps bound", () => {
	for (const [rate, level] of [
		[0, 0],
		[10, 1],
		[10.1, 2],
		[20, 2],
		[20.1, 3],
		[30, 3],
		[30.1, 4],
		[44, 4],
		[44.1, 5],
		[60, 5],
		[60.1, 6],
		[79.9, 6],
		[80, 7],
	] as const) {
		assert.equal(rateToLevel(rate), level, `${rate} tps`);
	}
});

test("the default ceiling is 80 tps and LEGACY_METER_UPPER_BOUND_TPS restores the 40 tps scale", () => {
	// Halfway up the default scale is only PEAK_1; the same rate saturates the legacy scale.
	assert.equal(rateToLevel(40), ActivityMeterLevel.PEAK_1);
	assert.equal(
		rateToLevel(40, LEGACY_METER_UPPER_BOUND_TPS),
		ActivityMeterLevel.FULL,
	);
});

test("rateToLevel honors the minimum and maximum bounds", () => {
	assert.equal(rateToLevel(10, 10), 7);
	assert.equal(rateToLevel(9.9, 10), 6);
	assert.equal(rateToLevel(1_000, 1_000), 7);
	assert.equal(rateToLevel(999, 1_000), 6);
	assert.equal(rateToLevel(750, 1_000), 5);
});

test("rateToLevel clamps at or above the bound; by default NaN and negatives read idle", () => {
	for (const bound of [10, 80, 1_000]) {
		for (const rate of [bound, bound * 1.5, 1e9, Infinity]) {
			assert.equal(
				rateToLevel(rate, bound),
				7,
				`${rate} tps at bound ${bound}`,
			);
		}
		assert.equal(rateToLevel(Number.NaN, bound), 0);
		assert.equal(rateToLevel(-1, bound), 0);
	}
});

test('nonFiniteRate: "idle" reads NaN and both infinities as idle and leaves finite rates alone', () => {
	const options = { nonFiniteRate: "idle" } as const;
	for (const rate of [
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
	]) {
		assert.equal(rateToLevel(rate, 80, options), ActivityMeterLevel.IDLE);
	}
	assert.equal(rateToLevel(80, 80, options), ActivityMeterLevel.FULL);
	assert.equal(rateToLevel(44.1, 80, options), 5);
	assert.equal(rateToLevel(Number.POSITIVE_INFINITY), ActivityMeterLevel.FULL);
});

test("rateToLevel never decreases as the rate rises and stays below full under the bound", () => {
	for (const bound of [10, 80, 1_000]) {
		let previous = 0;
		for (let rate = 0; rate <= bound * 2; rate += 0.5) {
			const level = rateToLevel(rate, bound);
			assert.ok(
				level >= previous,
				`${rate} tps at bound ${bound} dropped from ${previous} to ${level}`,
			);
			assert.ok(level >= 0 && level <= 7);
			if (rate < bound) {
				assert.ok(level < 7, `${rate} tps at bound ${bound} is full below it`);
			}
			previous = level;
		}
	}
});

test("ActivityMeter renders clamped rates as full columns", () => {
	const meter = new ActivityMeter();
	for (let i = 0; i < 8; i++) meter.push(rateToLevel(5_000, 10));
	assert.equal(meter.render(), "⣿⣿⣿⣿⣿⣿⣿⣿");
});

test("ActivityMeter renders and scrolls activity levels", () => {
	const meter = new ActivityMeter();

	assert.equal(meter.render(), "⢀⢀⢀⢀⢀⢀⢀⢀");
	for (let i = 0; i < 8; i++) meter.push(3);
	assert.equal(meter.render(), "⣤⣤⣤⣤⣤⣤⣤⣤");
	for (let i = 0; i < 8; i++) meter.push(7);
	assert.equal(meter.render(), "⣿⣿⣿⣿⣿⣿⣿⣿");

	meter.reset();
	for (let i = 0; i < 8; i++) meter.push(0);
	for (let i = 0; i < 3; i++) meter.push(4);
	assert.equal(meter.render(), "⣴⣴⣴⢀⢀⢀⢀⢀");
});

test("ltr puts the newest cell on the left and rtl on the right", () => {
	const ltr = new ActivityMeter();
	const rtl = new ActivityMeter({ direction: "rtl" });
	ltr.push(ActivityMeterLevel.FULL);
	rtl.push(ActivityMeterLevel.FULL);
	assert.equal(ltr.render(), "⣿⢀⢀⢀⢀⢀⢀⢀");
	assert.equal(rtl.render(), "⢀⢀⢀⢀⢀⢀⢀⣿");
});

test("setDirection reverses the existing trace so the flow flips at once", () => {
	const meter = new ActivityMeter();
	meter.push(ActivityMeterLevel.FULL);
	meter.push(ActivityMeterLevel.LOW);
	assert.equal(meter.render(), "⣀⣿⢀⢀⢀⢀⢀⢀");
	meter.setDirection("rtl");
	assert.equal(meter.render(), "⢀⢀⢀⢀⢀⢀⣿⣀");
	meter.setDirection("rtl");
	assert.equal(meter.render(), "⢀⢀⢀⢀⢀⢀⣿⣀", "the same direction is a no-op");
	meter.push(ActivityMeterLevel.MEDIUM);
	assert.equal(meter.render(), "⢀⢀⢀⢀⢀⣿⣀⣠");
});

test("render hands each cell its level and glyph to the colorizer", () => {
	const meter = new ActivityMeter({ width: 2 });
	meter.push(ActivityMeterLevel.HIGH);
	assert.equal(
		meter.render((level, glyph) => `[${level}${glyph}]`),
		"[3⣤][0⢀]",
	);
});

test("width follows the option and falls back for anything but a positive integer", () => {
	assert.equal(new ActivityMeter().width, 8);
	assert.equal(new ActivityMeter({ width: 3 }).width, 3);
	for (const width of [0, -2, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
		assert.equal(new ActivityMeter({ width }).width, 8, `${width}`);
	}
	const narrow = new ActivityMeter({ width: 3 });
	for (let i = 0; i < 5; i++) narrow.push(ActivityMeterLevel.LOW);
	assert.equal(narrow.render(), "⣀⣀⣀");
});

test("levels() snapshots a copy and setLevels() restores it", () => {
	const meter = new ActivityMeter({ direction: "rtl" });
	const trace = [1, 2, 3, 4, 5, 6, 7, 0] as const;
	for (const level of trace) meter.push(level);
	const snapshot = meter.levels();
	assert.deepEqual(snapshot, [1, 2, 3, 4, 5, 6, 7, 0]);

	snapshot[0] = 7;
	assert.deepEqual(meter.levels(), [1, 2, 3, 4, 5, 6, 7, 0], "a copy");

	const restored = new ActivityMeter({ direction: "rtl" });
	restored.setLevels(meter.levels());
	assert.equal(restored.render(), meter.render());
});

test("setLevels pads short input, trims long input and idles anything invalid", () => {
	const meter = new ActivityMeter();
	meter.setLevels([7, 7]);
	assert.deepEqual(meter.levels(), [7, 7, 0, 0, 0, 0, 0, 0]);

	meter.setLevels([1, 1, 1, 1, 1, 1, 1, 1, 7, 7]);
	assert.deepEqual(meter.levels(), [1, 1, 1, 1, 1, 1, 1, 1]);

	meter.setLevels([-1, 8, 2.5, Number.NaN, Number.POSITIVE_INFINITY, 3]);
	assert.deepEqual(meter.levels(), [0, 0, 0, 0, 0, 3, 0, 0]);

	const small = new ActivityMeter({ width: 2 });
	small.setLevels([4, 5, 6]);
	assert.deepEqual(small.levels(), [4, 5]);
});

test("reset clears the trace", () => {
	const meter = new ActivityMeter();
	meter.push(ActivityMeterLevel.FULL);
	meter.reset();
	assert.equal(meter.render(), "⢀⢀⢀⢀⢀⢀⢀⢀");
});
