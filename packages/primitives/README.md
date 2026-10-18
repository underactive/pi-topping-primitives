# @underactive/pi-topping-primitives

A library, not an extension.

Shared runtime contracts for the pi-topping family: cross-extension names, typed payloads, parsers, and event-bus helpers.

## Install

Nothing is published yet. Once 0.1.0 is on the registry a topping takes it as a runtime dependency:

```sh
npm install @underactive/pi-topping-primitives
```

That writes a `dependencies` entry. The code is loaded by pi at runtime, so it does not belong in `devDependencies`.

## Exported subpaths

Version 0.1.0 exports only `./contracts`; there is deliberately no root `"."` export. Future helper subpaths are not part of the package API until their implementation lands and they are added to `exports`.

## Future subpaths

These entries are a roadmap, not current exports:

| Planned subpath | Planned contents | Phase |
| --- | --- | --- |
| `./settings` | `createSettingsStore`, `memorySettingsStore`, `cached`, `atomicWriteFile`, the sanitisers, `toppingSettingsPath` | 2 |
| `./activity` | `ActivityMeter`, `StreamingWordCounter`, `OutputTokenAccount`, `RateHoldFade`, `RunClock`, `easeFade`, `fadeShade`, `slideOutTail`, the elapsed formatters | 3 |
| `./activity-tui` | `dimAttribute`, `colorizeMeterCell`, `renderMeter`, `renderIdleMeter`, `thinkingLevelThemeColor`, `shimmerString`, `ansiToRgb`, `formatToolActivity` | 3 |
| `./menu` | `MenuItem` union (toggle, cycle, number, text, action, pick, reorder), `flattenSections`, `rebuildMenu`, `moveCursor`, `DEFAULT_MENU_KEYBINDINGS`, the chrome helpers, `snapshot` | 4 |
| `./models` | `ModelRef`, `THINKING_LEVELS`, `parseRef`, `getModelCatalogue`, `validateSavedChoice`, `thinkingOptionsForModel`, `TwoPaneModelThinking` | 5 |
| `./color` | `Rgb`, `parseHex`, `mixRgb`, `rgbTo256`, `rgbToFgAnsi`, `ansiToRgb`, `hslToRgb`, the palette constants, `renderCometBar`, the fade helpers | 6 |
| `./text` | `padRight`, `padCenter`, `fitCell`, `truncateVisible`, `pickFitting`, `stripControlChars`, `stableStringify`, the cost and percent formatters | 6 |
| `./glyphs` | `BoxGlyphs`, `BOX_STYLES`, `SPINNER_FRAMES`, `SPINNER_FRAME_MS`, the braille and quadrant spinner sets | 6 |
| `./process` | `resolvePiInvocation`, `escalateKill`, `spawnCollect`, `mapWithConcurrencyLimit`, `parsePiVersion`, `versionAtLeast`, `loadAgentsFromDir`, `findNearestProjectAgentsDir` | 7 |

The repository keeps empty source placeholders for these future phases, but they are not exported and therefore are not reachable through package specifiers in the 0.1.0 API. The release guard refuses to publish any subpath that is present in `exports` but still empty.

## Contracts

`./contracts` is the permanent cross-extension wire registry. The names never change, payloads only gain fields, and parsers ignore unknown fields. The `V1` suffix appears only on versioned payloads; an incompatible change to an unversioned payload takes a new name.

| Name | Value | Publisher | Payload type | Parser / validation |
| --- | --- | --- | --- | --- |
| `CHANNELS.routedModel` | `pi-topping-routesense:routed-model` | routesense | `RoutedModelAnnouncementV1` | `parseRoutedModel` |
| `CHANNELS.workingStatusEmbedded` | `pi-topping-statusline:working-status-embedded` | statusline | `EmbeddedAnnouncement` | `parseEmbeddedAnnouncement` |
| `ENTRY_TYPES.compactSavings` | `pi-topping-compact/savings` | compact | `SavingsEntry` | Consumer validates its fields |
| `ENTRY_TYPES.compactCompactionSavings` | `pi-topping-compact/compaction-savings` | compact | `SavingsEntry` | Consumer validates its fields |
| `ENTRY_TYPES.compactCompaction` | `pi-topping-compact/compaction` | compact | `CompactionOutcomeEntry` | Consumer validates its fields |
| `ENTRY_TYPES.browser` | `pi-topping-web-tools/browser` | web-tools | `BrowserFeedPayload` | Consumer validates its fields |
| `ENTRY_TYPES.splashLocalChanges` | `pi-topping-splash:local-changes` | splash | `unknown` | Name only; payload and strict validator stay local to splash |

