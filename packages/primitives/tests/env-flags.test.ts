import assert from "node:assert/strict";
import { test } from "node:test";
import { isTruthyEnvFlag, suppressNotifications } from "../src/env/index.js";

// Moved from web-tools' test/env.test.ts, unchanged in body.
test("isTruthyEnvFlag accepts pi's supported truthy values", () => {
	for (const value of ["1", "true", "TRUE", "yes", "YES"]) {
		assert.equal(isTruthyEnvFlag(value), true, value);
	}
	for (const value of [undefined, "", "0", "false", "no", " true "]) {
		assert.equal(isTruthyEnvFlag(value), false, value);
	}
});

test("isTruthyEnvFlag ignores case only for true and yes, and rejects near misses", () => {
	for (const value of ["True", "tRuE", "Yes", "yEs"]) {
		assert.equal(isTruthyEnvFlag(value), true, value);
	}
	for (const value of ["on", "ON", "y", "t", "2", "-1", "truee", "1 ", " 1"]) {
		assert.equal(isTruthyEnvFlag(value), false, JSON.stringify(value));
	}
});

// Moved from web-tools' test/env.test.ts, unchanged in body.
test("suppressNotifications reads PI_SUPPRESS_NOTIFICATIONS", () => {
	assert.equal(
		suppressNotifications({ PI_SUPPRESS_NOTIFICATIONS: "yes" }),
		true,
	);
	assert.equal(
		suppressNotifications({ PI_SUPPRESS_NOTIFICATIONS: "0" }),
		false,
	);
});

// Moved from compact's test/config.test.ts, unchanged in body.
test("suppressNotifications is off when the env var is unset", () => {
	assert.equal(suppressNotifications({}), false);
});

test("suppressNotifications honors set flags and ignores falsy values", () => {
	assert.equal(suppressNotifications({ PI_SUPPRESS_NOTIFICATIONS: "1" }), true);
	assert.equal(
		suppressNotifications({ PI_SUPPRESS_NOTIFICATIONS: "true" }),
		true,
	);
	assert.equal(
		suppressNotifications({ PI_SUPPRESS_NOTIFICATIONS: "0" }),
		false,
	);
	assert.equal(
		suppressNotifications({ PI_SUPPRESS_NOTIFICATIONS: "false" }),
		false,
	);
});

test("suppressNotifications ignores other variables", () => {
	assert.equal(suppressNotifications({ SUPPRESS_NOTIFICATIONS: "1" }), false);
	assert.equal(suppressNotifications({ PI_SUPPRESS_NOTIFICATION: "1" }), false);
});

test("suppressNotifications defaults to the live environment, read at call time", () => {
	const before = process.env.PI_SUPPRESS_NOTIFICATIONS;
	try {
		delete process.env.PI_SUPPRESS_NOTIFICATIONS;
		assert.equal(suppressNotifications(), false);
		process.env.PI_SUPPRESS_NOTIFICATIONS = "true";
		assert.equal(suppressNotifications(), true);
		process.env.PI_SUPPRESS_NOTIFICATIONS = "0";
		assert.equal(suppressNotifications(), false);
	} finally {
		if (before === undefined) delete process.env.PI_SUPPRESS_NOTIFICATIONS;
		else process.env.PI_SUPPRESS_NOTIFICATIONS = before;
	}
});
