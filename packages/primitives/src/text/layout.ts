import { sliceByColumn, visibleWidth } from "@earendil-works/pi-tui";

/** The truncation marker `fitCell` appends. Three ASCII dots, so it is one column each. */
export const ELLIPSIS = "...";

/** Pad with spaces on the right to `width` visible columns. Never truncates. */
export function padRight(text: string, width: number): string {
	return `${text}${" ".repeat(Math.max(0, width - visibleWidth(text)))}`;
}

/** Centre in `width` visible columns; an odd remainder puts the extra space on the right. */
export function padCenter(text: string, width: number): string {
	const total = Math.max(0, width - visibleWidth(text));
	const leftPad = Math.floor(total / 2);
	return `${" ".repeat(leftPad)}${text}${" ".repeat(total - leftPad)}`;
}

/**
 * Truncate to at most `maxWidth` visible columns. Escape sequences never count against the
 * budget and are never split mid-sequence; a wide character straddling the cut is dropped
 * rather than allowed to overflow it.
 */
export function truncateVisible(text: string, maxWidth: number): string {
	return sliceByColumn(text, 0, maxWidth, true);
}

/**
 * Truncate to `width` visible columns and mark the cut with `ELLIPSIS`. A foreground-only reset
 * (`ESC[39m`, never `ESC[0m`) follows the cut, so a colour span the cut landed inside is closed
 * and a surrounding panel background survives; bold and other attributes are not closed. Text
 * that already fits comes back unchanged. Below `ELLIPSIS`'s own width the ellipsis is dropped,
 * but the reset is still written.
 */
export function fitCell(text: string, width: number): string {
	if (visibleWidth(text) <= width) return text;
	if (width < ELLIPSIS.length) {
		return `${truncateVisible(text, Math.max(0, width))}\x1b[39m`;
	}
	return `${truncateVisible(text, width - ELLIPSIS.length)}\x1b[39m${ELLIPSIS}`;
}

/** Join the parts that are present, so absent metadata leaves no dangling separator. */
export function joinParts(
	parts: readonly (string | undefined | null | false)[],
	separator = " · ",
): string {
	return parts.filter((part): part is string => Boolean(part)).join(separator);
}

/**
 * The first candidate that fits `width`, otherwise the last one truncated to fit. Candidates
 * run from most to least informative. An empty list yields an empty string.
 */
export function pickFitting(
	candidates: readonly string[],
	width: number,
): string {
	const fitting = candidates.find(
		(candidate) => visibleWidth(candidate) <= width,
	);
	if (fitting !== undefined) return fitting;
	const last = candidates[candidates.length - 1];
	return last === undefined ? "" : fitCell(last, width);
}

/**
 * Wrap items comma-separated to `width` visible columns. A line that breaks ends in a comma;
 * the last line does not. Returns `[]` for no items. `itemWidths` are the items' visible
 * widths if the caller already has them; otherwise they are measured. An item wider than
 * `width` gets a line of its own and is never cut.
 */
export function wrapCommaDelimited(
	items: readonly string[],
	width: number,
	itemWidths?: readonly number[],
): string[] {
	const safeWidth = Math.max(1, width);
	const widths = itemWidths ?? items.map((item) => visibleWidth(item));
	const lines: string[] = [];
	let current = "";
	let currentWidth = 0;
	for (let i = 0; i < items.length; i++) {
		const item = items[i] ?? "";
		const itemWidth = widths[i] ?? 0;
		const w = itemWidth + (current ? 2 : 0);
		// Reserve one column for the trailing comma added when the line breaks.
		if (current && currentWidth + w + 1 > safeWidth) {
			lines.push(`${current},`);
			current = item;
			currentWidth = itemWidth;
			continue;
		}
		current += current ? `, ${item}` : item;
		currentWidth += w;
	}
	if (current) lines.push(current);
	return lines;
}
