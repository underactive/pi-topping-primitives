# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
