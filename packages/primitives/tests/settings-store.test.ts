import assert from "node:assert/strict";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
	createSettingsStore,
	memorySettingsStore,
	type SettingsCodec,
	type SettingsStore,
	sanitize,
	toppingSettingsPath,
} from "../src/settings/index.js";

interface Doc {
	n: number;
	label: string;
}

const defaults: Doc = { n: 1, label: "x" };

const codec: SettingsCodec<Doc> = {
	sanitize(raw) {
		const r = sanitize.isRecord(raw) ? raw : {};
		return {
			n: sanitize.numberOr(r.n, defaults.n, { integer: true }),
			label: typeof r.label === "string" ? r.label : defaults.label,
		};
	},
};

const dirs: string[] = [];
function tmp(): string {
	const dir = mkdtempSync(join(tmpdir(), "pt-settings-"));
	dirs.push(dir);
	return dir;
}
afterEach(() => {
	for (const dir of dirs.splice(0)) {
		try {
			chmodSync(dir, 0o700);
		} catch {
			// already gone
		}
		rmSync(dir, { recursive: true, force: true });
	}
});

function fileStore(
	file: string,
	extra: Partial<Parameters<typeof createSettingsStore<Doc>>[0]> = {},
	diagnostics: string[] = [],
) {
	return createSettingsStore<Doc>({
		path: () => file,
		codec,
		onDiagnostic: (m) => diagnostics.push(m),
		...extra,
	});
}

// --- read ---

test("read: missing file gives defaults silently", () => {
	const diagnostics: string[] = [];
	const store = fileStore(join(tmp(), "a.json"), {}, diagnostics);
	assert.deepEqual(store.read(), defaults);
	assert.deepEqual(diagnostics, []);
});

test("read: corrupt, oversized and non-object files give defaults with a diagnostic", () => {
	const dir = tmp();
	const diagnostics: string[] = [];
	writeFileSync(join(dir, "bad.json"), "{nope");
	assert.deepEqual(
		fileStore(join(dir, "bad.json"), {}, diagnostics).read(),
		defaults,
	);
	assert.equal(diagnostics.length, 1);

	writeFileSync(
		join(dir, "big.json"),
		JSON.stringify({ n: 7, pad: "x".repeat(200) }),
	);
	assert.deepEqual(
		fileStore(join(dir, "big.json"), { maxBytes: 50 }, diagnostics).read(),
		defaults,
	);
	assert.equal(diagnostics.length, 2);

	writeFileSync(join(dir, "arr.json"), "[1]");
	assert.deepEqual(fileStore(join(dir, "arr.json")).read(), defaults);
});

test("read: nothing is printed", () => {
	const dir = tmp();
	writeFileSync(join(dir, "bad.json"), "{nope");
	const original = console.error;
	const seen: unknown[] = [];
	console.error = (...args: unknown[]) => {
		seen.push(args);
	};
	try {
		fileStore(join(dir, "bad.json")).read();
	} finally {
		console.error = original;
	}
	assert.deepEqual(seen, []);
});

test("read: a throwing codec falls back to sanitize(undefined) with a diagnostic", () => {
	const dir = tmp();
	writeFileSync(join(dir, "a.json"), "{}");
	const diagnostics: string[] = [];
	const store = createSettingsStore<Doc>({
		path: () => join(dir, "a.json"),
		codec: {
			sanitize(raw) {
				if (raw !== undefined) throw new Error("boom");
				return defaults;
			},
		},
		onDiagnostic: (m) => diagnostics.push(m),
	});
	assert.deepEqual(store.read(), defaults);
	assert.match(diagnostics[0] ?? "", /boom/);
});

// --- paths ---

test("pathEnv wins when non-empty and is ignored when empty", () => {
	const dir = tmp();
	const store = fileStore(join(dir, "a.json"), {
		pathEnv: "PT_TEST_SETTINGS_FILE",
	});
	try {
		process.env.PT_TEST_SETTINGS_FILE = join(dir, "env.json");
		assert.equal(store.path(), join(dir, "env.json"));
		process.env.PT_TEST_SETTINGS_FILE = "";
		assert.equal(store.path(), join(dir, "a.json"));
	} finally {
		delete process.env.PT_TEST_SETTINGS_FILE;
	}
});

test("toppingSettingsPath re-resolves after PI_CODING_AGENT_DIR changes", () => {
	const previous = process.env.PI_CODING_AGENT_DIR;
	const path = toppingSettingsPath("pi-topping-x");
	try {
		process.env.PI_CODING_AGENT_DIR = "/tmp/agent-one";
		assert.equal(
			path(),
			join("/tmp/agent-one", "pi-topping-x", "settings.json"),
		);
		process.env.PI_CODING_AGENT_DIR = "/tmp/agent-two";
		assert.equal(
			path(),
			join("/tmp/agent-two", "pi-topping-x", "settings.json"),
		);
		assert.equal(
			toppingSettingsPath("p", "c.json")(),
			join("/tmp/agent-two", "p", "c.json"),
		);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
	}
});

// --- write ---

