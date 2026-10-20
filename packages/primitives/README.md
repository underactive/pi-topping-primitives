# @underactive/pi-topping-primitives

A library, not an extension.

Shared runtime pieces for the pi-topping family: cross-extension contracts (names, typed payloads, parsers, event-bus helpers), the atomic settings store, the token-activity meter, rate readout and their renderers, the box-drawing settings menu, model pickers, colour maths, text layout and sanitisers, and glyph tables.

## Install

Version 0.1.0 (contracts only) is published; 0.2.0 adds `./settings`; 0.3.0 adds `./activity` and `./activity-tui`; 0.4.0 adds `./menu`; 0.5.0 adds `./models`; 0.6.0 adds `./color`, `./text` and `./glyphs`; 0.7.0 corrects `xterm256ToRgb`'s cube levels; 0.8.0 adds `./process`; 0.9.0 adds `./env` and `./abort`. A topping takes it as a runtime dependency:

```sh
npm install @underactive/pi-topping-primitives@^0.9.0
```

That writes a `dependencies` entry. The code is loaded by pi at runtime, so it does not belong in `devDependencies`.

## Exported subpaths

The package exports `./contracts`, `./settings`, `./activity`, `./activity-tui` (the last two from 0.3.0), `./menu` (from 0.4.0), `./models` (from 0.5.0), `./color`, `./text` and `./glyphs` (from 0.6.0), `./process` (from 0.8.0), and `./env` and `./abort` (from 0.9.0); there is deliberately no root `"."` export. Future helper subpaths are not part of the package API until their implementation lands and they are added to `exports`. None is planned.

## Settings

`./settings` is an atomic JSON settings file with a validating codec, generalised from routesense's store.

```ts
import { createSettingsStore, sanitize, toppingSettingsPath } from "@underactive/pi-topping-primitives/settings";

const store = createSettingsStore<Settings>({
	path: toppingSettingsPath("pi-topping-bash-gate"),
	codec: {
		sanitize: (raw) => {
			const r = sanitize.isRecord(raw) ? raw : {};
			return { enabled: r.enabled !== false, limit: sanitize.numberOr(r.limit, 50, { min: 1, integer: true }) };
		},
	},
});

store.read();                                  // never throws; defaults when missing or corrupt
store.update((c) => ({ ...c, limit: 10 }));    // locked read-modify-write
```

| Export | Purpose |
| --- | --- |
| `createSettingsStore(options)` | `path()`, `read()`, `write(value)`, `update(change)`, `stamp()`, `cached()` |
| `memorySettingsStore(initial)` | The same interface in memory, for tests |
| `atomicWriteFile(path, text, mode?)` | Unique temp file plus rename; throws on failure; default modes 0600 file, 0700 directory (an existing directory is never chmodded) |
| `fileStamp(path)` | `mtimeMs:size:ino` or `undefined` |
| `sanitize` | `isRecord`, `booleanOr`, `numberOr(value, fallback, { min, max, exclusiveMin, integer })`, `enumOr`, `stringList`, `onOff`. Out-of-range values fall back; they are never clamped |
| `toppingSettingsPath(pkg, file?)` | `() => <agent dir>/<pkg>/<file>`, resolved on every call |
| `acquireDirLock`, `releaseDirLock`, `dirLockStale`, `isProcessAlive` | The directory lock behind `update()` |

| Option | Default | Meaning |
| --- | --- | --- |
| `path` | required | `() => string`, resolved on every operation |
| `codec` | required | `sanitize(raw, diagnose)`, optional `serialize`, `preserveUnknownKeys`, `version` (below) |
| `pathEnv` | none | A non-empty value of this environment variable replaces `path()` |
| `maxBytes` | none | Larger files read as missing and make `update()` refuse |
| `mode` | `{ file: 0o600, dir: 0o700 }` | Applied to files and to directories this call creates; an existing directory is never chmodded |
| `onDiagnostic` | dropped | Receives every non-fatal problem; a throwing sink is ignored. Nothing is ever printed |
| `lock` | `true` | Lock `update()` with `<path>.lock`; `false` skips it; an object tunes `attempts`, `retryMs`, `missingOwnerStaleMs` and the like |

| Codec field | Default | Meaning |
| --- | --- | --- |
| `sanitize(raw, diagnose)` | required | `raw === undefined` means missing or unreadable. It returns the defaults for `undefined` and must not throw |
| `serialize(value)` | two-space JSON plus a trailing newline | Custom text, for example tab-indented |
| `version` | none | `{ key, current, backupBelow?, backupPath? }`: the version key is written first; a file whose stored version is not a number `>= backupBelow` is copied once (default `<stem>.v<stored>.<ext>`) before it is replaced, and an existing backup is kept |
| `preserveUnknownKeys` | `false` | Keep top-level keys the value does not mention. Needs a serializer that writes every own key of what it is given |

Semantics:

