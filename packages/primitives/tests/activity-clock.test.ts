import assert from "node:assert/strict";
import { test } from "node:test";
import {
	bindUIPromptWaits,
	MIN_WAIT_DISPLAY_MS,
	RunClock,
} from "../src/activity/index.js";

// RunClock takes an injected `now` (defaulting to Date.now) so its readings can be driven
// deterministically here. Contract points: start()/stop() are idempotent (first call wins);
// pause() is idempotent and keeps the earliest wait span open; resume() is inert with no open
// wait; activeMs()/waitingMs() are live until stop() pins them to [startedAt, endedAt];
// workedBetween(from, to) clips wait spans to an arbitrary window and never goes negative.

function clockAt(options: { nested?: boolean } = {}) {
	const time = { now: 0 };
	const clock = new RunClock({ now: () => time.now, ...options });
	return { time, clock };
}

test("MIN_WAIT_DISPLAY_MS is one second", () => {
	assert.equal(MIN_WAIT_DISPLAY_MS, 1_000);
});

test("reports no readings before start(), and pause() alone is a no-op", () => {
	const { time, clock } = clockAt();

	assert.equal(clock.activeMs(), 0);
	assert.equal(clock.waitingMs(), 0);

	time.now = 5_000;
	assert.doesNotThrow(() => clock.pause());
	assert.equal(
		clock.activeMs(),
		0,
		"still unstarted, so there is nothing to measure",
	);
	assert.equal(clock.waitingMs(), 0);
});

test("the default clock reads Date.now", () => {
	const clock = new RunClock();
	clock.start();
	assert.ok(clock.activeMs() >= 0 && clock.activeMs() < 1_000);
});

test("accrues 10s of work, 60s of pause, then 5s more work after resume", () => {
	const { time, clock } = clockAt();

	clock.start();
	time.now = 10_000;
	clock.pause();
	time.now = 70_000;
	clock.resume();
	time.now = 75_000;

	assert.equal(clock.activeMs(), 15_000, "10s + 5s of active work");
	assert.equal(clock.waitingMs(), 60_000);
});

test("an open pause excludes active time from activeMs while waitingMs grows live", () => {
	const { time, clock } = clockAt();

	clock.start();
	time.now = 10_000;
	clock.pause();
	time.now = 40_000;

	assert.equal(
		clock.activeMs(),
		10_000,
		"active time is frozen for the duration of an open pause",
	);
	assert.equal(
		clock.waitingMs(),
		30_000,
		"the open pause keeps growing as now advances",
	);
});

test("repeated pause() is idempotent and preserves the earliest wait span's start", () => {
	const { time, clock } = clockAt();

	clock.start();
	time.now = 10_000;
	clock.pause();
	time.now = 20_000;
	clock.pause();
	assert.equal(clock.waitingMs(), 10_000);

	time.now = 30_000;
	clock.pause();
	assert.equal(
		clock.waitingMs(),
		20_000,
		"waitingMs is measured from the first pause() call",
	);

	clock.resume();
	assert.equal(clock.waitingMs(), 20_000, "one resume() ends the single span");
});

test("resume() is inert when there is no open pause, both before start() and while working", () => {
	const { time, clock } = clockAt();

	assert.doesNotThrow(() => clock.resume());
	assert.equal(clock.activeMs(), 0);

	clock.start();
	time.now = 10_000;
	clock.resume();
	assert.equal(clock.activeMs(), 10_000);
	assert.equal(clock.waitingMs(), 0);
});

test("stop() pins activeMs()/waitingMs() to the run window", () => {
	const { time, clock } = clockAt();

	clock.start();
	time.now = 10_000;
	clock.stop();

	assert.equal(clock.activeMs(), 10_000);
	assert.equal(clock.waitingMs(), 0);

	time.now = 100_000;
	assert.equal(clock.activeMs(), 10_000);
	assert.equal(clock.waitingMs(), 0);

	clock.stop();
	assert.equal(clock.activeMs(), 10_000, "the first stop() already won");
});

test("start() is idempotent: the first call wins", () => {
	const { time, clock } = clockAt();
	time.now = 1_000;
	clock.start();
	time.now = 5_000;
	clock.start();
	assert.equal(clock.activeMs(), 4_000);
});

test("workedBetween clips wait spans to the query window and never returns a negative value", () => {
	const { time, clock } = clockAt();

	clock.start();
	time.now = 10_000;
	clock.pause();
	time.now = 60_000;
	clock.resume();
	time.now = 75_000;
	clock.stop();

	assert.equal(
		clock.workedBetween(0, 75_000),
		25_000,
		"75s window minus the 50s pause",
	);
	assert.equal(
		clock.workedBetween(5_000, 65_000),
		10_000,
		"the pause is clipped to the window (5s + 5s)",
	);
	assert.equal(clock.workedBetween(20_000, 30_000), 0);
	assert.equal(clock.workedBetween(60_000, 75_000), 15_000);
	assert.equal(
		clock.workedBetween(65_000, 5_000),
		0,
		"a reversed window never goes negative",
	);
	assert.equal(clock.workedBetween(100, 100), 0);
});

