/**
 * True for a returned `{ error: "…" }` and nothing wider: exactly one own key (symbol and
 * non-enumerable keys count), named `error`, holding a string. A settings object that merely
 * has an `error` field is a value, not a refusal.
 */
export function isRefusal(value: unknown): value is { error: string } {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const keys = Reflect.ownKeys(value);
	return (
		keys.length === 1 &&
		keys[0] === "error" &&
		typeof (value as { error: unknown }).error === "string"
	);
}
