import {
	type SelectListLayoutOptions,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";

import { THINKING_LEVELS } from "./refs.js";

/**
 * Truncates a slash-namespaced model ref (`provider/accounts/.../model-name`)
 * so the parts that matter to identify the model survive first. Priority:
 * the model name (last segment) is mandatory, then the first segment (the
 * namespace root), then the segment right before the model name, then
 * whatever else still fits. Skipped runs collapse to a single ellipsis.
 */
export function smartTruncateModelLabel(
	text: string,
	maxWidth: number,
): string {
	const ELLIPSIS = "…";
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping SGR escapes
	const ANSI_RE = /\x1b\[[0-9;]*m/g;
	if (visibleWidth(text) <= maxWidth) return text;
	const segments = text.split("/");
	const n = segments.length;
	if (n === 1)
		return truncateToWidth(text, maxWidth, ELLIPSIS).replace(ANSI_RE, "");

	const lastIndex = n - 1;
	const kept = new Set<number>([lastIndex]);
	const priority: number[] = [];
	priority.push(0);
	if (n - 2 > 0) priority.push(n - 2);
	for (let i = 1; i <= n - 3; i++) priority.push(i);

	const render = () => {
		const parts: string[] = [];
		let i = 0;
		while (i < n) {
			if (kept.has(i)) {
				// biome-ignore lint/style/noNonNullAssertion: i is bounded by segments.length
				parts.push(segments[i]!);
				i++;
			} else {
				while (i < n && !kept.has(i)) i++;
				parts.push(ELLIPSIS);
			}
		}
		return parts.join("/");
	};

	let current = render();
	if (visibleWidth(current) > maxWidth) {
		const skeleton = `${ELLIPSIS}/`;
		const budget = Math.max(0, maxWidth - visibleWidth(skeleton));
		return (
			skeleton +
			// biome-ignore lint/style/noNonNullAssertion: split always yields a last segment
			truncateToWidth(segments[lastIndex]!, budget, ELLIPSIS)
		).replace(ANSI_RE, "");
	}

	for (const index of priority) {
		kept.add(index);
		const candidate = render();
		if (visibleWidth(candidate) > maxWidth) {
			kept.delete(index);
			continue;
		}
		current = candidate;
	}
	return current;
}

export const MODEL_LIST_LAYOUT = Object.freeze<SelectListLayoutOptions>({
	truncatePrimary: ({ text, maxWidth }) =>
		smartTruncateModelLabel(text, maxWidth),
});

/** One divider column, with at least one column per pane (bodyWidth >= 3). */
export function modelThinkingPaneWidths(
	bodyWidth: number,
	options: {
		levelWidthLabels?: readonly string[];
		levelPaneTitle?: string;
		marker?: string;
	} = {},
): { left: number; right: number } {
	const divider = 1;
	const longestLevel = (options.levelWidthLabels ?? THINKING_LEVELS).reduce(
		(longest, level) =>
			visibleWidth(level) > visibleWidth(longest) ? level : longest,
		"",
	);
	// One composed inset plus SelectList's two safety columns after its selector.
	const rightMin = Math.max(
		visibleWidth(` ${options.levelPaneTitle ?? "Thinking"}`),
		visibleWidth(`${options.marker ?? "> "}${longestLevel}`) + 3,
	);
	const right = Math.max(
		1,
		Math.min(rightMin, Math.max(1, bodyWidth - divider - 1)),
	);
	return { left: Math.max(1, bodyWidth - divider - right), right };
}
