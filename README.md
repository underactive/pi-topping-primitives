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

## Releases

The two packages always carry the same version. A release is four steps:

1. `npm version <minor|patch> --workspaces --no-git-tag-version`
2. Move each package's `## [Unreleased]` section under the new version heading.
3. Tag the commit `v<x.y.z>`.
4. `npm publish --workspaces`

Publishing runs each package's `prepublishOnly`, which runs its tests and the empty-subpath guard, so an unfilled subpath blocks the release instead of shipping as dead weight. On 0.x, each phase takes a minor and fixes take a patch. `contracts` never removes a name, so no release can need a major for it.

## Consumers

The dev workflow for a topping that depends on these packages, including how to iterate against an unpublished build, is in [docs/consumers.md](docs/consumers.md).
