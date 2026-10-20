import assert from "node:assert/strict";
import { test } from "node:test";
import {
	hostBelow,
	parsePiVersion,
	versionAtLeast,
} from "../src/process/index.js";

// moa-fusion's `--no-mcp` gate, written out over the shared helpers.
const NO_MCP_MIN = [1, 0, 4] as const;
function supportsNoMcp(output: string): boolean {
	const version = parsePiVersion(output);
	return version !== undefined && versionAtLeast(version, NO_MCP_MIN);
}

// Moved from moa-fusion's test/runner-no-mcp.test.mjs.
test("parsePiVersion reads the first major.minor.patch anywhere in the output", () => {
	assert.deepEqual(parsePiVersion("1.1.0\n"), [1, 1, 0]);
	assert.deepEqual(parsePiVersion("pi v1.0.4 (build)"), [1, 0, 4]);
	assert.equal(parsePiVersion("no version"), undefined);
});

test("parsePiVersion needs three components and ignores a leading two-part number", () => {
	assert.equal(parsePiVersion("1.2"), undefined);
	assert.deepEqual(parsePiVersion("node 22 pi 1.3.0"), [1, 3, 0]);
	assert.deepEqual(parsePiVersion("10.20.30"), [10, 20, 30]);
});

test("the --no-mcp boundary through versionAtLeast", () => {
	for (const [output, expected] of [
		["1.0.3", false],
		["1.0.4", true],
		["1.1.0", true],
		["2.0.0", true],
		["0.99.9", false],
		["", false],
		["garbage", false],
	] as const) {
		assert.equal(supportsNoMcp(output), expected, `version "${output}"`);
	}
});

test("versionAtLeast compares component by component", () => {
	assert.equal(versionAtLeast([1, 10, 0], [1, 2, 0]), true);
	assert.equal(versionAtLeast([1, 2, 0], [1, 10, 0]), false);
	assert.equal(versionAtLeast([2, 0, 0], [1, 99, 99]), true);
	assert.equal(versionAtLeast([1, 2, 3], [1, 2, 3]), true);
});

test("versionAtLeast treats a missing component as zero and compares only the minimum's length", () => {
	assert.equal(versionAtLeast([1, 2], [1, 2, 0]), true);
	assert.equal(versionAtLeast([1, 2], [1, 2, 1]), false);
	assert.equal(versionAtLeast([1, 0, 0], [1]), true);
	assert.equal(versionAtLeast([0, 9, 9], [1]), false);
	assert.equal(versionAtLeast([], []), true);
	assert.equal(versionAtLeast([], [0, 0, 0]), true);
});

// Copied byte for byte from pi-topping's tests/util.test.ts.
test("hostBelow compares release versions and treats unreadable versions as new enough", () => {
	for (const { version, minimum, expected } of [
		{ version: "1.1.0", minimum: "1.2.0", expected: true },
		{ version: "1.2.0", minimum: "1.2.0", expected: false },
		{ version: "1.2.1", minimum: "1.2.0", expected: false },
		{ version: "1.10.0", minimum: "1.2.0", expected: false },
		{ version: "0.99.1", minimum: "1.2.0", expected: true },
		{ version: "2.0.0", minimum: "1.2.0", expected: false },
		{ version: "1.2.0-beta.1", minimum: "1.2.0", expected: false },
		{ version: "0.0.0", minimum: "1.2.0", expected: true },
		{ version: "unknown", minimum: "1.2.0", expected: false },
		{ version: "1.2.0", minimum: "garbage", expected: false },
	] as const) {
		assert.equal(
			hostBelow(version, minimum),
			expected,
			`${version} below ${minimum}`,
		);
	}
});

test("hostBelow is anchored where parsePiVersion is not", () => {
	assert.equal(hostBelow("pi 1.2.0", "1.3.0"), false);
	assert.deepEqual(parsePiVersion("pi 1.2.0"), [1, 2, 0]);
	assert.equal(hostBelow("  1.2.0\n", "1.3.0"), true, "trimmed first");
});

test("an unreadable version is 'not below' to hostBelow but 'not at least' to the --no-mcp gate", () => {
	// Both are false, with opposite meanings: hostBelow reads it as new enough, the gate as too old.
	assert.equal(hostBelow("garbage", "1.0.4"), false);
	assert.equal(supportsNoMcp("garbage"), false);
});