- `write()` replaces the file with no lock. `update()` takes `<path>.lock` (a directory holding `owner.json`), reads the file, runs your change and writes. It refuses, leaving the file byte-identical, when the file exists but is not valid JSON (`<path> is not valid JSON (…); fix or remove it before saving`), when the change throws, or when it returns `{ error }`. A settings type must not itself have the shape `{ error: string }`.
- Results are values: `{ ok: true, value, stamp }` or `{ ok: false, reason: "busy" | "refused" | "write_failed", message }`.
- A lock whose owner is a dead pid on this host is reclaimed at once; an unreadable owner, or one on another host, only after 10 s. Under contention `update()` waits synchronously, up to about 1 s, so it blocks the event loop for that long.
- `cached()` re-reads when the file stamp moves or after `invalidate()`, and `onChange` fires for external edits and for the store's own writes.
- There is no module state, so two copies of the package in one process interoperate through the filesystem.
- `./settings` imports `getAgentDir` from the pi-coding-agent peer at runtime; it and `./process` (its `agents.ts`) are the two subpaths that import pi-coding-agent at runtime. (`./activity-tui` imports one runtime function from pi-tui, below.)

## Activity

`./activity` is the token-activity maths behind pi-topping's working indicator and the MoA and audit progress tables: a scrolling meter, an EMA rate tracker with a hold-and-fade readout, token accounting from a message stream, and a run clock. It has no rendering; `./activity-tui` turns it into coloured strings. Pi is imported for types only.

```ts
import { ActivityMeter, RateHoldFade, rateToLevel } from "@underactive/pi-topping-primitives/activity";
import { renderMeter } from "@underactive/pi-topping-primitives/activity-tui";

const meter = new ActivityMeter({ direction: "rtl" });
const rate = new RateHoldFade({ holdMs: 1_500, fadeMs: 250, shadeCount: 5, sampleIntervalMs: 100 });

// from your own 100 ms timer, with `total` the cumulative output-token estimate:
if (rate.sample(total, now)) meter.push(rateToLevel(rate.tracker.tokenRate));
const shown = rate.display(now); // { rate, phase: "active" | "fading" | "idle", fadeShade }
const cells = renderMeter(meter, theme, "accent");
```

| Export | Purpose |
| --- | --- |
| `ActivityMeter`, `ActivityMeterLevel`, `METER_GLYPHS` | An eight-cell braille meter. `push`, `render(colorize?)`, `setDirection`, `reset`, `levels()` and `setLevels()` for snapshots |
| `rateToLevel(tps, upperBoundTps?, options?)` | Rate to level. Rates at or above the bound are full; the lower levels scale in proportion |
| `DEFAULT_METER_UPPER_BOUND_TPS` (80), `LEGACY_METER_UPPER_BOUND_TPS` (40), `METER_UPPER_BOUND_TPS_MIN` (10), `METER_UPPER_BOUND_TPS_MAX` (1000), `ACTIVITY_METER_WIDTH` (8) | The constants. The min and max are the range a settings UI should offer; `rateToLevel` does not clamp |
| `TokRateTracker` | EMA (alpha 0.4) of a cumulative token total: `sample(total, now)`, `tokenRate`, `reset()` |
| `RateHoldFade` | Holds the last measured rate, fades it, then goes idle. `sample(total, now)` returns whether a sample was taken; `display(now)`, `resetSampling(total)`, `reset()`, and the `tracker` it owns |
| `StreamingWordCounter` | Whitespace-boundary word count that survives a word split across deltas, per stream |
| `OutputTokenAccount` | Confirmed plus in-flight tokens from `messageStart`, `messageUpdate(event, partial?)`, `messageEnd`; `snapshot()` is `{ tokens, revision }` |
| `RunClock`, `bindUIPromptWaits`, `MIN_WAIT_DISPLAY_MS` | Active work time excluding spans spent waiting on the user; `bindUIPromptWaits(pi, () => clock)` brackets it around pi's UI prompts |
| `easeFade`, `fadeShade`, `FADE_SHADE_COUNT`, `slideOutTail` | Raised-cosine ease, the discrete shade for an elapsed time, and the tail-first slide-in of a label |
| `formatElapsedUnits`, `formatElapsedClock` | `4m 46s` and `4:46` |

| Option | Default | Meaning |
| --- | --- | --- |
| `new ActivityMeter({ direction })` | `"ltr"` | `"rtl"` puts the newest cell on the right |
| `new ActivityMeter({ width })` | `8` | Anything but a positive integer reads as 8 |
| `rateToLevel(…, { nonFiniteRate: "idle" })` | off | NaN and both infinities read idle. Off, +Infinity reads full |
| `new RateHoldFade({ holdMs, fadeMs, shadeCount, sampleIntervalMs })` | all four required | The hold, the fade, its discrete steps, and the minimum gap between samples |
| `new RunClock({ nested })` | `false` | Count overlapping `pause()` calls; the wait span closes with the outermost `resume()` |
| `formatElapsedUnits(ms, { includeDays })` | `true` | Off, hours keep counting: `25h`, not `1d 1h` |
| `formatElapsedUnits(ms, { fillLowerUnits })` | `false` | On, every unit below the largest shown stays: `1h 0m 0s`, not `1h 0s` |

Semantics:

