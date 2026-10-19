import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { MenuTheme } from "./types.js";

/** Close an OSC 8 link left open by truncation before padding or the right border. */
function closeTruncatedHyperlink(text: string): string {
	let open = false;
	for (const match of text.matchAll(
		// biome-ignore lint/suspicious/noControlCharactersInRegex: matching OSC 8 hyperlink sequences
		/\x1b\]8;[^;\x07\x1b]*;([^\x07\x1b]*)(?:\x07|\x1b\\)/g,
	)) {
		open = (match[1] ?? "") !== "";
	}
	return open ? `${text}\x1b]8;;\x1b\\` : text;
}

/** Truncate to `innerWidth` and pad back out to it. The ellipsis defaults to pi-tui's own. */
function fit(content: string, innerWidth: number, ellipsis?: string): string {
	const shown =
		visibleWidth(content) > innerWidth
			? closeTruncatedHyperlink(truncateToWidth(content, innerWidth, ellipsis))
			: content;
	return shown + " ".repeat(Math.max(0, innerWidth - visibleWidth(shown)));
}

function wrap(
	theme: MenuTheme,
	left: string,
	content: string,
	right: string,
): string {
	return theme.fg("border", left) + content + theme.fg("border", right);
}

function filledLine(
	theme: MenuTheme,
	innerWidth: number,
	left: string,
	right: string,
	fill: string,
	title?: string,
	prefix = "",
	suffix = "",
	bold = false,
): string {
	if (!title)
		return wrap(
			theme,
			left,
			theme.fg("border", fill.repeat(innerWidth)),
			right,
		);
	const titleWidth = Math.max(0, innerWidth - visibleWidth(prefix + suffix));
	const shown =
		visibleWidth(title) > titleWidth
			? closeTruncatedHyperlink(truncateToWidth(title, titleWidth))
			: title;
	const fillCount = Math.max(
		0,
		innerWidth - visibleWidth(prefix + shown + suffix),
	);
	const content =
		theme.fg("border", prefix) +
		theme.fg("text", bold ? theme.bold(shown) : shown) +
		theme.fg("border", suffix + fill.repeat(fillCount));
	// Even a title's fixed punctuation must fit in a very narrow frame.
	return wrap(theme, left, fit(content, innerWidth, ""), right);
}

/**
 * Frozen, host-themed frame helpers. Every width is the nonnegative inner cell
 * width (excluding the two borders); each result fills innerWidth + 2 cells.
 * Content is already styled; helpers add no margin. The component owns selected
 * backgrounds and clips the final frame if the terminal is narrower than two cells.
 */
export const chrome = Object.freeze({
	topBorder(theme: MenuTheme, innerWidth: number, title: string): string {
		return filledLine(
			theme,
			innerWidth,
			"╔",
			"╗",
			"═",
			title,
			"═[ ",
			" ]",
			true,
		);
	},
	sectionDivider(theme: MenuTheme, innerWidth: number, title: string): string {
		return filledLine(theme, innerWidth, "╟", "╢", "─", title, "─ ", " ─");
	},
	separator(theme: MenuTheme, innerWidth: number): string {
		return filledLine(theme, innerWidth, "╟", "╢", "─");
	},
	blankRow(theme: MenuTheme, innerWidth: number): string {
		return wrap(theme, "║", " ".repeat(innerWidth), "║");
	},
	contentRow(theme: MenuTheme, innerWidth: number, content: string): string {
		return wrap(theme, "║", fit(content, innerWidth), "║");
	},
	/** Cursor is zero-based, as in rebuildMenu; the displayed counter is cursor + 1. */
	bottomBorder(
		theme: MenuTheme,
		innerWidth: number,
		cursor: number,
		rowCount: number,
	): string {
		const counter = `[ ${cursor + 1}/${rowCount} ]`;
		const content =
			"═".repeat(Math.max(0, innerWidth - visibleWidth(counter))) + counter;
		return wrap(
			theme,
			"╚",
			theme.fg("border", fit(content, innerWidth, "")),
			"╝",
		);
	},
});
