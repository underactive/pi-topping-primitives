import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ActivityMeter,
	ActivityMeterLevel,
} from "@underactive/pi-topping-primitives/activity";
import {
	ansiToRgb,
	formatToolActivity,
	renderIdleMeter,
	renderMeter,
	thinkingLevelThemeColor,
} from "@underactive/pi-topping-primitives/activity-tui";

const theme = {
	fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
};

test("compiled renderMeter colours cells of a compiled meter", () => {
	const meter = new ActivityMeter({ width: 3, direction: "rtl" });
	meter.push(ActivityMeterLevel.FULL);
	assert.equal(
		renderMeter(meter, theme, "accent"),
		"<dim>⢀</dim><dim>⢀</dim><accent>⣿</accent>",
	);
	assert.equal(renderIdleMeter(theme, 2), "<dim>⢀⢀</dim>");
});

test("compiled formatToolActivity strips a terminal sequence through pi-tui", () => {
	assert.equal(
		formatToolActivity("bash", { command: "\x1b[31mred\x1b[0m" }),
		"bash red",
	);
});

test("compiled thinking colours and ansiToRgb work", () => {
	assert.equal(thinkingLevelThemeColor("high"), "thinkingHigh");
	assert.equal(thinkingLevelThemeColor("nope"), "accent");
	assert.deepEqual(ansiToRgb("\x1b[1m\x1b[38;2;1;2;3m"), [1, 2, 3]);
});
