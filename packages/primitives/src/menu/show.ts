import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { MenuComponent } from "./component.js";
import { menuKeybindings } from "./keys.js";
import { buildInitialValues } from "./model.js";
import type { MenuConfig, MenuResult, MenuValue } from "./types.js";

const DEFAULT_WIDTH = "90%";
const DEFAULT_MAX_HEIGHT = "85%";

/**
 * Show the menu as a modal overlay and resolve once a button, Enter or Escape closes it.
 *
 * Requires TUI mode; in any other mode this resolves immediately with `applied: false`
 * and the menu's initial values, doing nothing visible. The menu's keys come from its own
 * manager seeded with the host's user bindings, so `pi-topping.menu.*` ids can be remapped
 * through pi's keybindings file.
 */
export async function showMenu<V extends Record<string, MenuValue>>(
	ctx: ExtensionContext,
	config: MenuConfig<V>,
): Promise<MenuResult<V>> {
	if (ctx.mode !== "tui") {
		return { applied: false, values: buildInitialValues(config) as V };
	}
	return ctx.ui.custom<MenuResult<V>>(
		(tui, theme, keybindings, done) =>
			new MenuComponent<V>(
				config,
				theme,
				done,
				tui,
				menuKeybindings(keybindings),
			),
		{
			overlay: true,
			overlayOptions: {
				width: config.layout?.width ?? DEFAULT_WIDTH,
				maxHeight: config.layout?.maxHeight ?? DEFAULT_MAX_HEIGHT,
			},
		},
	);
}