`PI_VIRTUAL_MODEL_API` is pi's `VIRTUAL_MODEL_API` string (`pi-virtual`), and `WORKING_STATUS_SLIDE_MS` is the shared 300 ms slide interval. `ChannelPayloads` describes strict emit-side channel payloads; `ParsedChannelPayloads` describes the smaller subscriber shapes. `EntryPayloads` maps entry names to their payload types. The module also exports `Channel`, `EntryType`, `RouteReason`, `RoutedModelAnnouncementV1`, `ParsedRoutedModel`, `EmbeddedAnnouncement`, `SavingsEntry`, `CompactionOutcomeEntry`, `BrowserFeedPayload`, and the structural `EventBusLike` type.

Publish a routed-model announcement without copying or runtime validation:

```ts
emit(pi.events, CHANNELS.routedModel, announcement);
```

Subscribe through the parser; malformed messages are dropped, the returned function unsubscribes, and unknown fields do not escape the parsed shape:

```ts
const unsubscribe = subscribe(pi.events, CHANNELS.routedModel, (routed) => {
	showRoutedModel(routed.provider, routed.modelId, routed.reason);
});
```

The parsers require a non-array object. Routed-model messages must have `version: 1`, non-empty sanitized `provider` and `modelId`, and one of `user`, `continuation`, `retry`, or `direct`; a sanitized empty `thinkingLevel` is omitted. Embed messages require a boolean `embedded` and ignore every other field, including `version`.

The retired names `pi-topping-statusline:compaction-progress-embedded`, `pi-topping-compact:compaction-progress`, and `pi-prompt-cache/savings` are intentionally absent. They are not aliases and must not be reintroduced.

## Releases

Publishing is not tied to a phase. Publish when at least one consumer has to take the package from the registry, either because a topping is installed with `pi install npm:<topping>` or because a consumer's CI installs it. Until then the `--no-save` link or a packed tarball is the development path, and [docs/consumers.md](../../docs/consumers.md) documents both.

At the moment you publish, every subpath still listed in `exports` must export something. Either fill it in that change, or remove it from `exports` first and add it back in the phase that owns it. Removal is allowed by the package-shape guard, which checks that the export keys are a subsequence of the planned list rather than equal to it, deliberately; re-adding is additive, so no consumer breaks. `./contracts` is additive-only forever, so dropping and re-adding a subpath must never remove or rename a name that already shipped.

What enforces the export condition is `prepublishOnly`: it runs `npm test` and `scripts/check-release.ts`, which imports every subpath's `compiled` target and fails on any that exports zero keys, so `npm publish --workspaces` aborts on the stubs instead of shipping them as dead weight. Versioning stays in lockstep with the sibling package: a minor for a phase that changes consumer-visible surface, a patch for a fix.

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

jiti resolves with the ordinary `node`, `import` and `default` conditions, so it takes the TypeScript source and the host's aliases for `@earendil-works/*` apply to this package's own imports as well. Tests set an extra condition with `node -C compiled`, which is listed ahead of `default` and wins over it. (`types` precedes `compiled` in the manifest, but it is not a condition Node matches at runtime, so it never competes with it.) Nothing in the package or the loader depends on a custom `jiti` condition; the split lives on the test side.

Consequences for consumers:

- Typechecking against the package reads the `types` condition, which `node16`, `nodenext` and `bundler` resolution consult. Set `moduleResolution` to one of those three; classic `node10` resolution ignores `exports` and will not find the package.
- Tests need `-C compiled`. There is no build step on the runtime path: pi reads the source.
- The package is ESM only. It is `"type": "module"` with subpath exports and no CommonJS build, so a consumer whose own package is CommonJS, with `moduleResolution: "node16"`, gets TS1479 when it imports this package: the target files are ESM and there is no CJS build to fall back on. Such a consumer must be ESM itself, or use a bundler that converts it.

## Compatibility

Tested against pi 1.3.0; `peerDependencies` are `*`.

## House rules

