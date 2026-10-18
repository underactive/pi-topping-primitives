#!/bin/sh
# Packaging-recipe re-verification from HANDOFF_PRIMITIVES.md section 3: a dependency shipping both a
# `default` TypeScript source form and a `compiled` JavaScript form. Keep the three expectations.
PT=${PT:-$HOME/Development/projects/pi/pi-topping}
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
( cd "$PT" && node --input-type=module -e "
import { createJiti } from './node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs';
const alias = { '@earendil-works/pi-tui': '$HOME/Development/projects/pi/pi-topping-statusline/node_modules/@earendil-works/pi-tui/dist/index.js' };
const jiti = createJiti(import.meta.url, { moduleCache: false, alias });
console.log('jiti ->', JSON.stringify((await jiti.import('$T/ext/index.ts')).r));" )
# Expect: ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING
( cd "$T/ext" && node --test tests/dep.test.ts 2>&1 | grep -m1 -E "TEST FORM|ERR_" )
# Expect: TEST FORM: compiled-js
( cd "$T/ext" && node -C compiled --test tests/dep.test.ts 2>&1 | grep -m1 "TEST FORM" )
rm -rf "$T"
