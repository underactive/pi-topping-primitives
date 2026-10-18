# @underactive/pi-topping-test-utils

A library, not an extension.

Test doubles and fixtures for pi-topping test suites: a fake ExtensionAPI, context, TUI and theme, the key table, an agent-dir sandbox, message and model fixtures, hermetic git, and the ship-manifest check.

## Install

Not published yet. Once 0.1.0 is on the registry:

```sh
npm install -D @underactive/pi-topping-test-utils
```

`devDependencies` only, and that is a rule rather than a preference. A topping's published install graph pulls its `dependencies` and never its `devDependencies`, so this package cannot reach a user's `~/.pi`. The same fact is why it is a separate package instead of extra subpaths on `@underactive/pi-topping-primitives`: anything exported there ships to every user who installs a topping.

## Rules these doubles follow

- No spy framework. Sensei's `vi.fn` doubles are not portable to the other repos' runners, so a double is a plain object with recorded calls where a test needs them.
- No timer mocking. Waiting is done with injectable clocks and the `wait` helpers, so a test never depends on a runner's fake-timer semantics.
- Assertions through `node:assert/strict`, with no assertion library in between.
- Clocks are injected, not read from `Date.now` or `performance.now` inside a double.
- `dim` emits a grey colour escape, not SGR 2. The fade code parses the colour back out of the string, so SGR 2 would leave the double's output unparseable and the tests would pass against a shape real themes never produce.
- `ui.custom` takes a semantics option. pi-topping disposes the component on done while splash resolves immediately; the double must not pick one of those for the caller.

## Modules

Provisional: names may be renamed before the first publish. No module is ported yet; each lands in the phase that first needs it.

| Module | Seed source | Status |
| --- | --- | --- |
| `./theme` | splash `test/helpers/theme`; bash-gate and routesense `fakeTheme` | not ported yet; lands in the phase that first needs it |
| `./keys` | splash `test/helpers/keys`; the bash-gate and routesense `KEY` tables | not ported yet; lands in the phase that first needs it |
| `./ansi` | `stripAnsi` and SGR assertions from bash-gate and routesense helpers | not ported yet; lands in the phase that first needs it |
| `./fake-pi` | splash `fake-api`; pi-topping `tests/lifecycle.test.ts` `MockExtension` | not ported yet; lands in the phase that first needs it |
| `./fake-ctx` | splash `test/helpers/fake-ctx` | not ported yet; lands in the phase that first needs it |
| `./fake-tui` | splash `test/helpers/fake-tui`, width helper | not ported yet; lands in the phase that first needs it |
| `./sandbox` | `withAgentDir` from bash-gate and routesense helpers; splash `test/helpers/env` | not ported yet; lands in the phase that first needs it |
| `./fixtures/messages` | pi-topping `tests/lifecycle.test.ts`, routesense | not ported yet; lands in the phase that first needs it |
| `./fixtures/models` | bash-gate and routesense model fixtures | not ported yet; lands in the phase that first needs it |
| `./git` | splash `test/helpers/git` | not ported yet; lands in the phase that first needs it |
| `./wait` | splash `test/helpers/wait` and `deferred` | not ported yet; lands in the phase that first needs it |
| `./ship-manifest` | sensei `test/sensei-test-utils/ship-manifest.mts` | not ported yet; lands in the phase that first needs it |

Handoff section 4.8 seeds `env` from splash's helpers, but there is no `./env` subpath here and none should be added: splash's `env` helper redirects the agent dir into temp directories and restores it, which is exactly what `./sandbox` promises — "agent-dir sandbox and env isolation" — so the sandbox row above carries it as a seed. Twelve subpaths is the whole list.

## Tests

Two globs, both single-level, so where a test file lives decides whether it runs at all.

- `tests/*.test.ts` runs under `test:src`, with the resolve hook: `node --import ../../tools/ts-resolve.ts --test tests/*.test.ts`. The glob is not recursive, so a file at `tests/fake-pi/foo.test.ts` would be typechecked, because the package `tsconfig.json` includes `tests/**/*.ts`, and never executed. New source tests go directly in `tests/`.
- `tests/exports/entries.test.ts` runs under `test:exports` with `-C compiled`, imports every subpath statically, and must be extended by hand when a subpath is added or removed: the static import, the `SUBPATHS` list and the `NAMESPACES` record. The test asserts that list equals `Object.keys(exports)` exactly.
- `test:exports` and `typecheck:exports` read `dist/` and do not build it. The package `test` script builds first, so a standalone `npm run test:exports` certifies whatever is already in `dist/`; run `npm run build` before it.

`-C compiled` is load-bearing here for the same reason it is in the primitives package, and it has nothing to do with jiti: `compiled` is a Node resolution condition, so a runner that does not pass it falls back to the `default` target, which is TypeScript source under `node_modules`, and Node refuses that with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. jiti is not in the picture on the test side.
