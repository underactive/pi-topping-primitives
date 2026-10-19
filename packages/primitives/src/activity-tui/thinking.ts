import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";

/** Pi's thinking levels, taken from the theme so this follows the host. */
export type ThinkingLevel = Parameters<Theme["getThinkingBorderColor"]>[0];

// Exhaustive over `ThinkingLevel`, so a level added by pi fails the typecheck here instead of
// silently rendering as the fallback.
const THINKING_LEVEL_THEME_COLORS: Readonly<Record<ThinkingLevel, ThemeColor>> =
	Object.freeze({
		off: "thinkingOff",
		minimal: "thinkingMinimal",
		low: "thinkingLow",
		medium: "thinkingMedium",
		high: "thinkingHigh",
		xhigh: "thinkingXhigh",
		max: "thinkingMax",
	});

/**
 * The theme colour native to a thinking level (`thinkingOff` to `thinkingMax`), so a meter can
 * show reasoning effort at a glance. An unknown or missing level gives the neutral `accent`.
 * Takes any string so a host's own level union fits without a cast.
 */
export function thinkingLevelThemeColor(level: string | undefined): ThemeColor {
	if (
		level === undefined ||
		!Object.hasOwn(THINKING_LEVEL_THEME_COLORS, level)
	) {
		return "accent";
	}
	return THINKING_LEVEL_THEME_COLORS[level as ThinkingLevel];
}

/**
 * A colorizer for a configured colour, including pi's active thinking-level colour when
 * `color` is `"thinking-level"`.
 */
export function thinkingLevelColorizer(
	theme: Pick<Theme, "fg" | "getThinkingBorderColor">,
	color: ThemeColor | "thinking-level",
	thinkingLevel: ThinkingLevel | undefined,
): (text: string) => string {
	return color === "thinking-level"
		? theme.getThinkingBorderColor(thinkingLevel ?? "off")
		: (text: string) => theme.fg(color, text);
}
