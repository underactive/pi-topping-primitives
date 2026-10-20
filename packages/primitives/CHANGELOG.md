# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `./process`, each export with the vendored copy it comes from (line numbers are at the Phase 7 base commits: moa-fusion `9f3b187`, persona-audit `e678f0f`, pi-topping `c8e2f3e`):
  - `resolvePiInvocation`, with `PiInvocation`, `PiInvocationVia`, `ResolvedPiInvocation` and `PiProcessFacts`: moa-fusion `src/runtime/runner.ts:76-91` (`getPiInvocation`); `PiInvocation` is also moa-fusion `src/runtime/piCapabilities.ts:10-13`.
  - `escalateKill` and `DEFAULT_KILL_GRACE_MS`: moa-fusion `src/runtime/processPool.ts:6-14`.
  - `createProcessTracker`, `ProcessTracker` and `KillableProcess`: moa-fusion `src/runtime/processPool.ts:3-4,16-34` (`trackedProcesses` and `cleanupTrackedProcesses`).
  - `spawnCollect`, `SPAWN_TIMEOUT_EXIT_CODE`, `SpawnCollectOptions` and `SpawnCollectResult`: pi-topping `src/pi-installer.ts:12-62`.
  - `mapWithConcurrencyLimit`: moa-fusion `src/runtime/processPool.ts:37-57`; persona-audit `src/subprocess.ts:181-199` (without `onStart`).
  - `parsePiVersion`, `versionAtLeast` and `PiVersion`: moa-fusion `src/runtime/piCapabilities.ts:19-31`.
  - `hostBelow`: pi-topping `src/util.ts:14-26`.
  - `parseAgentFile`, `loadAgentsFromDir`, `findNearestProjectAgentsDir`, `AgentDefinition` and `AgentFileOptions`: moa-fusion `src/agents/discovery.ts:13-22,30-104`; persona-audit `src/subprocess.ts:17-26,31-95`.
  - `agents.ts` imports `parseFrontmatter` and `CONFIG_DIR_NAME` from pi-coding-agent at runtime, the second subpath to do so after `./settings`.
- `scripts/probe-pi-loader.sh` takes `SUBPATH=process`. It reads a project agent file through both loader branches; with `PEERS=absent` nothing else on disk can supply pi-coding-agent, so that row shows the host's alias reaching `agents.ts`. The probe spawns nothing.
- `THIRD_PARTY_NOTICES.md` records the MIT licence of pi's `subagent` example, from which `invocation.ts`, `concurrency.ts` and `agents.ts` derive.

### Differences from the vendored copies

- `createProcessTracker()` replaces moa-fusion's exported `trackedProcesses` set. Each extension makes its own registry, so a `/reload` kills only what that extension started and a second copy of the package shares nothing. It has the `Set` methods moa-fusion used (`add`, `delete`, `has`, `size`) plus `cleanup`, which keeps the snapshot-then-clear order of `cleanupTrackedProcesses`.
- `resolvePiInvocation(args, facts?)` returns `via` (`"script"`, `"executable"` or `"path"`) so a host can apply its own policy to the PATH fallback; it wraps no Windows shell. It treats `nodejs` as a generic runtime as well as `node` and `bun`. The basename comparison was already case-insensitive. It always returns fresh arrays, where moa-fusion's returned the caller's.
- `spawnCollect` keeps pi-topping's contract (code 124 and `[timed out after Nms]` on timeout, the error message appended on a spawn error, `code ?? 1` on close) and adds `timedOut`. It decodes UTF-8 across chunk boundaries, resolves `code: 1` for a synchronous spawn throw (such as a NUL in an argument), and escalates through `escalateKill`, whose SIGKILL timer is `unref`'d. A timeout that is zero, negative or not finite starts no timer.
- `mapWithConcurrencyLimit` takes a `readonly` input. A `NaN` or fractional limit now works (`NaN` counts as 1, fractions floor); both vendored copies threw `RangeError` from `new Array`.
- `loadAgentsFromDir` and `parseAgentFile` take a `parseThinking` callback instead of moa-fusion's `isThinkingLevel`, so this subpath does not depend on `./models`, and the `source` label is generic. A malformed file (read failure, bad YAML, a frontmatter that is not a mapping, a non-string `name`, `description`, `tools`, `model` or `thinking`) is skipped and the rest of the directory still loads; both vendored copies let the parser's exception escape, and persona-audit would have crashed on a non-string `name`. YAML `null` counts as absent. The result keeps the vendored key order, with `tools` and `model` always present and `thinking` only when `parseThinking` is given.
- `hostBelow` is adopted verbatim, with its own anchored parse. It is not `versionAtLeast(parsePiVersion(x))`: an unreadable version is new enough there and too old in a `--no-mcp` style check.
- Still deferred: `isPlainObject`, the env-flag and notification helpers, `combineSignals`, `raceAbort`, `createDeadline` and `stableStringify`. The sub-run transports, each host's agent layering and persona-audit's `persona-audit-*` shadow guard stay in the hosts.

