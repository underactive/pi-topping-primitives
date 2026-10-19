/**
 * Pure menu model helpers. Rebuilding restores row order from sections, not an
 * in-progress user reorder: every reorder group's value is re-derived from the
 * rebuilt sections so the published order and the rows on screen agree, and the
 * component resets its private grabbed-row state when it adopts the rebuilt rows.
 * Every other draft value survives by key.
 */
import type {
	CycleItem,
	MenuConfig,
	MenuItem,
	MenuSection,
	MenuValue,
} from "./types.js";

/** A visible row with its original section index; hidden rows never enter this list. */
export interface FlatItem {
	id: string;
	label: string;
	item: MenuItem;
	sectionIndex: number;
}

export function flattenSections(sections: readonly MenuSection[]): FlatItem[] {
	const flat: FlatItem[] = [];
	for (const [sectionIndex, section] of sections.entries()) {
		for (const item of section.items) {
			if (item.hidden) continue;
			flat.push({ id: item.id, label: item.label, item, sectionIndex });
		}
	}
	return flat;
}

/** Ids of every reorder group declared in `sections`. */
function reorderGroups(sections: readonly MenuSection[]): Set<string> {
	const groups = new Set<string>();
	for (const section of sections) {
		for (const item of section.items) {
			if (item.kind === "reorder") groups.add(item.group);
		}
	}
	return groups;
}

/** Seed declared values, including hidden rows, gates and serialized reorder groups. */
export function buildInitialValues(
	config: Pick<MenuConfig, "sections">,
): Record<string, MenuValue> {
	const entries: [string, MenuValue][] = [];
	const groups = new Map<string, string[]>();
	for (const section of config.sections) {
		for (const item of section.items) {
			if (item.kind === "action") continue;
			if (item.kind === "reorder") {
				const ids = groups.get(item.group) ?? [];
				ids.push(item.id);
				groups.set(item.group, ids);
				continue;
			}
			entries.push([item.id, item.value]);
			if (item.kind === "cycle" && item.gate) {
				entries.push([item.gate.id, item.gate.enabled ?? true]);
			}
		}
	}
	for (const [group, ids] of groups) entries.push([group, ids.join(",")]);
	return Object.fromEntries(entries);
}

/** Labels are keyed by raw value, with no positional coupling to the cycle choices. */
export function resolveCycleValueLabel(
	item: Pick<CycleItem, "labels">,
	rawValue: string,
): string {
	return item.labels && Object.hasOwn(item.labels, rawValue)
		? (item.labels[rawValue] ?? rawValue)
		: rawValue;
}

/** First statically enabled row, or 0 for an empty/all-disabled list. */
export function firstEnabledIndex(flat: readonly FlatItem[]): number {
	const index = flat.findIndex(({ item }) => !item.disabled);
	return index === -1 ? 0 : index;
}

/** Move one enabled row without wrapping; dependency-disabled rows remain reachable. */
export function moveCursor(
	flat: readonly FlatItem[],
	from: number,
	delta: 1 | -1,
): number {
	for (
		let index = from + delta;
		index >= 0 && index < flat.length;
		index += delta
	) {
		const row = flat[index];
		if (row && !row.item.disabled) return index;
	}
	return from;
}

/** Input to a rebuild; no values or rows are mutated. */
export interface RebuildState {
	flat: readonly FlatItem[];
	cursor: number;
	values: Readonly<Record<string, MenuValue>>;
	scrollStart: number;
}

/** Fresh rows and values; cursor and scrollStart default to 0 when there are no rows. */
export interface RebuildResult {
	sections: readonly MenuSection[];
	flat: FlatItem[];
	values: Record<string, MenuValue>;
	cursor: number;
	scrollStart: number;
}

/**
 * Preserve surviving values by key (including hidden rows and gate ids), except
 * explicit overwrites and reorder groups, which always take the rebuilt sections'
 * order. Removed keys disappear. Preserve cursor by row id, otherwise clamp its
 * index, then move off a statically disabled row.
 */
export function rebuildMenu(
	sections: readonly MenuSection[],
	previous: RebuildState,
	overwrite?: ReadonlySet<string>,
): RebuildResult {
	const flat = flattenSections(sections);
	const values = buildInitialValues({ sections });
	const groups = reorderGroups(sections);
	for (const id of Object.keys(values)) {
		if (
			overwrite?.has(id) ||
			groups.has(id) ||
			!Object.hasOwn(previous.values, id)
		)
			continue;
		const value = previous.values[id];
		if (value !== undefined) values[id] = value;
	}

	const previousId = previous.flat[previous.cursor]?.id;
	let cursor =
		previousId === undefined
			? -1
			: flat.findIndex(({ id }) => id === previousId);
	if (cursor === -1)
		cursor = Math.max(0, Math.min(previous.cursor, flat.length - 1));
	if (flat[cursor]?.item.disabled) cursor = firstEnabledIndex(flat);
	const scrollStart = Math.max(
		0,
		Math.min(previous.scrollStart, Math.max(0, flat.length - 1)),
	);
	return { sections, flat, values, cursor, scrollStart };
}
