---
name: upstream
description: Merge the latest pingdotgg/t3code main into T3 Code Fold without losing any Fold feature. Use when asked to sync, pull, or merge upstream, or to check that a sync kept Fold's features.
---

# Sync Fold with upstream

[docs/operations/upstream-sync.md](../../../docs/operations/upstream-sync.md) is the policy: read
it first and follow it. Its core rule is that a sync never loses a Fold feature. When upstream ships
the same feature, take upstream's and keep only what it lacks; when it doesn't, keep Fold's. When
unsure, keep Fold's and ask. This skill is the procedure.

## 1. Merge

```bash
git fetch upstream --prune
git switch -c t3/sync-upstream-main origin/main   # or reuse the task's branch if it is at origin/main
git merge --no-ff --no-commit upstream/main
```

Never rebase or squash. Count the conflicts with `git diff --name-only --diff-filter=U`, and check
modify/delete (`UD`/`DU`) and add/add (`AA`) entries separately: they usually mean upstream moved
or rewrote the code a Fold feature lives in, and the feature has to be ported to the new location,
not dropped.

## 2. Resolve

- For more than a handful of files, split the conflicts by area (server and packages, mobile,
  web/docs/scripts) and resolve the areas in parallel with subagents. Each subagent edits only its
  own files, does not stage or commit, and writes per-file notes on how and why it resolved each one
  to a file under `/tmp`. Give each one the feature rule from the guide.
- `pnpm-lock.yaml`: resolve `pnpm-workspace.yaml` and every `package.json` first. Then take
  upstream's lockfile (`git checkout --theirs pnpm-lock.yaml`) and run `vp i` to regenerate it with
  Fold's dependencies. If `vp` is not on `PATH`, `pnpm install` works, and after it
  `node_modules/.bin/vp` exists.
- Fold code that auto-merged cleanly can still be broken by upstream API moves. A clean textual
  merge is not done.

## 3. Verify

- Typecheck every workspace touched: `npx tsc --noEmit -p <workspace>`. For `apps/server`, also
  run with `--singleThreaded`. tsgo's parallel checkers can hide a TS2589 "excessively deep"
  failure and report it as `any` in an Effect requirements channel instead.
- Run the tests in every directory the merge changed, with
  `NODE_ENV=test node_modules/.bin/vp test run <files>`. `NODE_ENV=production` in the shell
  breaks React `act` tests.
- Walk the README's "More than upstream" table and check every feature on every surface it lists.
  For each one, confirm the implementation is wired in, and that every entry point that existed
  before the merge still exists: settings rows, command palette entries, keybindings, buttons,
  routes, CLI commands, MCP tools. For many features, give this to read-only subagents split by
  feature group, and compare `origin/main` with the merge.
- Do not run repo-wide checks. The pre-push gate runs on `git push`.

## 4. Record and ship

- Commit the merge with a message that records each non-obvious resolution. Name every case where
  upstream's version replaced Fold's, and what Fold behavior, if any, went with it.
- Keep Fold's footprint small while you are in there. New or moved Fold code goes in Fold-owned
  modules behind one-line seams; see "Keeping Fold's footprint small" in the guide.
- Update the README's upstream baseline commit and date. Move any feature upstream now ships out of
  the "More than upstream" table.
- Open a PR into Fold's `main` only when the developer asks for one.