## [0.7.0] - 2026-10-20

### Fixed

- Correct `xterm256ToRgb`'s cube levels to `55 + v * 40`, matching xterm and pi-tui; indexed colours no longer produce a channel above 255. Partial fades of indices 17–231 and `parseSgrColor`'s indexed `rgb` now use the corrected values. For example, fading index 39 at 0.9 toward `#121212` previously wrote `2;189;281` and became index 46 in 256-colour mode; it now writes `2;159;231` and stays at index 39. Truecolor sources, `ESC[39m`, the gray ramp, indices 0–16, opacity at or below 0 or at or above 1, `rgbTo256`, and the comet bar remain byte-identical. The 24 recomputed Phase 6 fixture rows are a deliberate output change. This fixes the 0.6.0 Known issue.

## [0.6.0] - 2026-10-20

### Added

- `./color`: `Rgb`, `parseHex`, `mixRgb`, `rgbTo256`, `xterm256ToRgb`, `channelsToFgAnsi`, `rgbToFgAnsi`, `hexToFgAnsi`, `parseSgrColor` (with `SgrColor`), `hslToRgb`, `hsvToRgb`, `wrapDeg`, `fadeRgbToward`, `cosineFalloff`, `shimmerCell` (with `ShimmerCellPalette` and `ShimmerCellOptions`), `SWITCHYARD_PROVIDER`, `NVIDIA_GREEN_HEX`, `NVIDIA_GREEN_DARK_HEX`, `isSwitchyardProvider`, `SYNTHWAVE_GREENS` (with `CometPalette`), `renderCometBar` (with `CometBarOptions`), `BAR_CELLS`, `BAR_FILLED`, `BAR_TROUGH` and the `TerminalColorMode` type. Merged from statusline (`theme.ts`, `rainbow.ts`, `nvidia-green.ts`, `compaction-bar.ts`), compact (`progress-bar.ts`), splash (`reveal.ts`, `color.ts`) and pi-topping (`nvidia-green.ts`). No runtime pi import.
- `./text`: `padRight`, `padCenter`, `truncateVisible`, `fitCell`, `ELLIPSIS`, `pickFitting`, `joinParts`, `wrapCommaDelimited` (splash `text.ts`); `stripSgr` (statusline `footer.ts`); `stripControlChars`, `sanitizedText` (pi-topping `util.ts`), `sanitizeTerminalBytes` (persona-audit `AuditProgress.ts`) and `sanitizeLabel` (statusline `utils.ts`); `formatDurationCompact`, `formatCount`, `formatPercent` (routesense `format.ts`) and `formatCostUsd` (persona-audit and moa-fusion). `layout.ts` imports pi-tui's `visibleWidth` and `sliceByColumn` at runtime; nothing else here needs pi.
- `./glyphs`: `BoxGlyphs`, `BoxStyle`, `BOX_STYLES`, `ASCII_BOX` (statusline `theme.ts`, identical to pi-topping `prompt-decorator.ts`), `SPINNER_FRAMES`, `SPINNER_FRAME_MS` (pi-topping `format.ts`, moa-fusion `BRAILLE_SPINNER_FRAMES`) and `QUADRANT_SPINNER_FRAMES` (moa-fusion, persona-audit `TABLE_FRAMES`).
- `scripts/probe-pi-loader.sh` takes `SUBPATH=color|text|glyphs`. The `text` row measures a CJK string through pi-tui; with `PEERS=absent` nothing else on disk can supply pi-tui, so that row shows the host's alias reaching the subpath.
- `tools/hygiene.ts` treats `color` and `glyphs` as pi-free, so a runtime pi import there fails the scan; `text` stays allowed because `layout.ts` measures with pi-tui. The subpath is now the directory straight under `src`, so a checkout that happens to live under a directory called `color` or `glyphs` no longer makes every file pi-free.

