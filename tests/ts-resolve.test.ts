import assert from "node:assert/strict";
import { test } from "node:test";

test("the resolve hook maps a .js specifier onto its .ts sibling", async () => {
	const mod = (await import("./fixtures/js-specifier/entry.js")) as {
		dep: string;
	};
	assert.equal(mod.dep, "from-dep");
});
