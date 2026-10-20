/**
 * Pi's truthiness rule for an environment flag: `1`, `true` or `yes`, ignoring case. Unset and
 * empty are false, and so is anything else, including a padded `" true "`. This is pi-coding-agent's
 * own `isTruthyEnvFlag`, which web-tools and compact had each copied byte for byte.
 */
export function isTruthyEnvFlag(value: string | undefined): boolean {
	if (!value) return false;
	return (
		value === "1" ||
		value.toLowerCase() === "true" ||
		value.toLowerCase() === "yes"
	);
}

/**
 * True when pi is asked to suppress non-essential notifications (`PI_SUPPRESS_NOTIFICATIONS`).
 * `env` defaults to the live environment and is read on each call, so a test can pass its own.
 */
export function suppressNotifications(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return isTruthyEnvFlag(env.PI_SUPPRESS_NOTIFICATIONS);
}