- Every time-dependent call takes `now` (or an injected `now()`), so nothing schedules anything and tests drive the clock directly.
- The meter ceiling is **inclusive**. At the default 80 tps, exactly 80 reads full. Before 0.3.0 the MoA and audit widgets used a 40 tps ceiling; pass `LEGACY_METER_UPPER_BOUND_TPS` where that look must be kept.
- `RateHoldFade` holds a rate only when the total grew since the last sample, so the EMA decaying while output is quiet never re-arms the hold. `resetSampling(total)` restarts the EMA at a message boundary without touching the held rate, so a correction to the total does not read as a burst.
- `OutputTokenAccount` takes exact usage when it is a finite number `>= 0` on a finished message, or finite and `> 0` on an in-flight partial; anything else (negative, NaN, infinite) falls back to the word-count estimate. `revision` bumps when exact usage replaces a differing estimate, so a consumer can reset its tracker.
- `levels()` is in display order for the meter's direction; restore it into a meter of the same direction and width. An entry that is not an integer from 0 to 7 restores as idle.
- There is no module state, and every exported object is frozen. The one runtime import outside this directory is `WORKING_STATUS_SLIDE_MS` from `./contracts`.

## Activity TUI

`./activity-tui` renders `./activity` against a pi theme. Colour is always the host's: every function takes a theme, or a structural stub of the one or two methods it uses.

