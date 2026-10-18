# @underactive/pi-topping-primitives

A library, not an extension.

Shared runtime primitives for the pi-topping family: cross-extension contract constants and parsers, an atomic settings store, activity meter maths and renderers, the settings menu, the model picker, colour, text and glyph helpers, and subprocess helpers.

## Install

Nothing is published yet. Once 0.1.0 is on the registry a topping takes it as a runtime dependency:

```sh
npm install @underactive/pi-topping-primitives
```

That writes a `dependencies` entry. The code is loaded by pi at runtime, so it does not belong in `devDependencies`.

## Subpaths

| Subpath | Planned contents | Phase | Status |
| --- | --- | --- | --- |
| `./contracts` | Channel and entry-type constants, payload parsers, typed `emit` and `subscribe` | 1 | planned |
| `./settings` | Atomic store, directory lock, sanitisers, settings-path helper | 2 | planned |
| `./activity` | Meter maths, output-token accounting, rate hold and fade, run clock, elapsed formatters | 3 | planned |
| `./activity-tui` | Meter rendering, thinking-level colours, shimmer and fade strings, tool-activity text | 3 | planned |
| `./menu` | Lineage-A settings menu: sections, row kinds, validator, keybindings, chrome helpers | 4 | planned |
| `./models` | Model refs, catalogue lookup, thinking-level options, two-pane model and thinking picker | 5 | planned |
| `./color` | RGB and hex parsing, mixing, xterm-256 and ANSI conversion, comet bar, palette constants | 6 | planned |
| `./text` | Padding, truncation, cell fitting, sanitisers, clock, duration and cost formatters | 6 | planned |
| `./glyphs` | Box-drawing sets, spinner frames and frame timing | 6 | planned |
| `./process` | Pi invocation, process pool and kill escalation, version parsing, agent discovery | 7 | planned |

Every subpath is an empty stub (`export {};`) until its phase lands. The release guard refuses to publish while any subpath is still empty, so an unfilled module blocks the release rather than shipping as dead weight.

There is deliberately no root `"."` export. Narrow subpaths keep a contracts-only consumer from transpiling menu code at session start.

## How it loads

Each subpath is a single `exports` entry with three conditions. Key order is the whole mechanism:

```json
"./contracts": {
	"types": "./dist/contracts/index.d.ts",
	"compiled": "./dist/contracts/index.js",
	"default": "./src/contracts/index.ts"
}
```

The same map is read three ways:

| Consumer | Condition matched | Target |
| --- | --- | --- |
| pi's jiti loader | `default` | `src/*/index.ts`, transformed by jiti |
| `node -C compiled` | `compiled` | `dist/*/index.js` |
| the typechecker | `types` | `dist/*/index.d.ts` |

jiti resolves with the ordinary `node`, `import` and `default` conditions, so it takes the TypeScript source and the host's aliases for `@earendil-works/*` apply to this package's own imports as well. Tests set an extra condition with `node -C compiled`, which is listed first and wins over `default`. Nothing in the package or the loader depends on a custom `jiti` condition; the split lives on the test side.

Consequences for consumers:

- Typechecking against the package reads the `types` condition, which `node16`, `nodenext` and `bundler` resolution consult. Set `moduleResolution` to one of those three; classic `node10` resolution ignores `exports` and will not find the package.
- Tests need `-C compiled`. There is no build step on the runtime path: pi reads the source.

## Compatibility

Tested against pi 1.3.0; `peerDependencies` are `*`.

## House rules

- No module-level mutable state, and export tables are deep-frozen. Two copies of the package in one pi process must be harmless, and mutable module state is the only way that breaks.
- No `instanceof` across a package boundary. A class from a second copy is a different class, so the check would silently fail.
- `./contracts` is additive-only forever: names are immutable, payloads append-only, parsers ignore unknown fields. A rename there would break every topping at once.
- Tabs in source, matching `.editorconfig` and `biome.json`, so a module moved out of a topping keeps producing the same diff.
- Relative imports inside `src/` carry the `.js` suffix, which jiti maps onto the `.ts` file and which does not raise TS5097 in consumers that lack `allowImportingTsExtensions`.
- Zero runtime dependencies. The pi packages are `peerDependencies` at `*`, so the host's copy is the only copy.

## Loader verification

This is the record of Phase 0 step 4: the packaging recipe of handoff section 3 reproduced, plus the loader branch that section's experiment did not cover.

Environment: Node 24.18.0, npm 11.16.0, `@earendil-works/pi-coding-agent` 1.3.0, `@earendil-works/pi-tui` 1.3.0, jiti 2.7.0. Date: 2026-10-17.

### Section 3 recipe

The recipe's three expectations, all reproduced:

| Check | Output |
| --- | --- |
| jiti loads the fake dependency | `jiti -> {"form":"ts-source","same":true}` |
| plain `node --test` on a `.ts` entry under `node_modules` | `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` |
| plain `node -C compiled --test` | `TEST FORM: compiled-js` |

### Which pi branch runs which code

`bin.pi` is `dist/bundle/cli.js`. The bundle is built with `PI_BUNDLED_NODE` defined, so `isBundledNode` is `true` in the shipped chunk and the CLI passes `{ virtualModules, tryNative: false }` from `dist/core/extensions/loader.js` (lines 472-476). The unbundled SDK entry `dist/index.js` falls through to `{ alias: getAliases() }` at the same lines.

The section 3 recipe only reproduced the alias branch. The CLI branch was verified separately, by driving `discoverAndLoadExtensions` through each branch in turn.

### Probe

Four rows, with the extension's `node_modules` holding a physically different pi-tui copy, which is the user's symlinked-checkout shape:

| Branch | Form | pi-tui shared with host |
| --- | --- | --- |
| bundled (pi CLI), dual export | ts-source | yes |
| unbundled (SDK), dual export | ts-source | yes |
| bundled (pi CLI), compiled only | compiled-js | **no** |
| unbundled (SDK), compiled only | compiled-js | **no** |

### Conclusions

Both are load-bearing.

1. A `default` target of TypeScript source shares the host pi-tui under both branches, so the section 3 recipe stands unchanged.
2. `tryNative: false` does not make compiled JavaScript safe under the bundled CLI. It governs only the module jiti was asked for, not that module's own bare `@earendil-works/*` specifiers, so a compiled dependency still escapes to Node's resolver and duplicates pi-tui.

With no `@earendil-works` on disk at all, the `pi install npm:` shape, all four rows share. That is exactly the dev-versus-installed inconsistency section 3 fact 2 warns about. The `.ts` default target is therefore required, not merely preferred.

Scope: the evidence covers pi 1.3.0 and Node 24.18.0. The `compiled` condition is the only thing a test-side change can break; the runtime `default` target is fixed by the loader.

### Re-running

```sh
sh scripts/verify-loader.sh
sh scripts/probe-pi-loader.sh
```

Both scripts live in `scripts/` and are added by the Phase 0 tooling lane. Run both after any pi or Node upgrade.

## Consumers

The dev workflow for a topping that depends on this package is in [docs/consumers.md](../../docs/consumers.md).