test("write: 2-space JSON with newline, modes 0600/0700, no temp left", () => {
	const dir = tmp();
	const file = join(dir, "new", "a.json");
	const result = fileStore(file).write({ n: 3, label: "y" });
	assert.equal(result.ok, true);
	assert.equal(readFileSync(file, "utf8"), '{\n  "n": 3,\n  "label": "y"\n}\n');
	assert.equal(statSync(file).mode & 0o777, 0o600);
	assert.equal(statSync(join(dir, "new")).mode & 0o777, 0o700);
	assert.deepEqual(readdirSync(join(dir, "new")), ["a.json"]);
});

test("write: an existing directory keeps its mode", () => {
	const dir = tmp();
	chmodSync(dir, 0o755);
	fileStore(join(dir, "a.json")).write(defaults);
	assert.equal(statSync(dir).mode & 0o777, 0o755);
});

test("write: version key comes first and a custom serializer is used", () => {
	const dir = tmp();
	const file = join(dir, "a.json");
	const store = createSettingsStore<Doc>({
		path: () => file,
		codec: {
			...codec,
			version: { key: "schemaVersion", current: 4 },
			serialize: (v) => `${JSON.stringify(v, null, "\t")}\n`,
		},
	});
	store.write({ n: 2, label: "z" });
	assert.equal(
		readFileSync(file, "utf8"),
		'{\n\t"schemaVersion": 4,\n\t"n": 2,\n\t"label": "z"\n}\n',
	);
});

test("write: failure comes back as write_failed and leaves no temp", () => {
	const dir = tmp();
	const locked = join(dir, "locked");
	mkdirSync(locked);
	chmodSync(locked, 0o500);
	const result = fileStore(join(locked, "a.json")).write(defaults);
	assert.equal(result.ok, false);
	if (!result.ok) assert.equal(result.reason, "write_failed");
	assert.deepEqual(readdirSync(locked), []);
});

// --- update ---

test("update: merges against the current value and persists", () => {
	const file = join(tmp(), "a.json");
	const store = fileStore(file);
	store.write({ n: 2, label: "a" });
	const result = store.update((c) => ({ ...c, label: "b" }));
	assert.equal(result.ok, true);
	assert.deepEqual(store.read(), { n: 2, label: "b" });
});

test("update: refuses a corrupt file with the exact message and leaves it untouched", () => {
	const file = join(tmp(), "a.json");
	writeFileSync(file, "{nope");
	const result = fileStore(file).update((c) => c);
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.reason, "refused");
		assert.match(
			result.message,
			new RegExp(
				`^${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} is not valid JSON \\(.+\\); fix or remove it before saving$`,
			),
		);
	}
	assert.equal(readFileSync(file, "utf8"), "{nope");
});

test("update: busy when a live owner holds the lock", () => {
	const file = join(tmp(), "a.json");
	const store = fileStore(file, { lock: { attempts: 1, isAlive: () => true } });
	mkdirSync(`${file}.lock`);
	writeFileSync(
		join(`${file}.lock`, "owner.json"),
		JSON.stringify({ pid: 1, hostname: hostname(), at: 0 }),
	);
	const result = store.update((c) => c);
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.reason, "busy");
		assert.equal(result.message, `settings lock is busy: ${file}.lock`);
	}
});

test("update: a thrown change and a returned { error } are refused without backup", () => {
	const dir = tmp();
	const file = join(dir, "a.json");
	const store = createSettingsStore<Doc>({
		path: () => file,
		codec: { ...codec, version: { key: "v", current: 2, backupBelow: 2 } },
	});
	writeFileSync(file, '{"n":2}');
	const thrown = store.update(() => {
		throw new Error("nope");
	});
	assert.deepEqual(thrown, { ok: false, reason: "refused", message: "nope" });
	const returned = store.update(() => ({ error: "bad" }));
	assert.deepEqual(returned, { ok: false, reason: "refused", message: "bad" });
	assert.deepEqual(readdirSync(dir), ["a.json"]);
});

test("update: a wider object with an error key is a value, not a refusal", () => {
	const file = join(tmp(), "a.json");
	const store = createSettingsStore<{ error: string; other: number }>({
		path: () => file,
		codec: { sanitize: () => ({ error: "x", other: 0 }) },
	});
	const result = store.update(() => ({ error: "x", other: 1 }));
	assert.equal(result.ok, true);
});

test("update: lock: false skips the lock directory", () => {
	const file = join(tmp(), "a.json");
	const store = fileStore(file, { lock: false });
	mkdirSync(`${file}.lock`);
	assert.equal(store.update((c) => c).ok, true);
});

test("update: the lock is released afterwards", () => {
	const dir = tmp();
	fileStore(join(dir, "a.json")).update((c) => c);
	assert.deepEqual(readdirSync(dir), ["a.json"]);
});

// --- backups ---