| Export | Purpose |
| --- | --- |
| `colorizeMeterCell`, `renderMeter(meter, theme, colorize, dimmed?)`, `renderIdleMeter(theme, width?)` | Idle cells render dim; the rest use `colorize`, which is a `ThemeColor` or a function (such as pi's thinking-border colour). `dimmed` darkens the active cells with SGR 2 on top of their colour |
| `dimAttribute(text)` | `ESC[2m … ESC[22m`; `theme.fg("dim", …)` sets a grey instead, so it cannot darken an existing colour |
| `thinkingLevelThemeColor(level)` | `thinkingOff` to `thinkingMax` for a level; any other string or `undefined` gives `accent` |
| `thinkingLevelColorizer(theme, color, level)` | A colorizer for a configured colour, including `"thinking-level"`, which follows pi's active thinking colour |
| `shimmerString`, `fadeThemeColorString`, `ansiToRgb` | The light-sweep shimmer, a colour-to-dim fade shade, and the truecolor escape parser they share |
| `formatToolActivity(tool, args, maxLength?)`, `highlightActivity(theme, label)` | A one-line `tool  argument` label from a tool call, and its bold-name, accent-argument rendering |

Semantics:

- `ansiToRgb` reads a truecolor foreground (`ESC[38;2;R;G;Bm`) anywhere in the string, including inside a compound SGR, and returns `null` for 256-colour, default-foreground and background escapes. The shimmer and the fade fall back to the plain colour when it returns `null`.
- `formatToolActivity` treats tool arguments as untrusted. It strips terminal sequences with pi-tui's `stripTerminalSequences`, removes the control characters that leaves behind (a lone ESC, BEL, C1), collapses whitespace, and only then truncates, so the cap can never land inside an escape sequence.
- `ThinkingLevel` is taken from pi's `Theme.getThinkingBorderColor`, so a level pi adds fails the typecheck instead of rendering as the fallback.
- Pi is imported for types, plus one runtime function: `stripTerminalSequences` from the pi-tui peer. Only the TypeScript source shares the host's pi-tui instance, which is why the loader probe covers this subpath.

## Menu

`./menu` is the box-drawing settings menu that pi-topping, pi-topping-bash-gate, pi-topping-statusline, pi-topping-splash and pi-topping-routesense each carried a copy of. It is a pi-tui `Component` (`MenuComponent`) mounted as an overlay by `showMenu(ctx, config)`.

```ts
import { showMenu } from "@underactive/pi-topping-primitives/menu";

const result = await showMenu(ctx, {
	title: "Pi Topping: Settings",
	sections: [
		{
			title: "Meter",
			items: [
				{ kind: "toggle", id: "enabled", label: "Show meter", value: true, hint: "Draws the meter." },
				{ kind: "cycle", id: "direction", label: "Direction", value: "rtl", values: ["rtl", "ltr"], labels: { rtl: "Right to left" } },
				{ kind: "number", id: "bound", label: "Upper bound", value: 80, min: 10, max: 1000, presets: [10, 80, 100, 200], unit: "tps" },
			],
		},
	],
	buttons: [
		{ id: "apply", label: "Apply", applies: true, primary: true },
		{ id: "cancel", label: "Cancel", closeOnAction: true },
	],
	validate: (values) => (values.bound < 10 ? "Bound too low" : undefined),
});
if (result.applied) save(result.values);
```

Row kinds: `toggle` (boolean), `cycle` (one of `values`, arrows wrap, optional `labels` keyed by value and an optional `gate` checkbox), `number` (a whole number in `[min, max]`; typed on Enter or Space, stepped through `presets` with the arrows, published as a number), `text` (inline editor), `action` (runs `onAction`, or closes with the draft when `closeOnAction`), `pick` (hands control to `onPick`, which returns the new value or `undefined`) and `reorder` (rows sharing a `group`; Space or Enter grabs a row, Up/Down drags it, and `values[group]` is the comma-joined order).

### Defaults

| Setting | Default |
| --- | --- |
| Overlay width / max height | `"90%"` / `"85%"` (`layout`) |
| Enter on a toggle or cycle row | applies when there are no buttons (`enterApplies`) |
| Escape or Ctrl+C | closes with `applied: false` and the current draft |
| Up/Down | stop at the ends and skip `disabled` rows |
| PgUp/PgDn | one visible screenful, landing on the nearest enabled row |
| Cycle rows | wrap |
| Starting row | first enabled row (`initialCursor`) |
| Hint title / preview title | `"What this does"` / `"Preview"` |
| Marker | `❯` |

### Keys

The menu matches keys through its own `KeybindingsManager`, built from `DEFAULT_MENU_KEYBINDINGS` plus the host's user bindings. The ids are `pi-topping.menu.up`, `down`, `pageUp`, `pageDown`, `left`, `right`, `toggle` (Space), `apply` (Enter), `cancel` (Escape, Ctrl+C), `focusButtons` (Tab, Shift+Tab), `clear` (Backspace, Delete), `editCommit`, `editCancel` and `editBackspace`. A user remaps them in pi's keybindings file like any other id; the menu's hint strings are the caller's and do not change with a remap. The host's own manager is never asked, because it only answers for the ids it was built with.

### Preview

`preview.render(values, { elapsedMs, activeItemId, width })` is called synchronously inside `render()` with the draft values. `width` is the box's full inner width and the menu adds no margin, so a line of exactly `width` cells reaches the right border. Return `nextRefreshInMs` to be sampled again after that delay; the timer is cleared when the menu closes or is disposed.

### Two kinds of disabled

`disabled` dims the row, shows `disabledReason` and takes it out of cursor navigation. `disabledUnlessAnyOf: [ids]` keeps the row reachable but inert until one of the listed values is `true`; a gated-off toggle shows a forced, muted `ON` without changing its stored value.

### Rebuilds and reorder

`onChange` and `onAction` may return fresh sections (or a `MenuRebuild` with `overwriteValues`) to rebuild the rows. Draft values survive by key, except the ids listed in `overwriteValues` and every reorder group, which takes the rebuilt sections' order: an in-progress drag is reset so the published order and the rows on screen agree.

### Failures and picks

A rejected `onAction` or `onPick`, or a synchronous throw, clears the busy marker and shows `✗ <message>` in the hint block until the next key. Nothing is re-thrown. While `onPick` is pending the menu ignores every key, so a picker opened over it owns the input; its resolved string is stored and fires `onChange`.

`snapshot()` returns detached copies of `values`, `cursorId`, `rowCount`, `editing`, `focus` and `busy` for host tests.

## Models

`./models` provides model vocabulary, a registry catalogue and an unframed two-pane picker. Frames, overlays, warnings, persistence and model-specific selection policy stay in the host.

```ts
import { getModelCatalogue, registryLevelOptions, TwoPaneModelThinking } from "@underactive/pi-topping-primitives/models";

const picker = new TwoPaneModelThinking({
	theme,
	refs: getModelCatalogue(ctx.modelRegistry).availableRefs(),
	levelOptions: registryLevelOptions(ctx.modelRegistry),
	requestRender: () => tui.requestRender(),
});
const rows = picker.render(bodyWidth);
if (picker.handleInput(data) === "confirm") use(picker.getSelected());
```

| Exports | Purpose |
| --- | --- |
| `ModelRef`, `ThinkingLevel`, `THINKING_LEVELS`, `COMMON_THINKING_LEVELS` | Provider/id and canonical thinking vocabulary; both tables are frozen |
| `isModelRef`, `isThinkingLevel`, `modelRefLabel`, `parseRef`, `shortModelName` | Strict non-empty persisted refs, level validation, labels, lenient first-slash decoding and compact display names |
| `parseModelKey`, `composeModelKey` | Sensei's codec: prefer slash, else colon, require a provider; a trailing separator is accepted (unlike `isModelRef`) |
| `getModelCatalogue`, `CatalogueRegistry`, `ModelCatalogue`, `validateSavedChoice`, `registryLevelOptions` | First-wins deduped/sorted registry snapshot, fresh ref objects and level arrays, exact saved-choice validation and picker policy bridge |
| `thinkingOptionsForModel`, `defaultThinkingForModel` | Canonical offered levels; saved override, current, medium, first, then medium preference ladder |
| `smartTruncateModelLabel`, `MODEL_LIST_LAYOUT`, `modelThinkingPaneWidths`, `fuzzyRanked` | Namespace-aware labels, frozen list layout, asymmetric pane allocation, substring-first fuzzy matching |
| `TwoPaneModelThinking`, `TwoPaneModelThinkingOptions`, `ModelPickerTheme` | Generic level vocabulary, structural host theme, body and unframed footer |

| Picker option | Default |
| --- | --- |
| `theme`, `refs`, `levelOptions(ref)` | required; the picker never reads a registry |
| `preferredLevel(ref, options, previous)` | previous level if offered, otherwise first |
| `filter`, `printable` | pi-tui `fuzzyFilter`; kitty decoding or printable paste (C0/DEL/C1 rejected) |
| `backKeys` | `[Key.escape]`; pass Ctrl+C explicitly if wanted |
| `maxVisibleRows` | 10, including header/filter/scroll rows |
| `requestRender` | absent: render-pure, the owner schedules repaint |
| `selectTheme` | selected text accent; descriptions, scroll info and no-match muted, derived from `theme` |
| `highlightSelectedRow`, `marker` | `true`, `"> "` |
| `itemLabel`, `modelPaneTitle`, `levelPaneTitle` | `modelRefLabel`, `"Models"`, `"Thinking"` |
| `levelWidthLabels` | `THINKING_LEVELS`; pass a custom vocabulary to size its pane |
| `defaultRef`, `defaultLevel` | first model, host preference or first offered level |

`reset`, `setMaxVisibleRows`, `handleInput`, `selection` (non-throwing), `getSelected` (throws on empty), `snapshot` (detached), `render`, `renderFooter` and `invalidate` are public. Body rows and footer rows fit `bodyWidth`; pane sums include one divider for widths at least three. Footer output is `{ actionRow, hintRows }`, without rules. Tab cycles models/levels/buttons; arrows switch panes or buttons; Enter selects or cancels. Empty Select is inert. Typing or Backspace retargets the filter from any pane; filtering preserves the selected ref if it still matches.

The row budget reserves scroll information when the item count equals the available list space as well as when it exceeds it. At equality this displays one fewer item plus scroll information; `maxVisibleRows` is a cap, not a promise to show every item that could fit without a scrollbar. A host needing ten item rows can budget twelve total rows plus one while filtering (header + ten items + a possible scroll row).

`thinkingOptionsForModel(levels, { fallback })` uses a copied fallback on any empty filtered result, including `undefined` and `[]`; the default is empty. `registryLevelOptions` exposes the same policy. The only allowed module state is the catalogue WeakMap, keyed by the host registry so it dies with that object; each package copy owns an independent cache. The catalogue snapshots `getAvailable()` the first time it is asked and does not observe `registry.refresh()` (pi refreshes in place after a login or a models.json reload), so a host whose picker must reflect those reads `getAvailable()` and `find()` directly and passes `thinkingOptionsForModel` as `levelOptions`. No global theme or runtime pi-coding-agent import is used.

## Color

`./color` is colour maths pi-tui does not export: tuple RGB, 256-colour conversion, hue conversion, a fade, a shimmer cell, the Switchyard palette and the phosphor comet bar. Where pi-tui already has the function (`parseColor`, `colorToHex`, `mixColors`, `foregroundAnsi`, `backgroundAnsi`, `getTerminalColorMode`, `stripTerminalSequences`, `okhslColor`), use pi-tui's. There is no runtime pi import; the only pi reference is the `TerminalColorMode` type, which is re-exported.

```ts
import { getTerminalColorMode } from "@earendil-works/pi-tui";
import { renderCometBar } from "@underactive/pi-topping-primitives/color";

const bar = renderCometBar(percent, { mode: getTerminalColorMode(), elapsedMs: Date.now() - startedAt });
```

| Export | Purpose |
| --- | --- |
| `Rgb`, `parseHex(hex)`, `mixRgb(from, to, amount)` | A readonly `[r, g, b]` tuple, `#rrggbb` parsing (`undefined` on anything else), and a clamped, rounded blend |
| `rgbTo256(r, g, b)`, `xterm256ToRgb(n)` | An approximate xterm-256 index for an RGB colour (gray ramp for equal channels, otherwise the 6x6x6 cube by linear scaling), and the reverse |
| `channelsToFgAnsi(r, g, b, mode)`, `rgbToFgAnsi(rgb, mode)`, `hexToFgAnsi(hex, mode)` | Foreground escapes. `mode` is always passed in; `hexToFgAnsi` answers an empty string for a bad hex |
| `parseSgrColor(text)`, `SgrColor` | The first colour escape in a string: truecolor or 256-colour, foreground or background, or `ESC[39m` |
| `hslToRgb(h, s, l)`, `hsvToRgb(h, s, v)`, `wrapDeg(deg)` | Hue conversion to integer tuples. `hsvToRgb` wraps the hue; `hslToRgb` expects 0 to 360, so wrap first |
| `fadeRgbToward(text, target, opacity, mode)`, `cosineFalloff(distance, halfWidth)` | Blend every colour already in a string toward a target, and a raised-cosine bump |
| `shimmerCell(ch, dist, palette, options?)`, `ShimmerCellPalette`, `ShimmerCellOptions` | One cell of a light-sweep shimmer (band 5, peak 0.9, bold above 0.2 by default) |
| `SWITCHYARD_PROVIDER`, `NVIDIA_GREEN_HEX`, `NVIDIA_GREEN_DARK_HEX`, `isSwitchyardProvider(provider?)` | The Switchyard provider id, its two greens, and the case- and space-insensitive check |
| `renderCometBar(percent, { mode, elapsedMs?, palette? })`, `BAR_CELLS`, `BAR_FILLED`, `BAR_TROUGH`, `SYNTHWAVE_GREENS`, `CometPalette` | The 20-cell phosphor progress bar compact and statusline both draw, its glyphs, and its default palette |

Semantics:

- **`parseSgrColor` is not `./activity-tui`'s `ansiToRgb`.** `ansiToRgb` answers "can this foreground be blended?" and returns `null` for everything but a truecolor foreground, which is what the shimmer and the colour fade rely on. `parseSgrColor` reads every colour escape and returns a tagged `SgrColor` (`truecolor`, `indexed` with its resolved `rgb`, or `default`), or `undefined`. The names and the result shapes differ on purpose, so one cannot be passed where the other is expected. Both are unanchored: a colour after `ESC[1m` is found.
- `fadeRgbToward` recognises truecolor and 256-colour foregrounds and backgrounds, writing each back in the same plane and in `mode`, and `ESC[39m`, which it recolours from a neutral stand-in so plain labels fade with their coloured neighbours. `ESC[49m` is left alone, so a transparent bar keeps the terminal's background. A colour folded into a compound SGR (`ESC[1;38;2;...m`) is not recognised. Opacity clamps to 0..1, NaN reads as no fade, and 1 returns the string unchanged.
- `renderCometBar` ends every run with a foreground or attribute reset (`ESC[39m`, `ESC[22m`, never `ESC[0m`), so a background the caller painted underneath survives. `percent` clamps to 0..100, and NaN and the infinities read as 0; `elapsedMs` that is not a finite positive number reads as 0. The comet crosses the bar right to left every two seconds.
- Hot paths allocate no more than the vendored copies: `channelsToFgAnsi` takes channels so a per-cell caller builds no tuple, the palettes are frozen once at load, and `shimmerCell` takes its options as an optional argument rather than building a default object.
- `easeFade` and `FADE_SHADE_COUNT` live in `./activity`, and `dimAttribute` in `./activity-tui`. They are not repeated here.
- **Cube levels.** `xterm256ToRgb` uses xterm's cube levels 0, 95, 135, 175, 215 and 255, matching pi-tui for indices 16–255; the gray ramp remains `8 + 10k`, and indices 0–15 still resolve to black. This changed in 0.7.0; 0.6.0 used `55 + v * 51`, so partial fades of 256-colour escapes and `parseSgrColor`'s indexed `rgb` differ. `rgbTo256` remains a linear approximation and does not round-trip every index.
- Statusline's `StatusTheme`, `NvidiaGreenBorder` and `RainbowBorder`, and splash's backdrop samplers, are policy over these primitives and stay in their repos.

## Text

`./text` is text measurement and layout, the sanitisers, and the few formatters the toppings share. Widths come from pi-tui's own ruler (`visibleWidth`, `sliceByColumn`), so they agree with what the renderer draws for wide characters, graphemes and escape sequences. `layout.ts` is the only file with a runtime pi-tui import.

| Export | Purpose |
| --- | --- |
| `padRight(text, width)`, `padCenter(text, width)` | Pad to visible columns; never truncate |
| `truncateVisible(text, maxWidth)`, `fitCell(text, width)`, `ELLIPSIS` | Cut at a column without splitting an escape or a wide character; `fitCell` also marks the cut with `...` and closes any colour span with `ESC[39m` |
| `pickFitting(candidates, width)`, `joinParts(parts, separator?)`, `wrapCommaDelimited(items, width, itemWidths?)` | The first candidate that fits (else the last, truncated); join the parts that are present; wrap a comma-separated list |
| `stripSgr(text)` | Remove colour and style escapes only; an OSC 8 hyperlink survives |
| `stripControlChars(text)`, `sanitizedText(value)`, `sanitizeTerminalBytes(text)`, `sanitizeLabel(text)` | Four sanitisers, below |
| `formatDurationCompact(ms)`, `formatCount(n)`, `formatPercent(fraction, decimals?)`, `formatCostUsd(costUsd)` | `842ms` / `3.2s` / `1m05s`; `1,234,567`; `67.9%`; `$0.123` or `—` |

The four sanitisers are kept apart because the vendored copies disagree, and none is a superset of another:

| | `stripControlChars` | `sanitizedText` | `sanitizeTerminalBytes` | `sanitizeLabel` |
| --- | --- | --- | --- | --- |
| From | pi-topping | pi-topping | persona-audit | statusline |
| Deletes C0, DEL, C1 (including tab and newline) | yes | yes | yes | becomes a space |
| Deletes Unicode format characters (zero-width, bidi, BOM) | yes | yes | no | zero-width, bidi and BOM become a space; other format characters, such as a soft hyphen, are kept |
| Strips escape sequences | no | no | no | CSI and OSC (`stripVTControlCharacters`, regex-based; see below) |
| Trims | no | yes | no | no |
| Collapses runs of spaces | no | no | no | yes |
| Non-string input | n/a | `""` | n/a | n/a |

Only `sanitizeLabel` looks at escape sequences at all, and Node's `stripVTControlCharacters` is regex-based: it removes CSI (including the 8-bit C1 form) and OSC sequences whole, but a DCS, APC, PM or SOS string whose payload holds spaces or punctuation can survive as visible text, with only its control bytes turned into spaces. pi-tui's `stripTerminalSequences` covers a different subset (APC but not 8-bit CSI, DCS, PM or SOS). For untrusted text that can carry whole escape sequences, run `stripTerminalSequences` first and then one of these; the other three would otherwise leave an escape's payload behind (`ESC[31m` becomes the visible text `[31m`).

Semantics:

- `pickFitting([], width)` returns an empty string. Splash's copy threw.
- `formatCostUsd` has one style, persona-audit's and moa-fusion's: three decimals, `—` for undefined or non-finite, negatives as zero. routesense's signed `$0.0042` / `-` style stays in routesense.
- The elapsed formatters live in `./activity` (`formatElapsedClock`, `formatElapsedUnits`). There is **no token formatter**: the toppings use five incompatible styles (`12.3K`, `10.3k`, `~512 tokens`, ...), and the handoff asks for named styles or nothing, so each host keeps its own until they agree.
- Module-level objects: one immutable `Intl.NumberFormat` behind `formatCount`, and two global regular expressions (`stripSgr`, `sanitizeLabel`) that are only ever used through `String.prototype.replace`, which resets `lastIndex`, so calls cannot affect each other.
- `formatDurationCompact` and `formatPercent` expect finite numbers: NaN and the infinities are not special-cased and print as `NaN`.

## Glyphs

`./glyphs` is data: frames and spinners. No imports, and every table is frozen at every level.

| Export | Purpose |
| --- | --- |
| `BoxGlyphs`, `BoxStyle`, `BOX_STYLES`, `ASCII_BOX` | The six glyphs of a rectangle (`topLeft`, `topRight`, `bottomLeft`, `bottomRight`, `horizontal`, `vertical`) for `rounded`, `heavy`, `double` and `single`, and the plain-text fallback |
| `SPINNER_FRAMES`, `SPINNER_FRAME_MS` | The braille set pi-tui's Loader cycles, at 80 ms a frame (moa-fusion's `BRAILLE_SPINNER_FRAMES`) |
| `QUADRANT_SPINNER_FRAMES` | The four-step circle the progress tables use |