### Differences from the vendored copies

- `rgbToFgAnsi` takes a tuple and a mode, `rgbToFgAnsi(rgb, mode)`. Statusline's took spread channels, `rgbToFgAnsi(r, g, b, mode)`; that form is now `channelsToFgAnsi`, which a hot path calls so that it builds no tuple per colour.
- `mode` is required wherever an escape is written (`hexToFgAnsi`, `renderCometBar`, `fadeRgbToward`). Statusline's `hexToFgAnsi` and compact's bar read pi-tui's capability cache when it was left out; the host now passes `getTerminalColorMode()` itself, so the maths needs no terminal state.
- `parseSgrColor` is a new reader, not `./activity-tui`'s `ansiToRgb`. It covers truecolor, 256-colour and `ESC[39m`, foreground and background, and returns a tagged `SgrColor` or `undefined`. `ansiToRgb` is unchanged: it answers "can this foreground be blended?" with `[r, g, b]` or `null`, and the shimmer and fade rely on that.
- `renderCometBar` is compact's `renderProgressBar` and statusline's `renderCompactionBar` as one function, byte for byte over the 162-case matrix both were captured over. Its elapsed option is `elapsedMs`; both hosts named it `shimmerElapsedMs` and keep that name on their own wrappers.
- `pickFitting([], width)` returns an empty string. Splash's copy threw a `TypeError`.
- `BoxGlyphs` has six readonly fields and no T-junctions; moa-fusion's eight-field box keeps its joins locally. pi-topping's `tl`/`tr`/`bl`/`br`/`h`/`v` are `topLeft`/`topRight`/`bottomLeft`/`bottomRight`/`horizontal`/`vertical`.
- Every exported table is frozen at every level (`BOX_STYLES` and each style, the spinner arrays, `SYNTHWAVE_GREENS` and each colour). The vendored copies were mutable.
- `formatDuration` in routesense is `formatDurationCompact`. routesense's signed `formatCost` (`$0.0042`, `-`) stays in routesense; `formatCostUsd` is persona-audit's and moa-fusion's style.
- `wrapCommaDelimited`, `pickFitting` and `joinParts` accept readonly arrays; `isSwitchyardProvider` accepts a missing argument.
- No token formatter. The toppings use five incompatible styles and the handoff leaves them out until the repos agree.
- `easeFade`, `FADE_SHADE_COUNT`, `formatElapsedClock`, `formatElapsedUnits` and `dimAttribute` are not repeated here; they shipped in `./activity` and `./activity-tui`.
- The spinner tables are frozen `readonly` tuples, not `string[]`. They do not satisfy an API typed as a mutable array (pi-tui's `Loader` `frames` option is one); pass `[...SPINNER_FRAMES]`. `Rgb`, the `rgb` of an `SgrColor`, and every `CometPalette` field are `readonly` tuples too, while `parseHex`, `mixRgb`, `hslToRgb`, `hsvToRgb` and `xterm256ToRgb` return mutable ones.
- `shimmerCell` takes optional `bandHalf`, `peakAlpha` and `boldAbove` (5, 0.9 and 0.2, splash's constants); splash passes its own through a frozen options object so a cell builds none.
- Inputs the vendored copies mishandled are now defined. Neither host reaches them (splash passes `Math.abs(i - pos)` with its fixed band, and statusline only fades while `leftFade < 1`, which a NaN fails), so no host's output changes:
  - `shimmerCell` and `cosineFalloff` read a distance as a magnitude. Before, a negative distance wrapped round the cosine (a distance of -7 glowed at about a third of the crest and went bold), and a `bandHalf` of 0 wrote `NaN` into the escape. A zero or negative band, or a non-finite distance, is all base ink.
  - `fadeRgbToward` with a NaN opacity returns the text unchanged; the vendored fade wrote `NaN` into every channel. `mixRgb` with a NaN amount reads it as 0.
  - `renderCometBar` reads NaN and both infinities as 0%, as compact's copy always did; the README now says so.

### Known issues

- `xterm256ToRgb` computes the cube levels as `55 + v * 51`; xterm's are `55 + v * 40`. Every non-zero level reads brighter than the terminal draws it, and levels 4 and 5 come out as 259 and 310, above 255. This is statusline's arithmetic, kept so faded colours match byte for byte. It reaches `fadeRgbToward` and the `rgb` that `parseSgrColor` reports for an indexed colour. In the fade, a colour with a level-5 component (index 39's blue is 310) passes 255 once the opacity is high enough, about 0.81 toward statusline's `#121212`; that writes an out-of-range channel in truecolor mode and lands one cube step high in 256-colour mode. Correcting it changes every faded colour that started as a 256-colour escape, so it is a separate, deliberate change, and `tests/color-rgb.test.ts` pins the current values as a defect.
- `sanitizeLabel` strips escape sequences with Node's regex-based `stripVTControlCharacters`, which removes CSI and OSC sequences whole but can leave the payload of a DCS, APC, PM or SOS string behind as text when it holds spaces or punctuation. pi-tui's `stripTerminalSequences` covers a different subset; run it first on untrusted text.
- `formatDurationCompact` and `formatPercent` print `NaN` for NaN, as routesense's copies did.

## [0.5.0] - 2026-10-19

### Added

- `./models`: the model-reference and thinking vocabulary, label/codecs, cached registry catalogue, saved-choice validation, thinking-policy helpers, fuzzy ranking, namespace-aware label truncation, pane geometry and generic `TwoPaneModelThinking` body with host-owned framing and policy. `SUBPATH=models` exercises the picker and registry bridge through both real pi loader branches.

### Differences from the vendored copies

- Escape is the only default back key; `backKeys` permits explicit Ctrl+C. Keys are physical, not new keybinding ids.
- `isModelRef` requires non-empty provider and id strings. `parseRef` stays lenient; sensei's separate slash/colon codec retains its trailing-separator acceptance.
- Themes are structural and SelectList colours derive from the host, with an optional `selectTheme` override. Selected rows use a sentinel, so marker-like label text cannot create spurious background highlights. `highlightSelectedRow` defaults true and can be disabled.
- A generic level vocabulary, `levelWidthLabels`, `itemLabel`, custom pane titles, filtering and printable-input hooks support host policy without subclassing. Frames, warnings, persistence and overlays remain local.
- A single documented registry-keyed WeakMap caches a first-wins sorted snapshot. Catalogue arrays and ref objects are copied; unknown refs return no levels. A host fallback applies to any empty filtered level list, not only undefined input.
- The asymmetric panes have one-column insets and smart namespace truncation. Every row fits the body width; the row cap includes filter/header/scroll chrome. Resizing and matching filters preserve selection. Default level policy retains the previous offered level, but hosts can override it.
- Row budgeting reserves scroll information at equality as well as overflow. When items exactly fill the available list space this shows one fewer item plus a scroll row; it lets hosts preserve an exact item cap without cropping the selected row.
- Empty Select is inert, never Cancel. Printable paste and kitty text filter from any pane, including buttons; Backspace removes one code point. C0, DEL, C1 and control sequences are rejected by the default decoder.
- Footer hints wrap and remain unframed. Without `requestRender`, dispatch and rendering are render-pure for owners that schedule their own repaint. Public `selection` and detached `snapshot` replace private-field reads.

## [0.4.0] - 2026-10-19

### Added

- `./menu`: `MenuComponent`, `showMenu`, the `MenuItem` union (`toggle`, `cycle`, `number`, `text`, `action`, `pick`, `reorder`), `MenuConfig`, `MenuButton`, `MenuRebuild`, `PreviewSlot`, `MenuResult`, `MenuSnapshot`, `MenuTheme`, `MenuTui`, the pure model helpers (`flattenSections`, `buildInitialValues`, `resolveCycleValueLabel`, `firstEnabledIndex`, `moveCursor`, `rebuildMenu`), the frozen `chrome` frame helpers, `DEFAULT_MENU_KEYBINDINGS` and `menuKeybindings`. Merged from the lineage-A copies in pi-topping-routesense (the base), pi-topping, pi-topping-bash-gate, pi-topping-statusline and pi-topping-splash. Runtime pi-tui imports: `KeybindingsManager`, `Key`, `decodeKittyPrintable`, `truncateToWidth`, `visibleWidth` and `wrapTextWithAnsi`.
- The `pi-topping.menu.*` key ids are registered on pi-tui's `Keybindings` interface and can be remapped through the user's keybindings. The menu matches keys through its own `KeybindingsManager`, seeded with the host's user bindings, because the host's manager only answers for the ids it was built with.
- `scripts/probe-pi-loader.sh` takes `SUBPATH=menu`, which constructs a `MenuComponent` through pi's loader, renders it and presses Enter.

### Differences from the vendored copies

- Number rows hold numbers: `MenuValue` is `boolean | string | number`, `NumberItem.value` and `presets` are numbers, and the typed editor accepts whole numbers only. pi-topping and bash-gate published decimal strings.
- Every menu uses one button bar, right-aligned between two rules (splash's look). `MenuButton.applies` runs `validate` and closes with `{ applied: true, action }`; `closeOnAction` closes with `{ applied: false, action }` and the draft; a plain button runs `onAction` and stays open.
- One navigation behaviour: Up/Down stop at the ends (statusline and splash wrapped), cycle rows always wrap (routesense stopped), and PgUp/PgDn move one visible screenful (routesense moved ten rows). There is no per-menu or per-item wrap switch.
- Enter on a toggle or cycle row applies only when `enterApplies` is true, which defaults to "there are no buttons". Enter on a reorder row grabs or releases it, and on a number or text row opens the editor; pi-topping and bash-gate applied from any row.
- Escape and Ctrl+C close with `applied: false` and the current draft. Every copy returned the initial values; a caller that wants them still has them.
- The overlay defaults to 90% wide and 85% high (`layout.width` / `layout.maxHeight`). pi-topping and bash-gate used 86% wide; statusline and splash used 100% high; splash used a fixed 76 columns.
- The marker is `❯` everywhere (statusline used `>`).
- Previews are a `PreviewSlot` with `title` and `render(values, { elapsedMs, activeItemId, width })`. `width` is the full inner width and the menu adds no margin; a caller that wants the old one-space indent adds it. The legacy `string[]` return and `previewIntervalMs` are gone.
- A failing `onAction` or `onPick`, or a synchronous throw, shows `✗ <message>` in the hint block until the next key and is never re-thrown. routesense re-threw async rejections.
- The hint block renders whenever a row or button has a hint or there is a message to show, so a validation error is visible in a menu without hints. The number editor's error moves from the hints row into that block.
- Cycle labels are a `Record` keyed by value (`CycleItem.labels`); routesense's index-aligned array is gone. Gates are `CycleItem.gate` (`id`, `enabled`, `disabledValue`) instead of `cycleEnabledBy` / `cycleEnabled` / `cycleDisabledValue`.
- Ungated cycle rows and number rows carry no checkbox (routesense's look); pi-topping and bash-gate drew `[■]` on them. Pick rows render `value ›` without a checkbox.
- `disabled` (dimmed, shows its reason, skipped by the cursor) and `disabledUnlessAnyOf` (reachable, inert, a toggle shows a forced muted ON without changing its value) stay separate.
- Reorder rows publish only `values[group]`; the grabbed state is not a value. A rebuild from `onAction` or `onChange` resets an in-progress reorder to the sections' order, and `onChange` does not fire on reorder moves.
- `onPick` keeps the menu mounted: the row shows busy, every key is ignored until the picker settles, a string result is stored and fires `onChange`, and `undefined` keeps the value. splash closed and reopened its menu around the picker.
- `clearValue` lives on pick and text rows only; `initialCursor` picks the starting row.
- Text labels wrap onto continuation lines instead of truncating with an ellipsis (routesense's layout); statusline's tail-scrolling caret is not kept because the wrapped field keeps the caret visible.
- The theme is the structural `MenuTheme` (`fg`, `bg`, `bold`, `getBgAnsi`), and `showMenu` takes an `ExtensionContext`.
- `snapshot()` returns detached `values`, `cursorId`, `rowCount`, `editing`, `focus` and `busy`, replacing the private-field reads in statusline's tests.
- Not shipped from the handoff's §3b sketch: `CycleItem.wrap`, `layout.marker`, `layout.previewTitle`, `NumberItem.integer` and `config.keys`.

## [0.3.0] - 2026-10-19

### Added

- `./activity`: `ActivityMeter` (`direction`, `width`, `levels()` / `setLevels()`), `ActivityMeterLevel`, `METER_GLYPHS`, `rateToLevel` (with `nonFiniteRate: "idle"`), the meter bound constants, `TokRateTracker`, `RateHoldFade`, `StreamingWordCounter`, `OutputTokenAccount`, `RunClock` (with `nested`), `bindUIPromptWaits`, `MIN_WAIT_DISPLAY_MS`, `easeFade`, `fadeShade`, `FADE_SHADE_COUNT`, `slideOutTail`, `formatElapsedUnits` (with `includeDays` and `fillLowerUnits`) and `formatElapsedClock`. Merged from the five vendored copies in pi-topping, pi-topping-statusline, pi-topping-moa-fusion, pi-topping-persona-audit and pi-topping-sensei. Pi is imported for types only.
- `./activity-tui`: `colorizeMeterCell`, `renderMeter`, `renderIdleMeter`, `dimAttribute`, `thinkingLevelThemeColor`, `thinkingLevelColorizer`, `shimmerString`, `fadeThemeColorString`, `ansiToRgb`, `formatToolActivity` and `highlightActivity`. The first subpath with a runtime pi-tui import (`stripTerminalSequences`).
- `scripts/probe-pi-loader.sh` takes `SUBPATH=settings|activity|activity-tui` for its real-package rows and fails on any other value.

### Changed

- The default meter ceiling is an inclusive 80 tokens per second (`DEFAULT_METER_UPPER_BOUND_TPS`). The MoA and persona-audit widgets used 40; `LEGACY_METER_UPPER_BOUND_TPS` keeps that scale available.
- `ansiToRgb` is unanchored: it finds a truecolor foreground inside a compound SGR. The persona-audit and moa-fusion copies required the whole string to be one escape.
- `OutputTokenAccount` ignores exact usage that is negative, NaN or infinite and falls back to its word-count estimate. persona-audit's copy accepted any number.
- `formatToolActivity` strips terminal sequences and stray control characters before it truncates. persona-audit's copy did not sanitise at all, and moa-fusion's stripped after cutting, which could leave half of an escape sequence.

## [0.2.0] - 2026-10-19

### Added

- `./settings`: `createSettingsStore`, `memorySettingsStore`, `atomicWriteFile`, `fileStamp`, `sanitize`, `toppingSettingsPath`, `acquireDirLock`, `releaseDirLock`, `dirLockStale`, `isProcessAlive`, and the store types. Generalised from routesense's store and lock; locked `update()`, refuse-on-corrupt, one-time version backups, stamp-validated `cached()`.

## [0.1.0] - 2026-10-19

### Added

- `./contracts` for 0.1.0: `CHANNELS`, `Channel`, `ENTRY_TYPES`, `EntryType`, `PI_VIRTUAL_MODEL_API`, `WORKING_STATUS_SLIDE_MS`, `RouteReason`, `RoutedModelAnnouncementV1`, `ParsedRoutedModel`, `EmbeddedAnnouncement`, `ChannelPayloads`, `ParsedChannelPayloads`, `SavingsEntry`, `CompactionOutcomeEntry`, `BrowserFeedPayload`, `EntryPayloads`, `EventBusLike`, `parseRoutedModel`, `parseEmbeddedAnnouncement`, `emit`, and `subscribe`.
- Package scaffold: `./contracts` uses the TypeScript source by default and has a matching compiled `dist` target. Future helper subpaths stay out of `exports` until their phase lands. Tested against pi 1.3.0 by hand, with `scripts/probe-pi-loader.sh` and `scripts/verify-loader.sh`; neither runs in CI.

### Changed

- Limit the 0.1.0 export map to the implemented `./contracts` API.
