import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePiInvocation } from "../src/process/index.js";

const exists = (path: string): boolean => path === "/opt/pi/cli.js";

test("a live entry script runs under the running runtime", () => {
	assert.deepEqual(
		resolvePiInvocation(["install", "npm:x"], {
			argv1: "/opt/pi/cli.js",
			execPath: "/usr/bin/node",
			exists,
		}),
		{
			command: "/usr/bin/node",
			args: ["/opt/pi/cli.js", "install", "npm:x"],
			via: "script",
		},
	);
});

test("a compiled pi runs its own executable with no script", () => {
	assert.deepEqual(
		resolvePiInvocation(["--version"], {
			argv1: undefined,
			execPath: "/opt/pi/bin/pi",
			exists,
		}),
		{ command: "/opt/pi/bin/pi", args: ["--version"], via: "executable" },
	);
});

test("a generic runtime with no entry script falls back to pi on PATH", () => {
	assert.deepEqual(
		resolvePiInvocation(["--version"], {
			argv1: "",
			execPath: "/usr/bin/node",
			exists,
		}),
		{ command: "pi", args: ["--version"], via: "path" },
	);
});

test("a Bun virtual entry is never passed as a script, even when it exists", () => {
	const always = (): boolean => true;
	assert.deepEqual(
		resolvePiInvocation(["x"], {
			argv1: "/$bunfs/root/pi",
			execPath: "/opt/pi/bin/pi",
			exists: always,
		}),
		{ command: "/opt/pi/bin/pi", args: ["x"], via: "executable" },
	);
	assert.equal(
		resolvePiInvocation([], {
			argv1: "/$bunfs/root/pi",
			execPath: "/usr/bin/bun",
			exists: always,
		}).via,
		"path",
	);
});

test("node, NODE.EXE, nodejs and bun are generic runtimes; pi and pi.exe are not", () => {
	const via = (execPath: string): string =>
		resolvePiInvocation([], { argv1: "", execPath, exists }).via;
	for (const generic of [
		"/usr/bin/node",
		"/usr/bin/NODE.EXE",
		"/usr/bin/node.exe",
		"/usr/bin/nodejs",
		"/usr/local/bin/bun",
		"/usr/local/bin/bun.exe",
	]) {
		assert.equal(via(generic), "path", generic);
	}
	for (const own of [
		"/opt/pi/pi",
		"/opt/pi/pi.exe",
		"/opt/pi/node-pi",
		"/opt/pi/nodemon",
	]) {
		assert.equal(via(own), "executable", own);
	}
});

test("a missing entry script is not used", () => {
	assert.equal(
		resolvePiInvocation([], {
			argv1: "/does/not/exist.js",
			execPath: "/usr/bin/node",
			exists,
		}).via,
		"path",
	);
});

test("an explicit argv1: undefined means no script, not 'read process.argv[1]'", () => {
	const original = process.argv[1];
	process.argv[1] = import.meta.filename;
	try {
		assert.equal(resolvePiInvocation([]).via, "script");
		assert.equal(
			resolvePiInvocation([], { argv1: undefined, execPath: "/usr/bin/node" })
				.via,
			"path",
		);
	} finally {
		if (original === undefined) process.argv.length = 1;
		else process.argv[1] = original;
	}
});

test("process.argv[1] is read on every call", () => {
	const original = process.argv[1];
	try {
		process.argv[1] = import.meta.filename;
		const first = resolvePiInvocation(["a"]);
		assert.deepEqual(first, {
			command: process.execPath,
			args: [import.meta.filename, "a"],
			via: "script",
		});
		process.argv[1] = "";
		const second = resolvePiInvocation(["a"], { execPath: "/usr/bin/node" });
		assert.deepEqual(second, { command: "pi", args: ["a"], via: "path" });
	} finally {
		if (original === undefined) process.argv.length = 1;
		else process.argv[1] = original;
	}
});

test("input args are copied, never aliased or mutated", () => {
	const input = ["one", "two"];
	for (const facts of [
		{ argv1: "/opt/pi/cli.js", execPath: "/usr/bin/node", exists },
		{ argv1: "", execPath: "/opt/pi/pi", exists },
		{ argv1: "", execPath: "/usr/bin/node", exists },
	]) {
		const result = resolvePiInvocation(input, facts);
		assert.notEqual(result.args, input);
		result.args.push("extra");
		assert.deepEqual(input, ["one", "two"]);
	}
});

test("args default to none", () => {
	assert.deepEqual(
		resolvePiInvocation(undefined, {
			argv1: "",
			execPath: "/opt/pi/pi",
			exists,
		}).args,
		[],
	);
});
