#!/bin/sh
# Packaging-recipe re-verification from HANDOFF_PRIMITIVES.md section 3: a dependency shipping both a
# `default` TypeScript source form and a `compiled` JavaScript form.
#
# Adapted from the handoff in two ways, neither of which touches the recipe itself:
#   - PT and ST are overridable. The handoff hardcoded the author's home directory, and the alias
#     must keep pointing at a physically different pi-tui than the fake dependency can resolve.
#   - jiti is located among the known install layouts instead of assuming the nested copy, which
#     disappears as soon as npm hoists it. The resolved path is printed so a wrong one is visible.
#
# Keep the three expectations at the bottom of this file exact.
PT=${PT:-$HOME/Development/projects/pi/pi-topping}
ST=${ST:-$HOME/Development/projects/pi/pi-topping-statusline}

jiti_probe() {
	for candidate in \
		"$PT/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs" \
		"$PT/node_modules/jiti/lib/jiti.mjs" \
		"${PI_ROOT:-$HOME/.pi/agent}/install/releases/$(cat "${PI_ROOT:-$HOME/.pi/agent}/install/current-version" 2>/dev/null)/node_modules/jiti/lib/jiti.mjs" \
		"$(npm root -g 2>/dev/null)/jiti/lib/jiti.mjs"; do
		if [ -f "$candidate" ]; then
			printf '%s' "$candidate"
			return 0
		fi
	done
	return 1
}

JITI=$(jiti_probe) || {
	echo "verify-loader: cannot find jiti/lib/jiti.mjs. Probed:" >&2
	echo "  1. $PT/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti" >&2
	echo "  2. $PT/node_modules/jiti" >&2
	echo "  3. the managed pi install under ${PI_ROOT:-$HOME/.pi/agent}" >&2
	echo "  4. \$(npm root -g)/jiti" >&2
	exit 1
}
echo "jiti: $JITI"

T=$(mktemp -d); P="$T/ext/node_modules/@underactive/fake-prim"; mkdir -p "$P/src" "$P/dist" "$T/ext/tests"
ln -s "$PT/node_modules/@earendil-works" "$T/ext/node_modules/@earendil-works"
cat > "$P/package.json" <<'EOF'
{ "name": "@underactive/fake-prim", "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "compiled": "./dist/index.js", "default": "./src/index.ts" } } }
EOF
printf 'import * as tui from "@earendil-works/pi-tui";\nexport const form = "ts-source"; export const depTui = tui;\n' > "$P/src/index.ts"
printf 'import * as tui from "@earendil-works/pi-tui";\nexport const form = "compiled-js"; export const depTui = tui;\n' > "$P/dist/index.js"
printf 'export declare const form: string;\n' > "$P/dist/index.d.ts"
printf 'import * as host from "@earendil-works/pi-tui";\nimport { form, depTui } from "@underactive/fake-prim";\nexport const r = { form, same: host.visibleWidth === depTui.visibleWidth };\n' > "$T/ext/index.ts"
printf 'import { test } from "node:test";\nimport { form } from "@underactive/fake-prim";\ntest("x", () => console.log("TEST FORM:", form));\n' > "$T/ext/tests/dep.test.ts"
# Expect: jiti -> {"form":"ts-source","same":true}
( cd "$PT" && JITI="$JITI" EXT_ENTRY="$T/ext/index.ts" ALIAS="$ST/node_modules/@earendil-works/pi-tui/dist/index.js" \
	node --input-type=module -e "
import { pathToFileURL } from 'node:url';
const { createJiti } = await import(pathToFileURL(process.env.JITI).href);
const alias = { '@earendil-works/pi-tui': process.env.ALIAS };
const jiti = createJiti(import.meta.url, { moduleCache: false, alias });
console.log('jiti ->', JSON.stringify((await jiti.import(process.env.EXT_ENTRY)).r));" )
# Expect: ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING
( cd "$T/ext" && node --test tests/dep.test.ts 2>&1 | grep -m1 -E "TEST FORM|ERR_" )
# Expect: TEST FORM: compiled-js
( cd "$T/ext" && node -C compiled --test tests/dep.test.ts 2>&1 | grep -m1 "TEST FORM" )
rm -rf "$T"