`BoxGlyphs` has no T-junctions. moa-fusion's progress table keeps its own eight-field box, because the joins are frame policy.

The spinner tables are frozen `readonly` tuples (`readonly ["⠋", ...]`), so they do not satisfy an API typed as a mutable `string[]`, which pi-tui's `Loader` `frames` option is. Pass a copy: `[...SPINNER_FRAMES]`. Their `.length` is the literal type `10` and `4`.

## Process

`./process` finds the pi that is running this process, starts and kills child processes, and holds the small helpers around them: a bounded-concurrency map, version maths, and the agent-file loader. Nothing spawns on import and there is no module state. `agents.ts` is the only file with a runtime pi-coding-agent import (`parseFrontmatter`, `CONFIG_DIR_NAME`).

| Export | Purpose | From |
| --- | --- | --- |
| `resolvePiInvocation(args?, facts?)` | `{ command, args, via }` for the pi hosting this process | moa-fusion `runner.ts` |
| `escalateKill(proc, graceMs?)`, `DEFAULT_KILL_GRACE_MS` | SIGTERM, then SIGKILL after the grace | moa-fusion `processPool.ts` |
| `createProcessTracker()` | A new registry of live processes with `add`, `delete`, `has`, `size` and `cleanup(graceMs?)` | moa-fusion `processPool.ts` |
| `spawnCollect(command, args, { timeoutMs, … })`, `SPAWN_TIMEOUT_EXIT_CODE` | Run without a shell, collect output, never reject | pi-topping `pi-installer.ts` |
| `mapWithConcurrencyLimit(items, limit, fn, onStart?)` | Results in input order, at most `limit` in flight | moa-fusion `processPool.ts`, persona-audit `subprocess.ts` |
| `parsePiVersion(text)`, `versionAtLeast(version, minimum)` | The first `x.y.z` in some output; component-wise `>=` | moa-fusion `piCapabilities.ts` |
| `hostBelow(version, minimum)` | `true` when a release is older than a floor; unreadable counts as new enough | pi-topping `util.ts` |
| `parseAgentFile`, `loadAgentsFromDir`, `findNearestProjectAgentsDir` | Agent `.md` files and the upward `<CONFIG_DIR_NAME>/agents` walk | moa-fusion `discovery.ts`, persona-audit `subprocess.ts` |

