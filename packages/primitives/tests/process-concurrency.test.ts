import assert from "node:assert/strict";
import { test } from "node:test";
import { mapWithConcurrencyLimit } from "../src/process/index.js";

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/** Run `n` items under `limit` and report the highest number in flight at once. */
async function peakFor(n: number, limit: number): Promise<number> {
	let running = 0;
	let peak = 0;
	await mapWithConcurrencyLimit(
		Array.from({ length: n }, (_, i) => i),
		limit,
		async () => {
			running++;
			peak = Math.max(peak, running);
			await sleep(5);
			running--;
		},
	);
	return peak;
}

// Moved from persona-audit's test/subprocess.test.ts, unchanged in body.
test("mapWithConcurrencyLimit preserves order and caps concurrency", async () => {
	let running = 0;
	let peak = 0;
	const items = [1, 2, 3, 4, 5, 6, 7, 8];
	const results = await mapWithConcurrencyLimit(items, 3, async (n) => {
		running++;
		peak = Math.max(peak, running);
		await new Promise((resolve) => setTimeout(resolve, 5));
		running--;
		return n * 2;
	});
	assert.deepEqual(results, [2, 4, 6, 8, 10, 12, 14, 16]);
	assert.ok(peak <= 3, `peak concurrency ${peak} exceeded limit`);
});

test("the peak reaches the limit, for 1, 3 and 8", async () => {
	assert.equal(await peakFor(12, 1), 1);
	assert.equal(await peakFor(12, 3), 3);
	assert.equal(await peakFor(12, 8), 8);
});

test("onStart fires once per index, in order, before the call", async () => {
	const events: string[] = [];
	await mapWithConcurrencyLimit(
		["a", "b", "c", "d"],
		2,
		async (item, index) => {
			events.push(`fn:${index}:${item}`);
			await sleep(5);
		},
		(index) => events.push(`start:${index}`),
	);
	const starts = events.filter((e) => e.startsWith("start:"));
	assert.deepEqual(starts, ["start:0", "start:1", "start:2", "start:3"]);
	for (let i = 0; i < 4; i++) {
		assert.ok(
			events.indexOf(`start:${i}`) <
				events.findIndex((e) => e.startsWith(`fn:${i}:`)),
			`start:${i} came after its call`,
		);
	}
});

test("results come back in input order even when later items finish first", async () => {
	const results = await mapWithConcurrencyLimit(
		[30, 1, 10],
		3,
		async (ms, i) => {
			await sleep(ms);
			return i;
		},
	);
	assert.deepEqual(results, [0, 1, 2]);
});

test("empty input gives an empty result and starts nothing", async () => {
	let started = false;
	const results = await mapWithConcurrencyLimit(
		[],
		4,
		async () => 1,
		() => {
			started = true;
		},
	);
	assert.deepEqual(results, []);
	assert.equal(started, false);
});

test("a limit above the length uses the length", async () => {
	assert.equal(await peakFor(3, 50), 3);
});

test("NaN, zero, negative, fractional and infinite limits all work", async () => {
	assert.equal(await peakFor(6, Number.NaN), 1);
	assert.equal(await peakFor(6, 0), 1);
	assert.equal(await peakFor(6, -3), 1);
	assert.equal(await peakFor(6, Number.NEGATIVE_INFINITY), 1);
	assert.equal(await peakFor(6, 2.9), 2);
	assert.equal(await peakFor(6, Number.POSITIVE_INFINITY), 6);
});

test("a rejection rejects the call while the other workers drain", async () => {
	const seen: number[] = [];
	await assert.rejects(
		mapWithConcurrencyLimit([0, 1, 2, 3], 2, async (n) => {
			await sleep(5);
			seen.push(n);
			if (n === 0) throw new Error("boom");
		}),
		/boom/,
	);
	await sleep(80);
	assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
});

test("a readonly input is accepted", async () => {
	const items: readonly number[] = Object.freeze([1, 2, 3]);
	assert.deepEqual(
		await mapWithConcurrencyLimit(items, 2, async (n) => n + 1),
		[2, 3, 4],
	);
});
