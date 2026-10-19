import assert from "node:assert/strict";
import { test } from "node:test";
import { OutputTokenAccount } from "../src/activity/index.js";

const assistant = (usage?: Record<string, unknown>) => ({
	role: "assistant",
	...(usage ? { usage } : {}),
});
const delta = (type: string, text: string) => ({ type, delta: text });

test("mid-turn output is estimated purely from streamed deltas", () => {
	// Some hosts carry no cumulative snapshot on message_update, so word counting is the only
	// live signal. A regression here shows up as a meter frozen at idle.
	const account = new OutputTokenAccount();
	account.messageStart(assistant());
	account.messageUpdate(delta("text_delta", "one two "));
	assert.equal(account.snapshot().tokens, 2);
	// Split words are not double counted, and thinking counts alongside text.
	account.messageUpdate(delta("text_delta", "thr"));
	account.messageUpdate(delta("text_delta", "ee "));
	account.messageUpdate(delta("thinking_delta", "hmm ok "));
	assert.equal(account.snapshot().tokens, 5);

	// No usage on the final message: the estimate is what gets confirmed.
	account.messageEnd(assistant());
	assert.deepEqual(account.snapshot(), { tokens: 5, revision: 0 });

	// A second turn accumulates on top of the first.
	account.messageStart(assistant());
	account.messageUpdate(delta("text_delta", "next turn"));
	assert.equal(account.snapshot().tokens, 7);
});

test("exact final usage correcting an estimate bumps the revision", () => {
	const account = new OutputTokenAccount();
	account.messageStart(assistant());
	account.messageUpdate(delta("text_delta", "a b c "));
	account.messageEnd(assistant({ output: 400 }));
	assert.deepEqual(
		account.snapshot(),
		{ tokens: 400, revision: 1 },
		"a correction must be visible to rate trackers",
	);

	account.messageStart(assistant());
	account.messageUpdate(delta("text_delta", "x y "));
	assert.deepEqual(account.snapshot(), { tokens: 402, revision: 1 });
	account.messageEnd(assistant({ output: 100 }));
	assert.deepEqual(account.snapshot(), { tokens: 500, revision: 2 });
});

test("a final usage matching the estimate must not reset the meter", () => {
	const account = new OutputTokenAccount();
	account.messageStart(assistant());
	account.messageUpdate(delta("text_delta", "a b c "));
	account.messageEnd(assistant({ output: 3 }));
	assert.deepEqual(account.snapshot(), { tokens: 3, revision: 0 });
});

test("non-assistant traffic is ignored, and turn state is scoped", () => {
	const account = new OutputTokenAccount();
	account.messageStart({ role: "user" });
	account.messageUpdate(delta("text_delta", "a b "));
	assert.equal(account.snapshot().tokens, 2);
	// A tool result ending must not confirm or clear the in-flight estimate.
	account.messageEnd({ role: "toolResult" });
	assert.equal(account.snapshot().tokens, 2);
	// Non-delta events (tool call streaming) don't count toward output.
	account.messageUpdate(delta("toolcall_delta", '{"a": 1}'));
	assert.equal(account.snapshot().tokens, 2);
	account.messageUpdate({ type: "text_delta", delta: 42 });
	assert.equal(account.snapshot().tokens, 2, "a non-string delta is ignored");
	account.messageUpdate(undefined);
	assert.equal(account.snapshot().tokens, 2);
});

test("exact partial usage wins over the word estimate", () => {
	const account = new OutputTokenAccount();
	account.messageStart(assistant());
	account.messageUpdate(
		delta("text_delta", "one two three four five "),
		assistant(),
	);
	assert.equal(account.snapshot().tokens, 5);
	account.messageUpdate(undefined, assistant({ output: 30 }));
	assert.equal(account.snapshot().tokens, 30);

	// The partial's usage is the estimate the final usage is compared against.
	account.messageEnd(assistant({ output: 30 }));
	assert.deepEqual(account.snapshot(), { tokens: 30, revision: 0 });
});

test("a partial from a non-assistant message carries no usage", () => {
	const account = new OutputTokenAccount();
	account.messageStart(assistant());
	account.messageUpdate(delta("text_delta", "a b "), {
		role: "user",
		usage: { output: 99 },
	});
	assert.equal(account.snapshot().tokens, 2);
});

test("invalid exact usage falls back to the estimate", () => {
	for (const output of [-5, Number.NaN, Number.POSITIVE_INFINITY, "7", null]) {
		const account = new OutputTokenAccount();
		account.messageStart(assistant());
		account.messageUpdate(delta("text_delta", "a b c "));
		account.messageEnd(assistant({ output }));
		assert.deepEqual(
			account.snapshot(),
			{ tokens: 3, revision: 0 },
			`final usage ${String(output)}`,
		);
	}
});

test("invalid partial usage never replaces the estimate", () => {
	for (const output of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
		const account = new OutputTokenAccount();
		account.messageStart(assistant());
		account.messageUpdate(delta("text_delta", "a b c "), assistant({ output }));
		assert.equal(account.snapshot().tokens, 3, `partial usage ${output}`);
	}
});

test("zero exact usage is exact: a finished turn that reported 0 confirms 0", () => {
	const account = new OutputTokenAccount();
	account.messageStart(assistant());
	account.messageUpdate(delta("text_delta", "a b c "));
	account.messageEnd(assistant({ output: 0 }));
	assert.deepEqual(account.snapshot(), { tokens: 0, revision: 1 });
});

test("a new turn resets the live estimate without touching confirmed totals", () => {
	const account = new OutputTokenAccount();
	account.messageStart(assistant());
	account.messageUpdate(
		delta("text_delta", "first turn words here"),
		assistant(),
	);
	account.messageEnd(assistant({ output: 4 }));
	assert.equal(account.snapshot().tokens, 4);

	account.messageStart(assistant());
	assert.equal(account.snapshot().tokens, 4, "the confirmed total survives");
	account.messageUpdate(delta("text_delta", "second"), assistant());
	assert.equal(account.snapshot().tokens, 5);
});

test("reset forgets everything, including the revision", () => {
	const account = new OutputTokenAccount();
	account.messageStart(assistant());
	account.messageUpdate(delta("text_delta", "a b c "));
	account.messageEnd(assistant({ output: 400 }));
	account.messageStart(assistant());
	account.messageUpdate(delta("text_delta", "x y "));

	account.reset();
	assert.deepEqual(account.snapshot(), { tokens: 0, revision: 0 });
	account.messageUpdate(delta("text_delta", "fresh "));
	assert.equal(account.snapshot().tokens, 1);
});
