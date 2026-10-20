import assert from "node:assert/strict";
import { test } from "node:test";
import * as env from "@underactive/pi-topping-primitives/env";

test("compiled ./env reads pi's truthy flags", () => {
	assert.equal(env.isTruthyEnvFlag("YES"), true);
	assert.equal(env.isTruthyEnvFlag("0"), false);
	assert.equal(env.isTruthyEnvFlag(undefined), false);
});

test("compiled ./env reads PI_SUPPRESS_NOTIFICATIONS from the environment it is given", () => {
	assert.equal(env.suppressNotifications({}), false);
	assert.equal(
		env.suppressNotifications({ PI_SUPPRESS_NOTIFICATIONS: "1" }),
		true,
	);
});
