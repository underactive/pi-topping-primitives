#!/bin/sh
# Drive pi's real extension loader through both of its code paths and record which form of a
# dual-entry dependency each one picks.
#
# The fake dependency ships `default` -> src/index.ts and `compiled` -> dist/index.js, and imports
# pi-tui itself. The extension's node_modules holds a second physical copy of @earendil-works, so a
# row reporting `same:false` means the dependency resolved its own bare specifier to a different
# pi-tui instance than the host did.
#
# The compiled-only rows are `same:false` in BOTH loader branches whenever @earendil-works is
# resolvable on disk next to the extension: `tryNative:false` governs only the module jiti was
# asked for, not that module's own bare specifiers, so the dependency's pi-tui import still resolves
# through the extension's node_modules rather than the host's alias.
#
# PEERS=absent skips the symlink, so the extension directory resolves no pi packages at all. That is
# the `pi install npm:` shape, and it is the run that produced all four rows `same:true`. Without
# that control the claim would rest on an observation no script in this repo could reproduce.
PT=${PT:-$HOME/Development/projects/pi/pi-topping}
ST=${ST:-$HOME/Development/projects/pi/pi-topping-statusline}
PEERS=${PEERS:-present}
T=$(mktemp -d); P="$T/ext/node_modules/@underactive/fake-prim"
mkdir -p "$P/src" "$P/dist" "$T/agent" "$T/cwd"
if [ "$PEERS" = absent ]; then
	echo "peers: absent (no @earendil-works on the extension's resolution path)"
else
	ln -s "$ST/node_modules/@earendil-works" "$T/ext/node_modules/@earendil-works"
	echo "peers: present (a second physical @earendil-works, from $ST)"
fi
printf 'import * as tui from "@earendil-works/pi-tui";\nexport const form = "ts-source"; export const depTui = tui;\n' > "$P/src/inner.ts"
printf 'export { form, depTui } from "./inner.js";\n' > "$P/src/index.ts"
printf 'import * as tui from "@earendil-works/pi-tui";\nexport const form = "compiled-js"; export const depTui = tui;\n' > "$P/dist/index.js"
cat > "$T/ext/index.ts" <<'EOF'
import * as host from "@earendil-works/pi-tui";
import { depTui, form } from "@underactive/fake-prim";
(globalThis as { __fakePrim?: unknown }).__fakePrim = { form, same: host.visibleWidth === depTui.visibleWidth };
export default function () {}
EOF

# Resolve the pi-coding-agent package under test. Three probes, in order: an explicit $PCA, the
# managed install pointed at by $PI_ROOT (default ~/.pi/agent), then the global npm prefix.
pi_root=${PI_ROOT:-$HOME/.pi/agent}
managed=
if [ -f "$pi_root/install/current-version" ]; then
	managed="$pi_root/install/releases/$(cat "$pi_root/install/current-version")/node_modules/@earendil-works/pi-coding-agent"
fi
pca_looks_installed() {
	[ -f "$1/package.json" ]
}
if [ -n "$PCA" ] && pca_looks_installed "$PCA"; then
	: # explicit override wins
elif [ -n "$managed" ] && pca_looks_installed "$managed"; then
	PCA=$managed
else
	global_root=$(npm root -g 2>/dev/null)
	if [ -n "$global_root" ] && pca_looks_installed "$global_root/@earendil-works/pi-coding-agent"; then
		PCA="$global_root/@earendil-works/pi-coding-agent"
	fi
fi
if [ -z "$PCA" ]; then
	echo "probe-pi-loader: cannot find @earendil-works/pi-coding-agent. Probed:" >&2
	echo "  1. \$PCA: ${PCA:-<unset>}" >&2
	echo "  2. managed install: ${managed:-<$pi_root/install/current-version not found>}" >&2
	echo "  3. npm global: ${global_root:-<npm root -g failed>}/@earendil-works/pi-coding-agent" >&2
	echo "Set PCA to the pi-coding-agent package directory and re-run." >&2
	rm -rf "$T"
	exit 1
fi

pca_version=$(node -e 'const fs = require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).version)' "$PCA/package.json")
echo "PCA: $PCA"
echo "pi-coding-agent version: $pca_version"
echo "node: $(node --version)"

# Which of the two loader entry points this release actually has. A missing entry is a property of
# the pi release, not a failure of the recipe, so its rows are skipped with a note. Note that these
# are both SDK entries: `bin.pi` is dist/bundle/cli.js, which this probe never loads. The loader
# lives in a chunk both entries reach, so the branch selection is the same one the CLI takes.
bundled_entry="$PCA/dist/bundle/index.js"
unbundled_entry="$PCA/dist/index.js"
have_bundled=1
have_unbundled=1
[ -f "$bundled_entry" ] || { have_bundled=0; echo "note: skipping the pi CLI branch, no $bundled_entry" >&2; }
[ -f "$unbundled_entry" ] || { have_unbundled=0; echo "note: skipping the SDK branch, no $unbundled_entry" >&2; }

