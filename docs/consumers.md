# Consumer dev story

How a topping consumes the two libraries. The decision this document records: **commit only published registry ranges; link locally without saving.**

The checkouts are symlinked into `~/.pi/agent/extensions`, so each one resolves its own `node_modules` at runtime. That is why every mode below ends with an install inside the consumer checkout.

## 1. Published: the committed state

The only form that may appear in a committed `package.json`:

```sh
npm install @underactive/pi-topping-primitives@^0.N.0
npm install -D @underactive/pi-topping-test-utils@^0.N.0
```

`npm install` may reformat `package.json` (indent, key order); restore the formatting so the diff shows the dependency and nothing else.

After pulling a change that adds or bumps a dependency, run `npm install` in every symlinked checkout before starting pi. Without it the checkout has no copy to resolve and the extension fails on its first import.

Never commit a `file:` or `link:` spec. Consumer CI runs on a machine where that path does not exist, and `pi install npm:<topping>` installs the published tarball, whose spec points at nothing.

## 2. Linked: iterating on unpublished changes

```sh
npm install --no-save ../pi-topping-primitives/packages/primitives
npm run build:watch   # in the primitives checkout
```

`--no-save` puts a symlink in `node_modules` and leaves `package.json` and `package-lock.json` untouched, so nothing can leak into a commit. `build:watch` exists because the `compiled` condition points at `dist/`; pi itself needs no build, since jiti reads the TypeScript source through `default`.

Two caveats:

- The linked `dist` resolves `@earendil-works/*` from the primitives checkout, so a consumer test can end up with a second copy of pi-tui next to the one the consumer installed. `--preserve-symlinks` is worth trying when identity assertions fail.
- The link survives only until the next `npm install` or `npm ci`, which drops it. Re-run the `--no-save` install after either.

## 3. Tarball: the pre-publish gate

```sh
mkdir -p "$TMPDIR/pt-prim"
npm pack -w <pkg> --pack-destination "$TMPDIR/pt-prim"
npm install --no-save <tgz>
```

Pack from the repository root so the workspace layout and `prepack` behave as they do for a real publish; install the tarball in every consumer migrated in that phase. Then run typecheck, tests, and the live smoke test (`pi -ne -e ./index.ts --model <id>`, the command handoff section 5 specifies). Publish only after all of them pass. This is the only mode that exercises the packed `files` list and `prepack` together.

## Runner notes

| Runner | Change |
| --- | --- |
| `node:test` on `.ts` entries | add `-C compiled` |
| moa-fusion's `.mjs` scripts | add `-C compiled` |
| statusline | keeps `--import ./src/tests/ts-resolve.ts` and adds `-C compiled`; the hook only rewrites relative `.js` specifiers |
| sensei (vitest) | **unverified**: try `resolve.conditions`, `ssr.resolve.conditions`, or `poolOptions.forks.execArgv: ["--conditions=compiled"]`, and record which one works |

## Per-repo checklist

Handoff section 7, with two corrections from this phase.

1. `package.json`: add `"@underactive/pi-topping-primitives": "^0.1.0"` under `dependencies`, and `"@underactive/pi-topping-test-utils": "^0.1.0"` under `devDependencies`. Do not touch `peerDependencies` or `files`. **Correction (a):** a registry range is the only committable form. `file:` links exist for `--no-save` work only.
2. Test script: `node -C compiled --test ...`. moa-fusion's `.mjs` scripts take the same flag. Sensei adds a condition through its vite config, and that path is unverified; see the runner notes.
3. `npm install` in the checkout. With a `file:` link, run `npm run build` in the primitives checkout first.
4. Replace the vendored module with imports from the package subpath. Delete the tests that moved; keep one host-level smoke assertion.
5. Remove the "vendored from" header comment and the "mirror test as drift alarm" claim; both are obsolete once the code lives here.
6. `npm run typecheck`, `npm test`, live smoke test, and a CHANGELOG entry naming any behaviour change.
7. Commit per repo with a message that names the primitives version adopted.

## Correction to handoff Phase 0 step 5

Phase 0 step 5 says that with a `file:` link "even plain `node --test` works in that mode". That holds for single-file entries only.

Node realpaths the symlink out of `node_modules`, which lifts the `node_modules` type-stripping restriction, so a test file that imports the package gets TypeScript source and runs. But the `.js`-to-`.ts` specifier rewrite, which lets a module's own `import "./x.js"` reach `x.ts`, is a jiti feature, not a Node one. A package module that spans two files therefore still fails under plain `node --test` with an unresolved `./x.js` specifier. It needs the resolve hook (`--import .../tools/ts-resolve.ts`) or `-C compiled`.

Same correction, stated as a rule: plain `node --test` is enough only while the entry a consumer imports is a single file. Every real consumer should plan on the hook or the flag.
