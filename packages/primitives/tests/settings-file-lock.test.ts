import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	acquireDirLock,
	dirLockStale,
	isProcessAlive,
	releaseDirLock,
} from "../src/settings/index.js";

function lockPath(): { dir: string; path: string } {
	const dir = mkdtempSync(join(tmpdir(), "pt-lock-"));
	return { dir, path: join(dir, "x.lock") };
}

function plantOwner(path: string, owner: unknown): void {
	mkdirSync(path);
	if (owner !== undefined)
		writeFileSync(join(path, "owner.json"), JSON.stringify(owner));
}

test("acquire and release round trip", () => {
	const { dir, path } = lockPath();
	try {
		assert.equal(acquireDirLock(path), true);
		assert.equal(existsSync(join(path, "owner.json")), true);
		assert.equal(acquireDirLock(path, { attempts: 1 }), false);
		releaseDirLock(path);
		assert.equal(existsSync(path), false);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a dead owner on the same host is reclaimed", () => {
	const { dir, path } = lockPath();
	try {
		plantOwner(path, { pid: 999_999, hostname: "h", at: 0 });
		assert.equal(
			acquireDirLock(path, {
				hostname: "h",
				isAlive: () => false,
				attempts: 2,
				retryMs: 0,
			}),
			true,
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a live owner on the same host is not reclaimed", () => {
	const { dir, path } = lockPath();
	try {
		plantOwner(path, { pid: 5, hostname: "h", at: 0 });
		assert.equal(
			acquireDirLock(path, {
				hostname: "h",
				isAlive: () => true,
				attempts: 2,
				retryMs: 0,
			}),
			false,
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("an owner on another host is not reclaimed inside the stale window", () => {
	const { dir, path } = lockPath();
	try {
		plantOwner(path, { pid: 5, hostname: "other", at: 0 });
		assert.equal(
			dirLockStale(path, { hostname: "h", isAlive: () => false }),
			false,
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a missing owner is reclaimed only after the stale window", () => {
	const { dir, path } = lockPath();
	try {
		plantOwner(path, undefined);
		assert.equal(dirLockStale(path, { missingOwnerStaleMs: 60_000 }), false);
		const old = new Date(Date.now() - 120_000);
		utimesSync(path, old, old);
		assert.equal(dirLockStale(path, { missingOwnerStaleMs: 60_000 }), true);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("isProcessAlive knows this process and rejects nonsense pids", () => {
	assert.equal(isProcessAlive(process.pid), true);
	assert.equal(isProcessAlive(0), false);
	assert.equal(isProcessAlive(-4), false);
});
