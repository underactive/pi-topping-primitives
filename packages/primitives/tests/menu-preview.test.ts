// The preview slot: sampled synchronously inside render, given the full inner width with
// no margin, and refreshed on its own timer. Ported from pi-topping's timer cases.
import assert from "node:assert/strict";
import { type TestContext, test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { MenuValue } from "../src/menu/types.js";
import { fakeTui, KEY, makeMenu, plain, press } from "./menu-harness.js";

test("the preview renders above the sections with the draft values and the row under the cursor", async () => {
	const calls: {
		values: Record<string, MenuValue>;
		activeItemId: string | undefined;
		elapsedMs: number;
	}[] = [];
	const { menu } = makeMenu({
		preview: {
			render: (values, state) => {
				calls.push({
					values: { ...values },
					activeItemId: state.activeItemId,
					elapsedMs: state.elapsedMs,
				});
				return {
					lines: [
						`preview: a=${String(values.a)} active=${String(state.activeItemId)}`,
					],
				};
			},
		},
	});
	const lines = plain(menu);
	assert.ok(lines[1]?.includes("╟─ Preview ─"));
	assert.ok(lines.some((line) => line.includes("preview: a=true active=a")));
	assert.equal(calls.length, 1);
	assert.ok((calls[0]?.elapsedMs ?? -1) >= 0);
	await press(menu, KEY.space, KEY.down);
	assert.ok(
		plain(menu).some((line) => line.includes("preview: a=false active=b")),
	);
	assert.equal(calls.length, 2);
	assert.ok(
		!makeMenu()
			.menu.render(64)
			.some((line) => line.includes("Preview")),
	);
});

test("the preview receives the full inner width and the menu adds no margin", () => {
	const widths: number[] = [];
	const { menu } = makeMenu({
		preview: {
			render: (_values, state) => {
				widths.push(state.width);
				return {
					lines: [
						"X",
						"a very long simulated working message that could overflow the box width easily",
					],
				};
			},
		},
	});
	for (const width of [64, 40]) {
		const lines = menu.render(width);
		assert.equal(widths.at(-1), width - 2);
		const text = plain(menu, width);
		const divider = text.findIndex((line) => line.includes("╟─ Preview ─"));
		assert.match(
			text[divider + 1] ?? "",
			/^║\s+║$/,
			"a blank row sits under the divider",
		);
		assert.equal(
			text[divider + 2]?.slice(0, 2),
			"║X",
			"content starts right after the border",
		);
		for (const line of lines) assert.equal(visibleWidth(line), width);
	}
});

test("the preview is sampled synchronously, exactly once per render", () => {
	let calls = 0;
	const { menu } = makeMenu({
		preview: {
			render: () => {
				calls++;
				return { lines: ["static"] };
			},
		},
	});
	menu.render(64);
	assert.equal(calls, 1);
	menu.render(64);
	assert.equal(calls, 1, "a cached render does not re-sample");
	menu.invalidate();
	menu.render(64);
	assert.equal(calls, 2);
	menu.render(70);
	assert.equal(calls, 3, "a new width re-samples");
});

interface Timers {
	delays: number[];
	cleared: unknown[];
	callbacks: (() => void)[];
}

function mockTimers(t: TestContext): Timers {
	const timers: Timers = { delays: [], cleared: [], callbacks: [] };
	t.mock.method(globalThis, "setTimeout", ((
		callback: () => void,
		delay?: number,
	) => {
		timers.delays.push(delay ?? 0);
		timers.callbacks.push(callback);
		return 99 as unknown as NodeJS.Timeout;
	}) as unknown as typeof setTimeout);
	t.mock.method(globalThis, "clearTimeout", ((handle: unknown) => {
		timers.cleared.push(handle);
	}) as typeof clearTimeout);
	return timers;
}

test("nextRefreshInMs schedules a re-render that invalidates and asks the host to render", (t) => {
	const timers = mockTimers(t);
	const tui = fakeTui(24);
	const { menu } = makeMenu(
		{
			preview: {
				render: () => ({ lines: ["animated"], nextRefreshInMs: 100 }),
			},
		},
		{ tui },
	);
	assert.deepEqual(
		timers.delays,
		[],
		"nothing is scheduled before the first render",
	);
	menu.render(64);
	assert.deepEqual(timers.delays, [100]);
	timers.callbacks[0]?.();
	assert.equal(tui.renders, 1);
	menu.render(64);
	assert.deepEqual(
		timers.delays,
		[100, 100],
		"the next render schedules the next tick",
	);
	menu.dispose();
	assert.deepEqual(timers.cleared, [99]);
	menu.dispose();
	assert.deepEqual(timers.cleared, [99], "a second dispose is a safe no-op");
});

test("a static preview schedules nothing, and a menu without a host schedules nothing", (t) => {
	const timers = mockTimers(t);
	const hosted = makeMenu(
		{ preview: { render: () => ({ lines: ["static"] }) } },
		{ tui: fakeTui(24) },
	);
	hosted.menu.render(64);
	const unhosted = makeMenu({
		preview: { render: () => ({ lines: ["x"], nextRefreshInMs: 50 }) },
	});
	unhosted.menu.render(64);
	assert.deepEqual(timers.delays, []);
	assert.doesNotThrow(() => hosted.menu.dispose());
	assert.doesNotThrow(() => unhosted.menu.dispose());
	assert.doesNotThrow(() => makeMenu().menu.dispose());
});

test("the timer is cleared when the menu closes", async (t) => {
	const timers = mockTimers(t);
	const { menu, results } = makeMenu(
		{ preview: { render: () => ({ lines: ["x"], nextRefreshInMs: 80 }) } },
		{ tui: fakeTui(24) },
	);
	menu.render(64);
	assert.deepEqual(timers.delays, [80]);
	await press(menu, KEY.enter);
	assert.equal(results[0]?.applied, true);
	assert.deepEqual(timers.cleared, [99]);
});

test("switching from a static preview to an animated one starts and stops its timer", async (t) => {
	const timers = mockTimers(t);
	const { menu } = makeMenu(
		{
			preview: {
				render: (_values, state) =>
					state.activeItemId === "a"
						? { lines: ["static"] }
						: { lines: ["animated"], nextRefreshInMs: 80 },
			},
		},
		{ tui: fakeTui(24) },
	);
	menu.render(64);
	assert.deepEqual(timers.delays, []);
	await press(menu, KEY.down);
	menu.render(64);
	assert.deepEqual(timers.delays, [80]);
	await press(menu, KEY.up);
	menu.render(64);
	assert.deepEqual(timers.cleared, [99]);
	assert.deepEqual(timers.delays, [80]);
	menu.dispose();
});