probe() {
	( cd "$T/cwd" && JITI_FS_CACHE=false PI_CODING_AGENT_DIR="$T/agent" node --input-type=module -e "
const { discoverAndLoadExtensions } = await import('$PCA/dist/$1');
const r = await discoverAndLoadExtensions(['$T/ext/index.ts'], '$T/cwd', '$T/agent');
console.log('$2 ->', JSON.stringify(globalThis.__fakePrim), r.errors.map((e) => e.error).join('; '));" )
}
printf '{ "name": "@underactive/fake-prim", "type": "module", "exports": { ".": { "compiled": "./dist/index.js", "default": "./src/index.ts" } } }\n' > "$P/package.json"
# Expect: bundled chunk, dual form -> {"form":"ts-source","same":true}
[ "$have_bundled" = 1 ] && probe bundle/index.js "bundled chunk (bundle/index.js), dual form"
# Expect: unbundled SDK, dual form -> {"form":"ts-source","same":true}
[ "$have_unbundled" = 1 ] && probe index.js "unbundled SDK (dist/index.js), dual form"
printf '{ "name": "@underactive/fake-prim", "type": "module", "exports": { ".": "./dist/index.js" } }\n' > "$P/package.json"
# Expect: bundled chunk, compiled only -> {"form":"compiled-js","same":false} with peers present
[ "$have_bundled" = 1 ] && probe bundle/index.js "bundled chunk, compiled only"
# Expect: unbundled SDK, compiled only -> {"form":"compiled-js","same":false} with peers present
[ "$have_unbundled" = 1 ] && probe index.js "unbundled SDK, compiled only"
# Real-package rows. With PRIM_TGZ set to a packed primitives tarball, load a multi-file subpath
# (SUBPATH, default settings; one of settings, activity, activity-tui, menu, models, color, text,
# glyphs) from node_modules through both loader branches. Pass: no load errors and the extension's
# own calls return what the row expects. activity-tui is the first subpath with a runtime pi-tui
# import of its own, so its rows are the ones that show the dependency resolving pi-tui through the
# host's alias. menu goes further: it constructs a component whose keys go through pi-tui's
# KeybindingsManager, renders it, and presses Enter. models builds the picker from a one-model
# fake registry through registryLevelOptions (pi-ai's getSupportedThinkingLevels), renders at
# width 60 and presses Enter. color has no runtime pi import at all (the rows show that it loads
# and computes with peers absent); text measures a CJK string through pi-tui's visibleWidth and
# sliceByColumn, which is the row that proves the host alias reaches it; glyphs is data only.
# Expect for menu: {"top":true,"rows":7,"result":{"applied":true,"values":{"on":true}}}
# Expect for models: {"rows":2,"pick":{"ref":{"provider":"probe","id":"model"},"thinking":"off"}}
# Expect for color: {"filled":10,"trough":10,"green":"\u001b[38;2;132;197;26m","cube":[0,175,255]}
# Expect for text: {"fit":"日\u001b[39m...","center":"  日本  "}
# Expect for glyphs: {"corner":"╭","frames":10,"frozen":true}
if [ -n "$PRIM_TGZ" ]; then
	SUBPATH=${SUBPATH:-settings}
	RP="$T/ext/node_modules/@underactive/pi-topping-primitives"
	mkdir -p "$RP" "$T/untar"
	tar -xzf "$PRIM_TGZ" -C "$T/untar"
	cp -R "$T/untar/package/." "$RP/"
	case "$SUBPATH" in
	settings)
		cat > "$T/ext/index.ts" <<EOF2
import { createSettingsStore, sanitize } from "@underactive/pi-topping-primitives/$SUBPATH";
const store = createSettingsStore<{ n: number }>({
	path: () => "$T/agent/probe.json",
	codec: { sanitize: (raw) => ({ n: sanitize.numberOr(sanitize.isRecord(raw) ? raw.n : undefined, 7) }) },
});
(globalThis as { __fakePrim?: unknown }).__fakePrim = { read: store.read(), wrote: store.update((c) => ({ n: c.n + 1 })).ok };
export default function () {}
EOF2
		;;
	activity)
		cat > "$T/ext/index.ts" <<EOF2
import { ActivityMeter, RateHoldFade, rateToLevel } from "@underactive/pi-topping-primitives/$SUBPATH";
const meter = new ActivityMeter({ direction: "rtl" });
meter.push(rateToLevel(80));
const rate = new RateHoldFade({ holdMs: 1500, fadeMs: 250, shadeCount: 5, sampleIntervalMs: 100 });
rate.sample(0, 1000);
rate.sample(2, 1100);
(globalThis as { __fakePrim?: unknown }).__fakePrim = { meter: meter.render(), held: rate.display(1100).rate, phase: rate.display(2600).phase };
export default function () {}
EOF2
		;;
	activity-tui)
		cat > "$T/ext/index.ts" <<EOF2
