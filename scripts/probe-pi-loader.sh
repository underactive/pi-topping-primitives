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
# (SUBPATH, default settings) from node_modules through both loader branches. Pass: no load errors
# and the extension reads defaults from an empty store.
if [ -n "$PRIM_TGZ" ]; then
	SUBPATH=${SUBPATH:-settings}
	RP="$T/ext/node_modules/@underactive/pi-topping-primitives"
	mkdir -p "$RP" "$T/untar"
	tar -xzf "$PRIM_TGZ" -C "$T/untar"
	cp -R "$T/untar/package/." "$RP/"
	cat > "$T/ext/index.ts" <<EOF2
import { createSettingsStore, sanitize } from "@underactive/pi-topping-primitives/$SUBPATH";
const store = createSettingsStore<{ n: number }>({
	path: () => "$T/agent/probe.json",
	codec: { sanitize: (raw) => ({ n: sanitize.numberOr(sanitize.isRecord(raw) ? raw.n : undefined, 7) }) },
});
(globalThis as { __fakePrim?: unknown }).__fakePrim = { read: store.read(), wrote: store.update((c) => ({ n: c.n + 1 })).ok };
export default function () {}
EOF2
	[ "$have_bundled" = 1 ] && probe bundle/index.js "REAL $SUBPATH, bundled chunk"
	[ "$have_unbundled" = 1 ] && probe index.js "REAL $SUBPATH, unbundled SDK"
fi
rm -rf "$T"
