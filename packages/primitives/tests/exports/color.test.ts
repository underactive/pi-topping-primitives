import assert from "node:assert/strict";
import { test } from "node:test";
import { ansiToRgb } from "@underactive/pi-topping-primitives/activity-tui";
import * as color from "@underactive/pi-topping-primitives/color";

test("compiled ./color renders the comet bar and reads a colour escape", () => {
	const bar = color.renderCometBar(50, { mode: "truecolor", elapsedMs: 500 });
	assert.equal(bar.split(color.BAR_FILLED).length - 1, 10);
	assert.equal(bar.split(color.BAR_TROUGH.repeat(10)).length - 1, 1);
	assert.equal(
		color.hexToFgAnsi(color.NVIDIA_GREEN_HEX, "truecolor"),
		"\x1b[38;2;132;197;26m",
	);
});

test("compiled ./color keeps its parser apart from ./activity-tui's", () => {
	assert.equal(ansiToRgb("\x1b[38;5;196m"), null);
	assert.deepEqual(color.parseSgrColor("\x1b[38;5;196m")?.kind, "indexed");
	assert.deepEqual(color.parseSgrColor("\x1b[1m\x1b[38;2;1;2;3m"), {
		kind: "truecolor",
		plane: "fg",
		rgb: [1, 2, 3],
	});
});

test("compiled ./color fades and shimmers", () => {
	assert.equal(
		color.fadeRgbToward(
			"\x1b[38;2;254;188;56mA\x1b[39m",
			[18, 18, 18],
			0.5,
			"truecolor",
		),
		"\x1b[38;2;136;103;37mA\x1b[38;2;111;111;111m",
	);
	assert.equal(
		color.shimmerCell("x", 5, {
			base: [100, 100, 110],
			highlight: [230, 230, 235],
		}),
		"\x1b[38;2;100;100;110mx",
	);
});

test("compiled ./color exports frozen palettes", () => {
	assert.ok(Object.isFrozen(color.SYNTHWAVE_GREENS));
	assert.ok(Object.isFrozen(color.SYNTHWAVE_GREENS.trough));
	assert.equal(color.isSwitchyardProvider(" Switchyard "), true);
});