```ts
import { createProcessTracker, resolvePiInvocation, spawnCollect } from "@underactive/pi-topping-primitives/process";

const tracked = createProcessTracker();             // one per extension, never shared
const pi = resolvePiInvocation(["--version"]);      // { command, args, via }
if (pi.via === "path") { /* only `pi` on PATH is left: your policy */ }
const result = await spawnCollect(pi.command, pi.args, { timeoutMs: 10_000 });
```

`resolvePiInvocation` tries, in order, the running entry script under the running runtime (`via: "script"`), the running executable when it is not `node`, `nodejs` or `bun` (`"executable"`, a compiled pi), and last `pi` on PATH (`"path"`). It reads `process.argv[1]`, `process.execPath` and `fs.existsSync` on every call; `facts` replaces any of them. It returns fresh arrays and wraps no Windows shell. `via` is where the host puts its own policy: pi-topping's installer adds `cmd.exe /c` only when `via` is `"path"` on Windows, because it validates its package spec first; moa-fusion passes arbitrary task text as an argument and never wants a shell; splash refuses to relaunch when only `pi` on PATH is left, since that may be a different pi.

`createProcessTracker()` returns a frozen registry that closes over its own set. Each extension makes its own, so a `/reload` kills only what that extension started and two copies of this package in one pi process share nothing. `cleanup` sends SIGTERM to every process that has not settled, empties the registry at once, and after the grace SIGKILLs every process in the snapshot that still has not settled. "Settled" means an exit code or a terminating signal; `proc.killed` is not consulted, because it turns true as soon as a signal is sent.