test("workedBetween treats an open wait as growing until stop() pins its end", () => {
	const { time, clock } = clockAt();

	clock.start();
	time.now = 10_000;
	clock.pause();
	time.now = 20_000;

	assert.equal(clock.workedBetween(10_000, 20_000), 0);

	time.now = 30_000;
	clock.stop();

	time.now = 100_000;
	assert.equal(
		clock.workedBetween(10_000, 100_000),
		70_000,
		"past endedAt the open wait's end is pinned there, so later time counts as worked",
	);
});

// ── nested: true ────────────────────────────────────────────────────────────

test("nested: overlapping pauses form one span that closes with the outermost resume", () => {
	const { time, clock } = clockAt({ nested: true });

	clock.start();
	time.now = 10_000;
	clock.pause(); // owner A
	time.now = 20_000;
	clock.pause(); // owner B, inside A
	time.now = 30_000;
	clock.resume(); // B done; A still waiting
	assert.equal(clock.waitingMs(), 20_000, "the span is still open and growing");

	time.now = 40_000;
	assert.equal(clock.waitingMs(), 30_000);
	clock.resume(); // A done
	time.now = 50_000;

	assert.equal(clock.waitingMs(), 30_000, "closed at 40s");
	assert.equal(clock.activeMs(), 20_000, "10s before and 10s after the wait");
});

test("nested: a stray resume() is inert and does not drive the depth negative", () => {
	const { time, clock } = clockAt({ nested: true });

	clock.start();
	time.now = 10_000;
	clock.resume();
	clock.resume();
	clock.pause();
	time.now = 20_000;
	assert.equal(
		clock.waitingMs(),
		10_000,
		"one pause is one level, not cancelled by the earlier strays",
	);
	clock.resume();
	time.now = 30_000;
	assert.equal(clock.waitingMs(), 10_000);
});

test("nested: sequential waits are separate spans", () => {
	const { time, clock } = clockAt({ nested: true });

	clock.start();
	time.now = 10_000;
	clock.pause();
	time.now = 15_000;
	clock.resume();
	time.now = 25_000;
	clock.pause();
	time.now = 30_000;
	clock.resume();

	assert.equal(clock.waitingMs(), 10_000);
	assert.equal(clock.workedBetween(10_000, 30_000), 10_000);
});

test("non-nested: a second pause() followed by one resume() ends the wait, unlike nested", () => {
	const flat = clockAt();
	const nested = clockAt({ nested: true });
	for (const { time, clock } of [flat, nested]) {
		clock.start();
		time.now = 10_000;
		clock.pause();
		clock.pause();
		time.now = 20_000;
		clock.resume();
		time.now = 30_000;
	}
	assert.equal(flat.clock.waitingMs(), 10_000);
	assert.equal(nested.clock.waitingMs(), 20_000);
});

// ── bindUIPromptWaits ───────────────────────────────────────────────────────

/** A structural stand-in for pi.on(), capturing handlers by event name. */
function fakePi() {
	const handlers = new Map<string, () => void>();
	return {
		handlers,
		on(event: string, handler: () => void) {
			handlers.set(event, handler);
		},
	};
}

test("bindUIPromptWaits drives whatever clock the accessor currently returns", () => {
	const time = { now: 0 };
	const current: { clock: RunClock | undefined } = { clock: undefined };
	const pi = fakePi();

	// The package types `on` as pi's overloaded method; the stub only needs to capture it.
	bindUIPromptWaits(
		pi as unknown as Parameters<typeof bindUIPromptWaits>[0],
		() => current.clock,
	);

	assert.equal(pi.handlers.size, 2);
	const onStart = pi.handlers.get("ui_prompt_start");
	const onEnd = pi.handlers.get("ui_prompt_end");
	assert.ok(onStart && onEnd, "both lifecycle handlers are registered");

	// While idle the accessor resolves to undefined: firing either event is a no-op.
	assert.doesNotThrow(() => onStart());
	assert.doesNotThrow(() => onEnd());

	const clock = new RunClock({ now: () => time.now });
	clock.start();
	current.clock = clock;
	time.now = 5_000;

	onStart();
	time.now = 8_000;
	assert.equal(clock.waitingMs(), 3_000, "ui_prompt_start paused the clock");

	onEnd();
	time.now = 9_000;
	assert.equal(clock.waitingMs(), 3_000, "ui_prompt_end resumed it");

	current.clock = undefined;
	assert.doesNotThrow(() => onStart());
	assert.doesNotThrow(() => onEnd());
});
