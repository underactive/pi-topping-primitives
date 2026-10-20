/** `[major, minor, patch]`. */
export type PiVersion = [number, number, number];

/**
 * The first `major.minor.patch` found anywhere in `output` (`pi 1.3.0`, `v1.3.0\n`), or
 * `undefined`. Ported from moa-fusion. It is unanchored, which is what distinguishes it from
 * `hostBelow`.
 */
export function parsePiVersion(output: string): PiVersion | undefined {
	const match = /(\d+)\.(\d+)\.(\d+)/.exec(output);
	if (!match) return undefined;
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * True when `version` is at or above `minimum`, compared component by component. A missing
 * component counts as 0, so `[1, 2]` is at least `[1, 2, 0]`. Only the first `minimum.length`
 * components are compared.
 */
export function versionAtLeast(
	version: readonly number[],
	minimum: readonly number[],
): boolean {
	for (let i = 0; i < minimum.length; i++) {
		const diff = (version[i] ?? 0) - (minimum[i] ?? 0);
		if (diff !== 0) return diff > 0;
	}
	return true;
}

/**
 * True when `version` is a release older than `minimum`, both read as `major.minor.patch`.
 * Adopted verbatim from pi-topping, which uses it to warn about an old host.
 *
 * Unlike `parsePiVersion` this is anchored: the text, trimmed, must start with three numbers,
 * so `pi 1.2.0` does not parse. A value that does not parse, on either side, cannot be
 * compared and counts as new enough (`false`). A pre-release suffix is ignored. Equal versions
 * are not below. The default for an unparseable version is the opposite of a
 * `parsePiVersion` + `versionAtLeast` check, which reads it as too old; do not substitute one
 * for the other.
 */
export function hostBelow(version: string, minimum: string): boolean {
	const parse = (text: string): number[] | undefined => {
		const match = /^(\d+)\.(\d+)\.(\d+)/.exec(text.trim());
		return match
			? [Number(match[1]), Number(match[2]), Number(match[3])]
			: undefined;
	};
	const actual = parse(version);
	const floor = parse(minimum);
	if (!actual || !floor) return false;
	for (let i = 0; i < 3; i++) {
		const have = actual[i] ?? 0;
		const need = floor[i] ?? 0;
		if (have !== need) return have < need;
	}
	return false;
}