`spawnCollect` resolves `{ code, stdout, stderr, timedOut }`. A spawn error or a signal exit is `code: 1`. On timeout it escalates the kill, resolves at once with `code: 124`, `timedOut: true`, and `[timed out after Nms]` appended to `stderr` (on a new line when `stderr` is not empty). Output is decoded as UTF-8 across chunk boundaries. A non-finite or non-positive `timeoutMs` starts no timer.

`loadAgentsFromDir(dir, source, { parseThinking? })` reads `*.md` files that are regular files or symlinks. A file that cannot be read, has malformed YAML, has a frontmatter that is not a mapping, lacks a non-empty string `name` or `description`, or has a `tools`, `model` or (with `parseThinking`) `thinking` that is present but not a string is skipped; the rest of the directory still loads. YAML `null` counts as absent. The result keeps a fixed key order, with `tools` and `model` always present and `thinking` present only when the host passed `parseThinking` (the host's own level check, so this subpath does not depend on `./models`). Layering across directories and any name-shadowing rule stay in the host.

`hostBelow` is not `versionAtLeast(parsePiVersion(x))`. It is anchored, so `pi 1.2.0` does not parse, and an unreadable version on either side is `false` (new enough). The `--no-mcp` check built from `parsePiVersion` and `versionAtLeast` reads an unreadable version as too old.

Not here: the sub-run transports (they differ per host), each host's agent layering, `isProcessAlive` and `acquireDirLock` (in `./settings`), and the other non-text helpers the toppings copied that are still local (`isPlainObject` and `stableStringify`; the env-flag, notification and abort helpers are in `./env` and `./abort`).

## Env

`./env` reads environment flags the way pi does. It imports no pi package, reads `process.env` only when called, and has no module state.

| Export | Purpose | From |
| --- | --- | --- |
| `isTruthyEnvFlag(value)` | `true` for `1`, `true` or `yes`, ignoring case; unset, empty and anything else is `false` (a padded `" true "` too) | pi-coding-agent; web-tools `env.ts`, compact `config.ts` |
| `suppressNotifications(env?)` | `isTruthyEnvFlag` of `PI_SUPPRESS_NOTIFICATIONS`; `env` defaults to `process.env` and is read on each call | web-tools `env.ts`, compact `config.ts` |

```ts
import { suppressNotifications } from "@underactive/pi-topping-primitives/env";

if (!suppressNotifications()) ctx.ui.notify("Browser ready", "info");
```

Both copies this replaces were byte-identical to each other and to pi-coding-agent's own `isTruthyEnvFlag`. Only the rule pi itself uses lives here; a topping's own variables keep their own readers.

## Abort

`./abort` holds the abort-signal helpers two toppings had each written. It imports no pi package and has no module state; every export is a function.

| Export | Purpose | From |
| --- | --- | --- |
| `isAbortError(error)`, `abortError(message)` | An `Error` named `AbortError`, and the test for one (it also matches what `fetch` and `AbortSignal` reject with) | sensei `core/abort.ts` |
| `raceAbort(promise, signal, message)` | Settle with the promise, or reject with `abortError(message)` when `signal` fires first; the abort listener is removed on settle | sensei `core/abort.ts` |
| `createDeadline(timeoutMs, callerSignal)` | `{ signal, timedOut(), dispose() }`: one timer, the caller's signal composed with it, and a way to tell a timeout from a caller abort | sensei `review/deadline.ts` |
| `combineSignals(userSignal, timeoutMs, activeFetches)` | `{ signal, cleanup }`: a request signal that aborts on the caller, on `AbortSignal.timeout`, or when a controller registered in the host's set is aborted | web-tools `abort-utils.ts` |

```ts
import { combineSignals, createDeadline } from "@underactive/pi-topping-primitives/abort";

// A call that must report whether it timed out. Dispose on every exit path.
const deadline = createDeadline(60_000, ctx.signal);
try {
	await send({ signal: deadline.signal });
} catch (error) {
	if (deadline.timedOut()) report("timed out");
	else throw error;
} finally {
	deadline.dispose();
}

// A fetch the host can abort on shutdown: it keeps the set, and aborts every entry when the session ends.
const active = new Set<AbortController>();
const { signal, cleanup } = combineSignals(ctx.signal, 30_000, active);
try { await fetch(url, { signal }); } finally { cleanup(); }
```

The two timeout helpers solve one problem for different hosts, so both stay. `createDeadline` owns a `setTimeout` that `dispose()` must clear, answers `timedOut()`, and treats a timeout of zero as "no timer". `combineSignals` uses `AbortSignal.timeout`, which has no timer to clear and cannot say whether it fired; its use is the registered controller, which lets a host abort every request in flight from its own set. Neither is a drop-in for the other.

Both clamp a timeout above 2^31 - 1 ms (about 24.8 days, `Infinity` included) to that value. Node runs a longer `setTimeout` or `AbortSignal.timeout` after about a millisecond and only warns, so an unclamped "no practical limit" aborts the call at once. `AbortSignal.timeout` still throws `ERR_OUT_OF_RANGE` for `NaN`, a negative number or a fraction; `combineSignals` now validates before it registers the controller, so a throw leaves nothing in the set.

`isAbortError`, `abortError` and `raceAbort` are adapted from pi-advisor (MIT); the notice is in `THIRD_PARTY_NOTICES.md`. Not here: `stableStringify`, which only sensei uses.

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

- No module-level mutable state except the documented registry-keyed `./models` WeakMap, and export tables are deep-frozen. Two copies of the package in one pi process must be harmless, and mutable module state is the only way that breaks.
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
