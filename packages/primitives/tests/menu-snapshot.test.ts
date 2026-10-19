// snapshot() as the public replacement for statusline's private-field pokes, plus
// statusline's feed add/remove rebuild cases driven through key presses.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MenuSection } from "../src/menu/types.js";
import { KEY, makeMenu, plain, press, type } from "./menu-harness.js";

test("snapshot returns detached copies with the documented fields", async () => {
	const { menu } = makeMenu({ buttons: [{ id: "ok", label: "OK" }] });
	const first = menu.snapshot();
	assert.deepEqual(first, {
		values: { a: true, b: false, c: true },
		cursorId: "a",
		rowCount: 3,
		editing: false,
		focus: "body",
		busy: [],
	});
	first.values.a = false;
	(first.busy as string[]).push("x");
	const second = menu.snapshot();
	assert.equal(second.values.a, true, "mutating a snapshot changes nothing");
	assert.deepEqual(second.busy, []);
	assert.notStrictEqual(first.values, second.values);
	await press(menu, KEY.down, KEY.tab);
	assert.equal(menu.snapshot().cursorId, "b");
	assert.equal(menu.snapshot().focus, "buttons");
});

interface Feed {
	customType: string;
	prefix: string;
}

function feedSections(feeds: readonly Feed[]): MenuSection[] {
	const items: MenuSection["items"][number][] = [];
	feeds.forEach((feed, index) => {
		items.push({
			kind: "text",
			id: `feed.${index}.customType`,
			label: `${index + 1}. type`,
			value: feed.customType,
			placeholder: "ext/type",
		});
		items.push({
			kind: "text",
			id: `feed.${index}.prefix`,
			label: `${index + 1}. prefix`,
			value: feed.prefix,
			placeholder: "(none)",
		});
		items.push({
			kind: "action",
			id: `feed.${index}.remove`,
			label: `${index + 1}. remove`,
		});
	});
	items.push({ kind: "action", id: "feed.add", label: "+ add feed" });
	return [{ title: "Feeds", items }];
}

function feedMenu() {
	return makeMenu({
		sections: feedSections([
			{ customType: "pi-prompt-cache/savings", prefix: "CS" },
		]),
		onAction: (id, values) => {
			const list: Feed[] = [];
			for (
				let index = 0;
				values[`feed.${index}.customType`] !== undefined;
				index++
			) {
				list.push({
					customType: String(values[`feed.${index}.customType`]),
					prefix: String(values[`feed.${index}.prefix`]),
				});
			}
			if (id === "feed.add") list.push({ customType: "", prefix: "" });
			else {
				const match = /^feed\.(\d+)\.remove$/.exec(id);
				if (!match) return undefined;
				list.splice(Number(match[1]), 1);
			}
			return feedSections(list);
		},
	});
}

test("typing into a text row edits only on commit, and the buffer shows live", async () => {
	const { menu } = feedMenu();
	await press(menu, KEY.enter);
	type(menu, "-x");
	assert.ok(
		plain(menu).some((line) => line.includes("pi-prompt-cache/savings-x")),
	);
	assert.equal(
		menu.snapshot().values["feed.0.customType"],
		"pi-prompt-cache/savings",
		"not committed yet",
	);
	await press(menu, KEY.backspace, KEY.enter);
	assert.equal(
		menu.snapshot().values["feed.0.customType"],
		"pi-prompt-cache/savings-",
	);
});

test("add feed appends three rows and a blank value; remove drops the right rows and values", async () => {
	const { menu } = feedMenu();
	const before = menu.snapshot().rowCount;
	for (let index = 0; index < before - 1; index++) menu.handleInput(KEY.down);
	assert.equal(menu.snapshot().cursorId, "feed.add");
	await press(menu, KEY.enter);
	assert.equal(menu.snapshot().rowCount, before + 3);
	assert.equal(menu.snapshot().values["feed.1.customType"], "");
	assert.ok(
		plain(menu).some((line) => line.includes("ext/type")),
		"placeholder shows for the new empty row",
	);

	for (let index = 0; index < 10; index++) menu.handleInput(KEY.up);
	for (let index = 0; index < 5; index++) menu.handleInput(KEY.down);
	assert.equal(menu.snapshot().cursorId, "feed.1.remove");
	await press(menu, KEY.enter);
	assert.equal(menu.snapshot().rowCount, before);
	assert.equal(
		menu.snapshot().values["feed.1.customType"],
		undefined,
		"removed values do not linger",
	);
	assert.equal(
		menu.snapshot().values["feed.0.customType"],
		"pi-prompt-cache/savings",
	);
});

test("the cursor stays in range after a removal at the end", async () => {
	const { menu } = feedMenu();
	await press(menu, KEY.down, KEY.down);
	assert.equal(menu.snapshot().cursorId, "feed.0.remove");
	await press(menu, KEY.enter);
	const after = menu.snapshot();
	assert.equal(after.rowCount, 1);
	assert.equal(after.cursorId, "feed.add");
	assert.doesNotThrow(() => menu.render(60));
});
