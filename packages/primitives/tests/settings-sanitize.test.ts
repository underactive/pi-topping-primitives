import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitize } from "../src/settings/index.js";

test("isRecord rejects null, arrays and primitives", () => {
	assert.equal(sanitize.isRecord({}), true);
	for (const value of [null, [], "x", 1, undefined]) {
		assert.equal(sanitize.isRecord(value), false);
	}
});

test("booleanOr only accepts booleans", () => {
	assert.equal(sanitize.booleanOr(false, true), false);
	assert.equal(sanitize.booleanOr("false", true), true);
});

test("numberOr falls back instead of clamping", () => {
	assert.equal(sanitize.numberOr(5, 1, { min: 1, max: 10 }), 5);
	assert.equal(sanitize.numberOr(11, 1, { min: 1, max: 10 }), 1);
	assert.equal(sanitize.numberOr(0, 3, { exclusiveMin: 0 }), 3);
	assert.equal(sanitize.numberOr(0.5, 3, { exclusiveMin: 0 }), 0.5);
	assert.equal(sanitize.numberOr(1.5, 2, { integer: true }), 2);
	assert.equal(sanitize.numberOr(Number.NaN, 2), 2);
	assert.equal(sanitize.numberOr(Number.POSITIVE_INFINITY, 2), 2);
	assert.equal(sanitize.numberOr("4", 2), 2);
});

test("enumOr keeps listed values and falls back otherwise", () => {
	assert.equal(sanitize.enumOr("b", ["a", "b"] as const, "a"), "b");
	assert.equal(sanitize.enumOr("c", ["a", "b"] as const, "a"), "a");
});

test("stringList trims and drops empties", () => {
	assert.deepEqual(sanitize.stringList([" a ", "", "  ", 3, "b"]), ["a", "b"]);
	assert.deepEqual(sanitize.stringList("a"), []);
});

test("onOff accepts on/off strings and booleans", () => {
	assert.equal(sanitize.onOff("on", false), true);
	assert.equal(sanitize.onOff("off", true), false);
	assert.equal(sanitize.onOff(true, false), true);
	assert.equal(sanitize.onOff("maybe", true), true);
});

test("the sanitiser table is frozen", () => {
	assert.ok(Object.isFrozen(sanitize));
});
