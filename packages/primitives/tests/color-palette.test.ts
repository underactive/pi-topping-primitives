import assert from "node:assert/strict";
import { test } from "node:test";
import {
	hexToFgAnsi,
	isSwitchyardProvider,
	NVIDIA_GREEN_DARK_HEX,
	NVIDIA_GREEN_HEX,
	parseHex,
	SWITCHYARD_PROVIDER,
	SYNTHWAVE_GREENS,
} from "../src/color/index.js";

// pi-topping and statusline each asserted these; the predicate now lives here once.
test("isSwitchyardProvider matches the provider id ignoring case and surrounding space", () => {
	assert.equal(isSwitchyardProvider("switchyard"), true);
	assert.equal(isSwitchyardProvider(" Switchyard "), true);
	assert.equal(isSwitchyardProvider("SWITCHYARD"), true);
	assert.equal(isSwitchyardProvider("\tswitchyard\n"), true);
	assert.equal(isSwitchyardProvider(SWITCHYARD_PROVIDER), true);
});

test("isSwitchyardProvider is false for anything else, including no provider at all", () => {
	assert.equal(isSwitchyardProvider(undefined), false);
	assert.equal(isSwitchyardProvider(), false);
	assert.equal(isSwitchyardProvider(""), false);
	assert.equal(isSwitchyardProvider("other"), false);
	assert.equal(isSwitchyardProvider("switchyard2"), false);
	assert.equal(isSwitchyardProvider("switch yard"), false);
	assert.equal(isSwitchyardProvider("anthropic"), false);
});

test("the NVIDIA greens are the ones both toppings drew", () => {
	assert.equal(SWITCHYARD_PROVIDER, "switchyard");
	assert.equal(NVIDIA_GREEN_HEX, "#84c51a");
	assert.equal(NVIDIA_GREEN_DARK_HEX, "#0b3d20");
	assert.deepEqual(parseHex(NVIDIA_GREEN_HEX), [132, 197, 26]);
	assert.deepEqual(parseHex(NVIDIA_GREEN_DARK_HEX), [11, 61, 32]);
	// The bytes pi-topping's response-model colorizer has always written.
	assert.equal(
		hexToFgAnsi(NVIDIA_GREEN_HEX, "truecolor"),
		"\x1b[38;2;132;197;26m",
	);
});

test("SYNTHWAVE_GREENS holds the four comet colours, deeply frozen", () => {
	assert.deepEqual(
		{ ...SYNTHWAVE_GREENS },
		{
			deep: [11, 61, 32],
			base: [114, 241, 184],
			light: [185, 248, 217],
			trough: [38, 100, 70],
		},
	);
	assert.ok(Object.isFrozen(SYNTHWAVE_GREENS));
	for (const colour of Object.values(SYNTHWAVE_GREENS)) {
		assert.ok(Object.isFrozen(colour));
	}
});
