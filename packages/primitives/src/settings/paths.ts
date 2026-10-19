import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/**
 * `() => <agent dir>/<packageName>/<file>`, resolved on every call because
 * `PI_CODING_AGENT_DIR` may change after import (tests redirect it).
 */
export function toppingSettingsPath(
	packageName: string,
	file = "settings.json",
): () => string {
	return () => join(getAgentDir(), packageName, file);
}
