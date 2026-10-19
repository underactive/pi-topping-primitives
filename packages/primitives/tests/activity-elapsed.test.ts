import assert from "node:assert/strict";
import { test } from "node:test";
import {
	formatElapsedClock,
	formatElapsedUnits,
} from "../src/activity/index.js";

test("formatElapsedUnits clamps negatives and pads nothing", () => {
	assert.equal(formatElapsedUnits(-1), "0s");
	assert.equal(formatElapsedUnits(286_000), "4m 46s");
});

test("formatElapsedUnits skips leading zero units", () => {
	assert.equal(formatElapsedUnits(0), "0s");
	assert.equal(formatElapsedUnits(30_000), "30s");
	assert.equal(formatElapsedUnits(59_000), "59s");
	assert.equal(formatElapsedUnits(60_000), "1m 0s");
	assert.equal(formatElapsedUnits(3_600_000), "1h 0s");
	assert.equal(formatElapsedUnits(86_400_000), "1d 0s");
	assert.equal(formatElapsedUnits(90_061_000), "1d 1h 1m 1s");
});

test("includeDays: false keeps counting hours", () => {
	assert.equal(
		formatElapsedUnits(90_000_000, { includeDays: false }),
		"25h 0s",
	);
	assert.equal(
		formatElapsedUnits(3_723_000, { includeDays: false }),
		"1h 2m 3s",
	);
});

test("fillLowerUnits keeps every unit below the largest shown", () => {
	assert.equal(
		formatElapsedUnits(3_600_000, { fillLowerUnits: true }),
		"1h 0m 0s",
	);
	assert.equal(
		formatElapsedUnits(86_400_000, { fillLowerUnits: true }),
		"1d 0h 0m 0s",
	);
	assert.equal(formatElapsedUnits(60_000, { fillLowerUnits: true }), "1m 0s");
	assert.equal(formatElapsedUnits(7_000, { fillLowerUnits: true }), "7s");
});

test("sensei's three adaptations come from the two options", () => {
	const sensei = { includeDays: false, fillLowerUnits: true } as const;
	assert.equal(formatElapsedUnits(3_600_000, sensei), "1h 0m 0s");
	assert.equal(formatElapsedUnits(3_723_000, sensei), "1h 2m 3s");
	assert.equal(formatElapsedUnits(90_000_000, sensei), "25h 0m 0s");
	assert.equal(formatElapsedUnits(125_000, sensei), "2m 5s");
	assert.equal(formatElapsedUnits(9_000, sensei), "9s");
});

test("formatElapsedClock reads M:SS and keeps counting minutes past an hour", () => {
	assert.equal(formatElapsedClock(0), "0:00");
	assert.equal(formatElapsedClock(-5_000), "0:00");
	assert.equal(formatElapsedClock(9_000), "0:09");
	assert.equal(formatElapsedClock(61_000), "1:01");
	assert.equal(formatElapsedClock(3_723_000), "62:03");
});
