// biome-ignore lint/suspicious/noControlCharactersInRegex: matching a terminal escape sequence
const SGR_RE = /\x1b\[[0-9;]*m/g;

/**
 * Remove SGR colour and style escapes (`ESC[...m`). Anything else survives: an OSC 8
 * hyperlink envelope stays in the string, which pi-tui's `stripTerminalSequences` would also
 * remove. Use this to measure or compare styled text; use `stripTerminalSequences` to make
 * untrusted text safe.
 */
export function stripSgr(text: string): string {
	// A global regex keeps `lastIndex`, but `replace` resets it before and after, so one shared
	// instance is safe when it is only ever used here.
	return text.replace(SGR_RE, "");
}
