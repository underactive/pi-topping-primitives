import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import {
	findNearestProjectAgentsDir,
	loadAgentsFromDir,
	parseAgentFile,
} from "../src/process/index.js";

type Level = "low" | "high";
const parseLevel = (raw: string): Level | undefined =>
	raw === "low" || raw === "high" ? raw : undefined;

function withTemp(run: (root: string) => void): void {
	const root = mkdtempSync(join(tmpdir(), "pt-agents-"));
	try {
		run(root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function agentFile(
	dir: string,
	file: string,
	frontmatter: string,
	body = "Be helpful.",
): string {
	mkdirSync(dir, { recursive: true });
	const path = join(dir, file);
	writeFileSync(path, `---\n${frontmatter}\n---\n${body}\n`);
	return path;
}

test("a full agent file has the exact key shape, with thinking only when asked for", () => {
	withTemp((root) => {
		const path = agentFile(
			root,
			"scout.md",
			"name: scout\ndescription: Scouts\ntools: read, grep\nmodel: openai/x\nthinking: high",
		);
		const withThinking = parseAgentFile(path, "project", {
			parseThinking: parseLevel,
		});
		assert.deepStrictEqual(withThinking, {
			name: "scout",
			description: "Scouts",
			tools: ["read", "grep"],
			model: "openai/x",
			thinking: "high",
			systemPrompt: "Be helpful.",
			source: "project",
			filePath: path,
		});
		assert.deepEqual(Object.keys(withThinking ?? {}), [
			"name",
			"description",
			"tools",
			"model",
			"thinking",
			"systemPrompt",
			"source",
			"filePath",
		]);

		const without = parseAgentFile(path, "project");
		assert.deepStrictEqual(without, {
			name: "scout",
			description: "Scouts",
			tools: ["read", "grep"],
			model: "openai/x",
			systemPrompt: "Be helpful.",
			source: "project",
			filePath: path,
		});
		assert.equal("thinking" in (without ?? {}), false);
	});
});

test("tools and model keys are always present, even when unset", () => {
	withTemp((root) => {
		const path = agentFile(root, "a.md", "name: a\ndescription: d");
		const agent = parseAgentFile(path, "user");
		assert.ok(agent);
		assert.equal("tools" in agent, true);
		assert.equal("model" in agent, true);
		assert.equal(agent.tools, undefined);
		assert.equal(agent.model, undefined);
	});
});

test("tools split on commas, are trimmed, and empty entries drop", () => {
	withTemp((root) => {
		const path = agentFile(
			root,
			"a.md",
			"name: a\ndescription: d\ntools: ' read ,, grep ,'",
		);
		assert.deepEqual(parseAgentFile(path, "user")?.tools, ["read", "grep"]);
		const empty = agentFile(
			root,
			"b.md",
			"name: b\ndescription: d\ntools: ' , '",
		);
		assert.equal(parseAgentFile(empty, "user")?.tools, undefined);
	});
});

test("YAML null counts as absent", () => {
	withTemp((root) => {
		const path = agentFile(
			root,
			"a.md",
			"name: a\ndescription: d\nmodel: null\ntools: ~\nthinking: null",
		);
		const agent = parseAgentFile(path, "user", { parseThinking: parseLevel });
		assert.ok(agent);
		assert.equal(agent.model, undefined);
		assert.equal(agent.tools, undefined);
		assert.equal(agent.thinking, undefined);
	});
});

test("thinking is trimmed, passed to parseThinking, and an unrecognised level is dropped", () => {
	withTemp((root) => {
		const seen: string[] = [];
		const spy = (raw: string): Level | undefined => {
			seen.push(raw);
			return parseLevel(raw);
		};
		const high = agentFile(
			root,
			"h.md",
			"name: h\ndescription: d\nthinking: ' high '",
		);
		const bad = agentFile(
			root,
			"b.md",
			"name: b\ndescription: d\nthinking: extreme",
		);
		const blank = agentFile(
			root,
			"c.md",
			"name: c\ndescription: d\nthinking: ' '",
		);
		assert.equal(
			parseAgentFile(high, "user", { parseThinking: spy })?.thinking,
			"high",
		);
		const dropped = parseAgentFile(bad, "user", { parseThinking: spy });
		assert.ok(dropped, "an unrecognised level does not skip the file");
		assert.equal("thinking" in dropped, true);
		assert.equal(dropped.thinking, undefined);
		assert.equal(
			parseAgentFile(blank, "user", { parseThinking: spy })?.thinking,
			undefined,
		);
		assert.deepEqual(seen, ["high", "extreme"], "blank is never offered");
	});
});

test("a file without name or description is skipped", () => {
	withTemp((root) => {
		assert.equal(
			parseAgentFile(agentFile(root, "a.md", "description: d"), "user"),
			undefined,
		);
		assert.equal(
			parseAgentFile(agentFile(root, "b.md", "name: b"), "user"),
			undefined,
		);
		assert.equal(
			parseAgentFile(
				agentFile(root, "c.md", "name: ''\ndescription: d"),
				"user",
			),
			undefined,
		);
		writeFileSync(join(root, "d.md"), "no frontmatter at all");
		assert.equal(parseAgentFile(join(root, "d.md"), "user"), undefined);
	});
});

test("an unreadable path is skipped", () => {
	assert.equal(
		parseAgentFile(join(tmpdir(), "pt-agents-missing", "x.md"), "user"),
		undefined,
	);
});

test("malformed files are each skipped and the valid siblings still load", () => {
	withTemp((root) => {
		agentFile(root, "good-a.md", "name: good-a\ndescription: d");
		agentFile(root, "broken-yaml.md", "name: [unclosed\ndescription: d");
		agentFile(root, "tools-list.md", "name: tl\ndescription: d\ntools: [read]");
		agentFile(root, "model-number.md", "name: mn\ndescription: d\nmodel: 7");
		agentFile(root, "name-number.md", "name: 123\ndescription: d");
		agentFile(root, "description-list.md", "name: dl\ndescription:\n  - a");
		agentFile(
			root,
			"thinking-list.md",
			"name: tk\ndescription: d\nthinking: [high]",
		);
		agentFile(root, "good-b.md", "name: good-b\ndescription: d\nthinking: low");
		writeFileSync(join(root, "scalar.md"), "---\njust a string\n---\nbody\n");

		const names = (agents: { name: string }[]): string[] =>
			agents.map((a) => a.name).sort();
		// Without parseThinking the `thinking:` value is never read, so a list there is harmless.
		assert.deepEqual(names(loadAgentsFromDir(root, "user")), [
			"good-a",
			"good-b",
			"tk",
		]);
		assert.deepEqual(
			names(loadAgentsFromDir(root, "user", { parseThinking: parseLevel })),
			["good-a", "good-b"],
		);
	});
});

test("only .md files and symlinks to them are read", () => {
	withTemp((root) => {
		const dir = join(root, "agents");
		agentFile(dir, "real.md", "name: real\ndescription: d");
		agentFile(dir, "notes.txt", "name: txt\ndescription: d");
		agentFile(dir, "upper.MD", "name: upper\ndescription: d");
		mkdirSync(join(dir, "folder.md"));
		agentFile(dir, "folder.md/inside.md", "name: inside\ndescription: d");
		assert.deepEqual(
			loadAgentsFromDir(dir, "project").map((a) => a.name),
			["real"],
		);
	});
});

test(
	"a symlinked agent file is accepted",
	{ skip: process.platform === "win32" },
	() => {
		withTemp((root) => {
			const target = agentFile(
				root,
				"target.md",
				"name: linked\ndescription: d",
			);
			const dir = join(root, "agents");
			mkdirSync(dir);
			symlinkSync(target, join(dir, "link.md"));
			symlinkSync(root, join(dir, "dirlink.md"));
			assert.deepEqual(
				loadAgentsFromDir(dir, "user").map((a) => a.name),
				["linked"],
				"a symlink to a directory is skipped, not fatal",
			);
		});
	},
);

test("a missing directory gives an empty list", () => {
	assert.deepEqual(
		loadAgentsFromDir(join(tmpdir(), "pt-agents-none"), "user"),
		[],
	);
});

test("findNearestProjectAgentsDir returns the nearer of two nested agents directories", () => {
	withTemp((root) => {
		const outer = join(root, CONFIG_DIR_NAME, "agents");
		const innerRoot = join(root, "pkg", "deep");
		const inner = join(root, "pkg", CONFIG_DIR_NAME, "agents");
		mkdirSync(outer, { recursive: true });
		mkdirSync(inner, { recursive: true });
		mkdirSync(innerRoot, { recursive: true });
		assert.equal(findNearestProjectAgentsDir(innerRoot), inner);
		assert.equal(findNearestProjectAgentsDir(join(root, "pkg")), inner);
		assert.equal(findNearestProjectAgentsDir(root), outer);
	});
});

test("a plain file named agents is not an agents directory", () => {
	withTemp((root) => {
		mkdirSync(join(root, CONFIG_DIR_NAME), { recursive: true });
		writeFileSync(join(root, CONFIG_DIR_NAME, "agents"), "not a directory");
		const found = findNearestProjectAgentsDir(root);
		assert.ok(found === null || !found.startsWith(root), `found ${found}`);
	});
});

test("with none in the tree, the walk ends at null or outside the tree", () => {
	withTemp((root) => {
		const nested = join(root, "a", "b");
		mkdirSync(nested, { recursive: true });
		const found = findNearestProjectAgentsDir(nested);
		// A machine may have its own .pi/agents above the temp dir; the walk must not invent one inside.
		assert.ok(found === null || !found.startsWith(root), `found ${found}`);
	});
});
