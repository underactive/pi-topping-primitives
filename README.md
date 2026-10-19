# pi-topping-primitives

Shared libraries for the pi-topping family. Two packages, versioned in lockstep, and neither one is a Pi extension: no `pi` field, no extension entry point, nothing for pi to discover. Toppings depend on them; pi does not.

## Layout

| Path | What it is |
| --- | --- |
| `packages/primitives` | `@underactive/pi-topping-primitives`, the runtime library: contracts, settings, activity, menu, models, colour, text, glyphs, process |
| `packages/test-utils` | `@underactive/pi-topping-test-utils`, devDependency-only test doubles and fixtures |
| `tools/ts-resolve.ts` | Node `--import` hook that maps relative `.js` specifiers onto their `.ts` siblings, so source tests run without a build |
| `tests/` | Repo-level tests, including the hook itself and its fixtures |
| `scripts/` | Loader verification, packaging guard and release check scripts |

The package READMEs carry the detail: [primitives](packages/primitives/README.md), [test-utils](packages/test-utils/README.md).

## Scripts

| Script | Runs | Purpose |
| --- | --- | --- |
| `npm run lint` | `biome check` | Formatting and lint for the whole workspace |
| `npm run typecheck` | `tsc` on the root project, then `typecheck` in every workspace | Types for tools, tests and both packages |
| `npm run test:repo` | `node --import ./tools/ts-resolve.ts --test tests/*.test.ts` | Repo-level tests, no build needed |
| `npm test` | `test:repo`, then `test` in every workspace | Source tests, build, exports tests under `-C compiled` |
| `npm run build` | `build` in every workspace | Writes `dist/`, which is what the `compiled` condition points at; `dist/` is not committed, and `prepack` rebuilds it for a publish |
| `npm run check:pack` | `node scripts/check-pack.ts` | Packaging guard for the workspace |
| `npm run check` | `lint`, `typecheck`, `test`, `check:pack` | The gate. A branch is not ready until this passes |

## Hard rules

Two libraries, not extensions. TypeScript source is the runtime entry and compiled output exists for tests only. Zero runtime dependencies; the three `@earendil-works` packages are `peerDependencies` at `*`. No module-level mutable state, no `instanceof` across a package boundary, frozen export tables, and `contracts` is additive-only forever.

Each rule has a reason attached in the [primitives README](packages/primitives/README.md): two copies in one pi process must be harmless, and a contracts rename would break every topping at once.

## Guards

`npm run check` is `lint`, `typecheck`, `test`, `check:pack`, and it runs three of the four guards below. The fourth is wired to publishing.

| Guard | Run by | Enforces |
| --- | --- | --- |
| `tools/hygiene.ts` | `tests/hygiene.test.ts`, under `test:repo` | The four source rules below |
| `tests/package-shape.test.ts` | `test:repo` | Manifest shape, export key order, the lockstep version and pins, the README's first content line |
| `scripts/check-pack.ts` | `check:pack`, and so `check` and CI | The tarball contents and the no-committed-`dist/` rule |
| `scripts/check-release.ts` | each package's `prepublishOnly` | The empty-subpath publish guard |

The hygiene scanner lexes each file first, blanking comments, string bodies and regex bodies into a same-length code view, so a rule hit always maps back to the source line that caused it. Its four rules:

- `module-state`: a top-level `let` or `var`; a top-level `const` bound to `new Map(`, `new Set(`, `new WeakMap(` or `new WeakSet(`; and a top-level `const` bound to an object or array literal that the file later assigns into or mutates. Two copies of a package in one pi process share nothing but what the module exports, and mutable module state is the only way that becomes observable.
- `instanceof`: only against a fixed allow-list of built-ins, because a class from a second copy of the package is a different class and the check would silently fail.
- `console`: banned. Console output corrupts the TUI pi is drawing.
- `pi-runtime-import`: in `contracts/` and `activity/` only, any non-type import or dynamic import from `@earendil-works/*`. `activity-tui` is exempt because it renders against pi-tui by design.

Each rule has an escape hatch: `// hygiene-allow: <rule> <reason>` on the same line or the line above. The reason is required, and a directive without one is ignored so the rule still fires. It is reserved for deliberate, documented cases.

The strict compiler flags are enforced everywhere, not per package: `strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax` and `noUncheckedIndexedAccess`, all in `tsconfig.base.json`.

## Releases

The two packages always carry the same version: a minor for a phase that changes consumer-visible surface, a patch for a fix.

Publishing is not tied to a phase. Publish when at least one consumer has to take a package from the registry, either because a topping is installed with `pi install npm:<topping>` or because a consumer's CI installs it. Until then the `--no-save` link or a packed tarball is the development path, and [docs/consumers.md](docs/consumers.md) documents both.

At the moment you publish, every subpath still listed in `exports` must export something. Either fill it in that change, or remove it from `exports` first and add it back in the phase that owns it. Removal is allowed by the package-shape guard, which checks that the export keys are a subsequence of the planned list rather than equal to it, deliberately; re-adding is additive, so no consumer breaks. `contracts` is additive-only forever, so dropping and re-adding a subpath must never remove or rename a name that already shipped.

The 0.2.0 release (`./settings`) published only `@underactive/pi-topping-primitives`, the same way as 0.1.0 (test-utils is still unpublished). The 0.1.0 release published only `@underactive/pi-topping-primitives`, using `npm publish -w @underactive/pi-topping-primitives`. `@underactive/pi-topping-test-utils` remains unpublished because its subpaths are still placeholders. Do not use `npm publish --workspaces` while any workspace package still has empty exported subpaths.

What enforces the export condition is `scripts/check-release.ts`, from each package's `prepublishOnly`: it imports every subpath's `compiled` target and fails on any that exports zero keys, which is why `npm publish --workspaces` aborts on the Phase 0 stubs instead of shipping them as dead weight. A release is four steps:

1. `npm version <minor|patch> --workspaces --no-git-tag-version`
2. Move each package's `## [Unreleased]` section under the new version heading.
3. Tag the commit `v<x.y.z>`.
4. `npm publish -w <workspace>` for each releasable package.

## Consumers

The dev workflow for a topping that depends on these packages, including how to iterate against an unpublished build, is in [docs/consumers.md](docs/consumers.md).
