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
| `./keys` | splash `test/helpers/keys` | not ported yet; lands in the phase that first needs it |
| `./ansi` | `stripAnsi` and SGR assertions from bash-gate and routesense helpers | not ported yet; lands in the phase that first needs it |
| `./fake-pi` | splash `fake-api`; pi-topping `tests/lifecycle.test.ts` `MockExtension` | not ported yet; lands in the phase that first needs it |
| `./fake-ctx` | splash `test/helpers/fake-ctx` | not ported yet; lands in the phase that first needs it |
| `./fake-tui` | splash `test/helpers/fake-tui`, width helper | not ported yet; lands in the phase that first needs it |
| `./sandbox` | `withAgentDir` from bash-gate and routesense helpers | not ported yet; lands in the phase that first needs it |
| `./fixtures/messages` | pi-topping `tests/lifecycle.test.ts`, routesense | not ported yet; lands in the phase that first needs it |
| `./fixtures/models` | bash-gate and routesense model fixtures | not ported yet; lands in the phase that first needs it |
| `./git` | splash `test/helpers/git` | not ported yet; lands in the phase that first needs it |
| `./wait` | splash `test/helpers/wait` and `deferred` | not ported yet; lands in the phase that first needs it |
| `./ship-manifest` | sensei `test/sensei-test-utils/ship-manifest.mts` | not ported yet; lands in the phase that first needs it |

## Tests run with `-C compiled`

Exactly like the primitives package, a test file imports this package under `node -C compiled --test`. The reason is the same and has nothing to do with jiti: `compiled` is a Node resolution condition, so a runner that does not pass it falls back to the `default` target, which is TypeScript source under `node_modules`, and Node refuses that with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. jiti is not in the picture on the test side.