import { ActivityMeter, rateToLevel } from "@underactive/pi-topping-primitives/activity";
import { formatToolActivity, renderMeter } from "@underactive/pi-topping-primitives/$SUBPATH";
const theme = { fg: (color: string, text: string) => "<" + color + ">" + text + "</" + color + ">" };
const meter = new ActivityMeter({ width: 2, direction: "rtl" });
meter.push(rateToLevel(80));
(globalThis as { __fakePrim?: unknown }).__fakePrim = {
	meter: renderMeter(meter, theme, "accent"),
	label: formatToolActivity("bash", { command: "\x1b[31mx" }),
};
export default function () {}
EOF2
		;;
	menu)
		cat > "$T/ext/index.ts" <<EOF2
import { chrome, MenuComponent, menuKeybindings } from "@underactive/pi-topping-primitives/$SUBPATH";
const theme = { fg: (_c: string, s: string) => s, bg: (_c: string, s: string) => s, bold: (s: string) => s, getBgAnsi: () => "" };
let result: unknown;
const menu = new MenuComponent(
	{ title: "Probe", sections: [{ title: "S", items: [{ kind: "toggle", id: "on", label: "On", value: true }] }] },
	theme,
	(value) => { result = value; },
	undefined,
	menuKeybindings(),
);
const lines = menu.render(30);
menu.handleInput("\r");
(globalThis as { __fakePrim?: unknown }).__fakePrim = { top: lines[0] === chrome.topBorder(theme, 28, "Probe"), rows: lines.length, result };
export default function () {}
EOF2
		;;
	models)
		cat > "$T/ext/index.ts" <<EOF2
import { TwoPaneModelThinking, registryLevelOptions } from "@underactive/pi-topping-primitives/$SUBPATH";
const theme = { fg: (_c: string, s: string) => s, bg: (_c: string, s: string) => s, bold: (s: string) => s };
const registry = { getAvailable: () => [{ provider: "probe", id: "model", reasoning: false }] };
const picker = new TwoPaneModelThinking({ theme, refs: [{ provider: "probe", id: "model" }], levelOptions: registryLevelOptions(registry) });
const rows = picker.render(60).length;
if (picker.handleInput("\\r") !== "confirm") throw new Error("models probe did not confirm");
(globalThis as { __fakePrim?: unknown }).__fakePrim = { rows, pick: picker.getSelected() };
export default function () {}
EOF2
		;;
	color)
		cat > "$T/ext/index.ts" <<EOF2
import { NVIDIA_GREEN_HEX, hexToFgAnsi, renderCometBar, xterm256ToRgb } from "@underactive/pi-topping-primitives/$SUBPATH";
const bar = renderCometBar(50, { mode: "truecolor", elapsedMs: 500 });
(globalThis as { __fakePrim?: unknown }).__fakePrim = {
	filled: bar.split("\u258b").length - 1,
	trough: bar.split("\u2591").length - 1,
	green: hexToFgAnsi(NVIDIA_GREEN_HEX, "truecolor"),
	cube: xterm256ToRgb(39),
};
export default function () {}
EOF2
		;;
	text)
		cat > "$T/ext/index.ts" <<EOF2
import { fitCell, padCenter } from "@underactive/pi-topping-primitives/$SUBPATH";
(globalThis as { __fakePrim?: unknown }).__fakePrim = { fit: fitCell("日本語テキスト", 5), center: padCenter("日本", 8) };
export default function () {}
EOF2
		;;
	glyphs)
		cat > "$T/ext/index.ts" <<EOF2
import { BOX_STYLES, SPINNER_FRAMES } from "@underactive/pi-topping-primitives/$SUBPATH";
(globalThis as { __fakePrim?: unknown }).__fakePrim = {
	corner: BOX_STYLES.rounded.topLeft,
	frames: SPINNER_FRAMES.length,
	frozen: Object.isFrozen(SPINNER_FRAMES) && Object.isFrozen(BOX_STYLES.heavy),
};
export default function () {}
EOF2
		;;
	*)
		echo "probe-pi-loader: unknown SUBPATH '$SUBPATH' (expected settings, activity, activity-tui, menu, models, color, text or glyphs)" >&2
		rm -rf "$T"
		exit 1
		;;
	esac
	[ "$have_bundled" = 1 ] && probe bundle/index.js "REAL $SUBPATH, bundled chunk"
	[ "$have_unbundled" = 1 ] && probe index.js "REAL $SUBPATH, unbundled SDK"
fi
rm -rf "$T"