test("backups: taken once, existing backup preserved, backupPath honoured, current version skipped", () => {
	const dir = tmp();
	const file = join(dir, "config.json");
	const store = createSettingsStore<Doc>({
		path: () => file,
		codec: {
			...codec,
			version: { key: "version", current: 2, backupBelow: 2 },
		},
	});
	writeFileSync(file, '{"n":5}');
	assert.equal(store.update((c) => ({ ...c, label: "one" })).ok, true);
	assert.equal(readFileSync(join(dir, "config.v1.json"), "utf8"), '{"n":5}');
	// Now version 2: no further backup, and the old backup survives.
	assert.equal(store.update((c) => ({ ...c, label: "two" })).ok, true);
	assert.equal(readFileSync(join(dir, "config.v1.json"), "utf8"), '{"n":5}');

	const custom = join(dir, "other.json");
	const named = createSettingsStore<Doc>({
		path: () => custom,
		codec: {
			...codec,
			version: {
				key: "version",
				current: 2,
				backupBelow: 2,
				backupPath: (p) => `${p}.bak`,
			},
		},
	});
	writeFileSync(custom, '{"version":1,"n":9}');
	assert.equal(named.write({ n: 1, label: "w" }).ok, true);
	assert.equal(readFileSync(`${custom}.bak`, "utf8"), '{"version":1,"n":9}');
});

test("backups: a stored version above the threshold is not backed up", () => {
	const dir = tmp();
	const file = join(dir, "config.json");
	const store = createSettingsStore<Doc>({
		path: () => file,
		codec: {
			...codec,
			version: { key: "version", current: 2, backupBelow: 2 },
		},
	});
	writeFileSync(file, '{"version":3}');
	store.write(defaults);
	assert.deepEqual(readdirSync(dir).sort(), ["config.json"]);
});

// --- preserveUnknownKeys ---

test("preserveUnknownKeys keeps foreign keys; undefined values drop their key", () => {
	const dir = tmp();
	const file = join(dir, "a.json");
	const store = createSettingsStore<{ n: number; gone?: string }>({
		path: () => file,
		codec: {
			sanitize: (raw) =>
				sanitize.isRecord(raw) ? (raw as { n: number }) : { n: 0 },
			preserveUnknownKeys: true,
		},
	});
	writeFileSync(file, '{"n":1,"gone":"x","foreign":true}');
	store.update((c) => ({ ...c, gone: undefined }));
	assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), {
		n: 1,
		foreign: true,
	});
});

// --- cached ---

test("cached: re-reads after an external edit, invalidate, and fires onChange for own updates", async () => {
	const file = join(tmp(), "a.json");
	const store = fileStore(file);
	store.write({ n: 1, label: "a" });
	const cached = store.cached();
	const events: Array<[Doc, Doc]> = [];
	const off = cached.onChange((next, previous) =>
		events.push([next, previous]),
	);
	assert.deepEqual(cached.current(), { n: 1, label: "a" });

	store.update((c) => ({ ...c, n: 2 }));
	assert.equal(events.length, 1);
	assert.equal(events[0]?.[0].n, 2);
	assert.equal(events[0]?.[1].n, 1);

	await new Promise((resolve) => setTimeout(resolve, 15));
	writeFileSync(file, '{"n":3,"label":"external"}');
	assert.equal(cached.current().n, 3);
	assert.equal(events.length, 2);

	writeFileSync(file, '{"n":4,"label":"same-size"}');
	cached.invalidate();
	assert.equal(cached.current().n, 4);

	off();
	store.update((c) => ({ ...c, n: 9 }));
	assert.equal(events.length, 3);
});

test("cached: a throwing listener neither changes the result nor escapes", () => {
	const diagnostics: string[] = [];
	const store = fileStore(join(tmp(), "a.json"), {}, diagnostics);
	store.cached().onChange(() => {
		throw new Error("listener");
	});
	const result = store.update((c) => ({ ...c, n: 5 }));
	assert.equal(result.ok, true);
	assert.match(diagnostics[0] ?? "", /listener/);
});

// --- shared behaviour table ---

const implementations: Array<[string, () => SettingsStore<Doc>]> = [
	["file store", () => fileStore(join(tmp(), "a.json"))],
	["memory store", () => memorySettingsStore<Doc>(defaults)],
];

for (const [name, make] of implementations) {
	test(`${name}: write then read round trips`, () => {
		const store = make();
		assert.deepEqual(store.read(), defaults);
		assert.equal(store.write({ n: 7, label: "q" }).ok, true);
		assert.deepEqual(store.read(), { n: 7, label: "q" });
	});

	test(`${name}: update refusals`, () => {
		const store = make();
		assert.equal(store.update(() => ({ error: "no" })).ok, false);
		assert.equal(
			store.update(() => {
				throw new Error("x");
			}).ok,
			false,
		);
		assert.deepEqual(store.read(), defaults);
	});

	test(`${name}: stamp moves on write and cached().current() follows`, () => {
		const store = make();
		const before = store.stamp();
		store.write({ n: 8, label: "s" });
		assert.notEqual(store.stamp(), before);
		assert.deepEqual(store.cached().current(), { n: 8, label: "s" });
	});
}

test("memory store clones on the way in and out", () => {
	const initial = { n: 1, label: "m" };
	const store = memorySettingsStore<Doc>(initial);
	initial.n = 99;
	assert.equal(store.read().n, 1);
	store.read().n = 50;
	assert.equal(store.read().n, 1);
	assert.equal(store.path(), "<memory>");
});
