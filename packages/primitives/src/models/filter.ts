import { fuzzyFilter } from "@earendil-works/pi-tui";

/**
 * Fuzzy matches ranked best-first, with literal-substring matches stably partitioned to the front.
 * `fuzzyFilter` splits the query on whitespace and slashes, so "anthropic opus" and partial ids
 * both work; an empty query is returned in its original order. Because `fuzzyMatch` scores a greedy
 * first-occurrence path a scattered match can outrank a literal one (e.g. "opus" scoring
 * "anthropic/claude-sonnet" above "anthropic/claude-opus"), hence the partition.
 */
export function fuzzyRanked<T>(
	items: T[],
	query: string,
	key: (item: T) => string,
): T[] {
	const matches = fuzzyFilter(items, query, key);
	const tokens = query
		.trim()
		.toLowerCase()
		.split(/[\s/]+/)
		.filter(Boolean);
	if (tokens.length === 0) return matches;
	const isSubstringMatch = (item: T) => {
		const haystack = key(item).toLowerCase();
		return tokens.every((token) => haystack.includes(token));
	};
	const sub: T[] = [];
	const rest: T[] = [];
	for (const m of matches) (isSubstringMatch(m) ? sub : rest).push(m);
	return [...sub, ...rest];
}