- No module-level mutable state, and export tables are deep-frozen. Two copies of the package in one pi process must be harmless, and mutable module state is the only way that breaks.
- No `instanceof` across a package boundary. A class from a second copy is a different class, so the check would silently fail.
- `./contracts` is additive-only forever: names are immutable, payloads append-only, parsers ignore unknown fields. An incompatible change to an unversioned payload takes a new name. A rename there would break every topping at once.
- Tabs in source, matching `.editorconfig` and `biome.json`, so a module moved out of a topping keeps producing the same diff.
- Relative imports inside `src/` carry the `.js` suffix, which jiti maps onto the `.ts` file and which does not raise TS5097 in consumers that lack `allowImportingTsExtensions`.
- Zero runtime dependencies. The pi packages are `peerDependencies` at `*`, so the host's copy is the only copy.

## Tests

Two globs, both single-level, so where a test file lives decides whether it runs at all.

- `tests/*.test.ts` runs under `test:src`, with the resolve hook: `node --import ../../tools/ts-resolve.ts --test tests/*.test.ts`. The glob is not recursive, so a file at `tests/contracts/foo.test.ts` would be typechecked, because the package `tsconfig.json` includes `tests/**/*.ts`, and never executed. New source tests go directly in `tests/`.
- `tests/exports/entries.test.ts` runs under `test:exports` with `-C compiled`, imports every exported subpath statically, and must be extended by hand when an export is added or removed: the static import, the `SUBPATHS` list and the `NAMESPACES` record. The test asserts that list equals `Object.keys(exports)` exactly.
- `test:exports` and `typecheck:exports` read `dist/` and do not build it. The package `test` script builds first, so a standalone `npm run test:exports` certifies whatever is already in `dist/`; run `npm run build` before it.

The proof that the resolve hook works is `tests/ts-resolve.test.ts` at the repository root, run by `npm run test:repo`.

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

Four rows, with the extension's `node_modules` holding a physically different pi-tui copy, which is the user's symlinked-checkout shape. The probe drives `<pi-coding-agent>/dist/bundle/index.js`, which is the bundle's SDK entry; the CLI's own entry, `dist/bundle/cli.js`, is not loaded by the probe. Both entries reach the same loader chunk, and the dual-form rows are what the recipe depends on.

| Branch | Form | pi-tui shared with host |
| --- | --- | --- |
| bundled chunk (`bundle/index.js`), dual export | ts-source | yes |
| unbundled SDK (`dist/index.js`), dual export | ts-source | yes |
| bundled chunk (`bundle/index.js`), compiled only | compiled-js | **no** |
| unbundled SDK (`dist/index.js`), compiled only | compiled-js | **no** |

### Conclusions

Both are load-bearing.

1. A `default` target of TypeScript source shares the host pi-tui under both branches, so the section 3 recipe stands unchanged.
2. `tryNative: false` does not make compiled JavaScript safe under the bundled CLI. It governs only the module jiti was asked for, not that module's own bare `@earendil-works/*` specifiers, so a compiled dependency still escapes to Node's resolver and duplicates pi-tui.

`PEERS=absent sh scripts/probe-pi-loader.sh` skips the symlink, so the extension directory resolves no pi packages at all, which reproduces the `pi install npm:` shape: that run produced all four rows `same:true`. It is a second invocation of the same probe, not a different script.

That is exactly the dev-versus-installed inconsistency section 3 fact 2 warns about. The `.ts` default target is therefore required, not merely preferred.

Scope: the evidence covers pi 1.3.0 and Node 24.18.0. The `compiled` condition is the only thing a test-side change can break; the runtime `default` target is fixed by the loader.

### Re-running

```sh
sh scripts/verify-loader.sh
sh scripts/probe-pi-loader.sh
PEERS=absent sh scripts/probe-pi-loader.sh
```

`verify-loader.sh` links the pi packages out of `$PT/node_modules/@earendil-works` and imports jiti, so `$PT` has to point at a checkout that has pi installed. jiti can be hoisted or nested, so the script looks for it in four places — the nested `@earendil-works/pi-coding-agent/node_modules/jiti`, then `$PT/node_modules/jiti`, then the managed release root, then `$(npm root -g)/jiti` — and prints the location it used.

`probe-pi-loader.sh` resolves pi-coding-agent from `$PCA`, then the managed install under `$PI_ROOT`, then the global npm prefix, and prints the one it used. Run both after any pi or Node upgrade.

## Consumers

The dev workflow for a topping that depends on this package is in [docs/consumers.md](../../docs/consumers.md).
