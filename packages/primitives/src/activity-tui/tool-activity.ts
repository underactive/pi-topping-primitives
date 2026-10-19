import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";

/** Default cap on a one-line tool-activity label. */
const ACTIVITY_MAX = 80;

/** Collapse all whitespace and newlines to single spaces and trim. */
function collapseWhitespace(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/**
 * Remove control characters that `stripTerminalSequences` leaves behind, such as a lone ESC or a
 * BEL. Tab through carriage return are kept: the whitespace collapse after it turns them into
 * single spaces.
 */
function stripStrayControls(text: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: removing control characters is the point
	return text.replace(/[\x00-\x08\x0e-\x1f\x7f-\x9f]/g, "");
}

/**
 * Pick the most informative string argument for a one-line activity label.
 * Prefers well-known tool arg names (command, pattern, path, ...); falls back to the first
 * non-empty string value.
 */
function summarizeToolArgs(args: unknown): string {
	if (!args || typeof args !== "object") return "";
	const record = args as Record<string, unknown>;
	const preferred = [
		"command",
		"pattern",
		"query",
		"path",
		"file",
		"glob",
		"dir",
		"url",
		"name",
	];
	for (const key of preferred) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) {
			return collapseWhitespace(value);
		}
	}
	for (const value of Object.values(record)) {
		if (typeof value === "string" && value.trim()) {
			return collapseWhitespace(value);
		}
	}
	return "";
}

/**
 * Format a tool-start event into a single-line "toolName  arg" label.
 *
 * Tool arguments are untrusted model output, so the label is cleaned before it is cut: terminal
 * sequences and stray control characters go first, then whitespace collapses, then the result
 * is capped at `maxLength`. Cutting first would let a cap fall inside an escape sequence and
 * leave a fragment that no stripper recognises.
 */
export function formatToolActivity(
	toolName: string,
	args: unknown,
	maxLength: number = ACTIVITY_MAX,
): string {
	const detail = summarizeToolArgs(args);
	const label = detail ? `${toolName}  ${detail}` : String(toolName);
	return collapseWhitespace(
		stripStrayControls(stripTerminalSequences(label)),
	).slice(0, maxLength);
}

/** The slice of pi's `Theme` `highlightActivity` needs. */
export interface ActivityTheme {
	fg(color: ThemeColor, text: string): string;
	bold(text: string): string;
}

const ACTIVITY_SPLIT = /^(\s*)(\S+)(\s*)([\s\S]*)$/;

/**
 * Highlight a plain activity string as a bold `toolTitle` tool name followed by its `accent`
 * argument, following pi's own read/grep/edit/write renderers. Splits only at the first run of
 * whitespace, the boundary `formatToolActivity` produces between a tool name and its argument,
 * and never rewrites the text on either side, so activity strings stay byte-identical for
 * equality-based loop detection. Falls back to the raw string when no tool token can be found
 * (empty or whitespace-only input).
 */
export function highlightActivity(
	theme: ActivityTheme,
	activity: string,
): string {
	const match = activity.match(ACTIVITY_SPLIT);
	if (!match) return activity;
	const [, leading, tool, sep, detail] = match;
	const styledTool = theme.fg("toolTitle", theme.bold(tool ?? ""));
	return detail
		? `${leading}${styledTool}${sep}${theme.fg("accent", detail)}`
		: `${leading}${styledTool}${sep}`;
}
