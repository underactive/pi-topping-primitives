import { stripVTControlCharacters } from "node:util";

/*
 * Four sanitisers, kept apart on purpose. Each one is what a vendored copy did, and the copies
 * disagree about tab, about invisible format characters and about whether a control character
 * leaves a gap. A host picks the one that matches what it renders; none is a superset of
 * another. Only `sanitizeLabel` looks at escape sequences at all, and only partly (Node's
 * regex-based `stripVTControlCharacters`); for the other three `ESC` is just a control
 * character, so removing it leaves the rest of the sequence behind as plain text. For
 * untrusted text that can carry whole sequences, run pi-tui's `stripTerminalSequences` first.
 */

/**
 * Delete every Unicode control (Cc) and format (Cf) character.
 *
 * Source: pi-topping `src/util.ts` (`stripControlChars`).
 *
 * Tab and newline go, and so do zero-width joiners, bidirectional overrides, the soft hyphen
 * and the byte-order mark. Nothing is replaced, so neighbouring words join: `a\tb` becomes
 * `ab`. Does not: trim, leave a gap, or remove the printable tail of an escape sequence
 * (`ESC[31m` leaves `[31m`).
 */
export function stripControlChars(text: string): string {
	return text.replace(/[\p{Cc}\p{Cf}]/gu, "");
}

/**
 * A single-line label from untrusted input: a non-string becomes an empty string, a string
 * loses its control and format characters and is trimmed.
 *
 * Source: pi-topping `src/util.ts` (`sanitizedText`).
 *
 * It is `stripControlChars` plus `trim`, so it has the same limits. Does not: collapse runs of
 * spaces, or understand escape sequences.
 */
export function sanitizedText(value: unknown): string {
	return typeof value === "string" ? stripControlChars(value).trim() : "";
}

/**
 * Delete C0 (including tab and newline), DEL and C1 bytes.
 *
 * Source: persona-audit `src/components/AuditProgress.ts` (`sanitizeTerminalText`).
 *
 * Unlike `stripControlChars` it keeps zero-width, bidirectional and other format characters.
 * Nothing is replaced and nothing is trimmed. Does not: keep tab (persona-audit's
 * `sanitizeDiffLine`, which keeps it so git diff lines hold their indentation, stays in
 * persona-audit), or understand escape sequences.
 */
export function sanitizeTerminalBytes(text: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: the point is to match control characters
	return text.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
}

// Everything `sanitizeLabel` turns into a space once Node has stripped the escape sequences:
// C0, DEL, C1, zero-width and directional marks, the line and paragraph separators, the
// bidirectional embeddings and isolates, and the byte-order mark.
const LABEL_BREAKS_RE =
	// biome-ignore lint/suspicious/noControlCharactersInRegex: the point is to match control characters
	/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;

/**
 * Make text safe to show as a short label: terminal sequences are removed with Node's
 * `stripVTControlCharacters`, then every remaining C0, DEL, C1, zero-width, bidirectional and
 * line-separator character becomes a space and runs of spaces collapse to one. A control
 * character leaves a gap rather than joining its neighbours.
 *
 * Source: statusline `src/utils.ts` (`sanitizeLabel`).
 *
 * Does not: trim, so a label written as `TOK ` keeps the space that separates it from its
 * value (statusline's `sanitizeStatusText` is this plus `trim`); remove the payload of every
 * escape sequence (the regex removes CSI and OSC sequences whole, but a DCS, APC, PM or SOS
 * string with spaces or punctuation in its payload can leave that payload behind as text); or
 * turn format characters outside the zero-width, bidirectional and byte-order-mark ranges
 * into spaces (a soft hyphen stays).
 */
export function sanitizeLabel(text: string): string {
	return stripVTControlCharacters(text)
		.replace(LABEL_BREAKS_RE, " ")
		.replace(/ +/g, " ");
}
