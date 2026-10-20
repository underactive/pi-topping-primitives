import assert from "node:assert/strict";
import { test } from "node:test";
import {
	formatCostUsd,
	formatCount,
	formatDurationCompact,
	formatPercent,
} from "../src/text/index.js";
import {
	decodeNumber,
	type EncodedNumber,
	readFixture,
} from "./phase6-fixtures.js";

interface FormatFixture {
	duration: { ms: EncodedNumber; output: string }[];
	count: { n: EncodedNumber; output: string }[];
	percent: {
		fraction: EncodedNumber;
		decimals: number;
		output: string;
	}[];
	percentDefault: { fraction: EncodedNumber; output: string }[];
	cost: { costUsd: EncodedNumber; output: string }[];
}

// Captured from routesense's src/format.ts (duration, count, percent) and persona-audit's
// AuditProgress.ts formatCost (cost) before either was edited. moa-fusion's agentStatus.ts
// copy agreed with persona-audit's on every cost input.
const fixture = readFixture<FormatFixture>("format");

test("formatDurationCompact reproduces routesense's formatDuration over the captured values", () => {
	assert.ok(fixture.duration.length >= 10);
	for (const { ms, output } of fixture.duration) {
		assert.equal(
			formatDurationCompact(decodeNumber(ms) as number),
			output,
			String(ms),
		);
	}
});

test("formatCount reproduces routesense's formatCount over the captured values", () => {
	for (const { n, output } of fixture.count) {
		assert.equal(formatCount(decodeNumber(n) as number), output, String(n));
	}
});

test("formatPercent reproduces routesense's formatPercent over the captured values", () => {
	for (const { fraction, decimals, output } of fixture.percent) {
		assert.equal(
			formatPercent(decodeNumber(fraction) as number, decimals),
			output,
			`${fraction} @ ${decimals}`,
		);
	}
	for (const { fraction, output } of fixture.percentDefault) {
		assert.equal(
			formatPercent(decodeNumber(fraction) as number),
			output,
			String(fraction),
		);
	}
});

test("formatCostUsd reproduces persona-audit's and moa-fusion's formatCost over the captured values", () => {
	assert.ok(fixture.cost.length >= 10);
	for (const { costUsd, output } of fixture.cost) {
		assert.equal(formatCostUsd(decodeNumber(costUsd)), output, String(costUsd));
	}
});

test("formatDurationCompact moves up a unit at the rounded boundary, never printing 1000ms or 60.0s", () => {
	// routesense test/format.test.ts
	assert.equal(formatDurationCompact(999.6), "1.0s");
	assert.equal(formatDurationCompact(59_950), "1m00s");
	assert.equal(formatDurationCompact(65_000), "1m05s");
	assert.equal(formatDurationCompact(842), "842ms");
	assert.equal(formatDurationCompact(3_200), "3.2s");
	assert.equal(formatDurationCompact(999.4), "999ms");
	assert.equal(formatDurationCompact(59_949), "59.9s");
});

test("formatDurationCompact keeps counting minutes past an hour", () => {
	assert.equal(formatDurationCompact(3_600_000), "60m00s");
	assert.equal(formatDurationCompact(3_725_000), "62m05s");
});

test("formatCount groups thousands with commas", () => {
	assert.equal(formatCount(0), "0");
	assert.equal(formatCount(999), "999");
	assert.equal(formatCount(1_000), "1,000");
	assert.equal(formatCount(1_234_567), "1,234,567");
	assert.equal(formatCount(-12_345), "-12,345");
});

test("formatPercent scales a fraction and takes its decimals", () => {
	assert.equal(formatPercent(0.6789, 1), "67.9%");
	assert.equal(formatPercent(0.5), "50%");
	assert.equal(formatPercent(1), "100%");
	assert.equal(formatPercent(0), "0%");
	assert.equal(formatPercent(0.004, 2), "0.40%");
});

// persona-audit test/auditProgress.test.ts and moa-fusion test/moa-progress-widget.test.mjs
test("formatCostUsd uses fixed precision, clamps negatives and dashes unknown or invalid values", () => {
	assert.equal(formatCostUsd(undefined), "—");
	assert.equal(formatCostUsd(Number.NaN), "—");
	assert.equal(formatCostUsd(Number.POSITIVE_INFINITY), "—");
	assert.equal(formatCostUsd(Number.NEGATIVE_INFINITY), "—");
	assert.equal(formatCostUsd(0), "$0.000");
	assert.equal(formatCostUsd(0.1234), "$0.123");
	assert.equal(formatCostUsd(-1), "$0.000");
});

test("formatCostUsd tells a zero-cost model from an unknown one", () => {
	assert.notEqual(formatCostUsd(0), formatCostUsd(undefined));
	assert.equal(formatCostUsd(12.3456), "$12.346");
	assert.equal(formatCostUsd(-0), "$0.000");
});
