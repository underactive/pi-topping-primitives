# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
