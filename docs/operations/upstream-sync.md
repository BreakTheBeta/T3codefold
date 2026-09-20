# Syncing Fold with upstream T3 Code

Fold tracks [pingdotgg/t3code](https://github.com/pingdotgg/t3code) as the `upstream` remote
(fetch only; `origin` and `fold` both point at the Fold repository). Every sync so far is a real
merge commit, and that is the whole maintenance strategy: the merge base is what lets the next
sync present only the conflicts that appeared since this one.

## The procedure

```bash
git fetch upstream --prune
git switch -c sync-upstream-main origin/main
git merge upstream/main          # resolve, then commit
```

Then open a PR into Fold's `main`. The merge commit message is the place to record why each
conflict was settled the way it was — the next person to hit the same file reads that before
re-deriving the decision.

**Never rebase or squash a sync.** Either one throws away the merge base, and the following sync
replays every upstream commit Fold has already integrated as a fresh conflict.

## Resolving conflicts

Fold's divergence falls into a few recurring shapes. Recognising which one a conflict is usually
decides it:

- **Upstream reworks a region Fold moved.** Fold relocated the chat header's script, open-in, and
  Git controls into `ThreadDetailsPanel`, and replaced the queued-message timeline row with its own
  queue UI. Upstream changes aimed at the old locations do not apply; take Fold's side and check
  whether the change has a home in Fold's replacement.
- **Both sides add a variant of the same component.** Prefer upstream's prop name and fold Fold's
  variant in as an extra union member — see the `presentation` prop on `OpenInPicker`,
  `ProjectScriptsControl`, and `GitActionsControl`. Renaming upstream's API to match Fold's
  convention makes every later upstream hunk on that prop conflict.
- **Upstream extracts shared JSX.** Reuse the extraction (`editorItems`, `scriptItems`, `gitItems`)
  from Fold's branches too, rather than keeping a second inline copy that has to be edited twice.
- **A deleted file comes back as modify/delete.** Orchestration v2 removed the v1 harnesses
  (`apps/server/src/bin.test.ts`, `apps/server/src/server.test.ts`). They stay deleted.

Upstream code that Fold does not currently reach — such as the collapsed-header `presentation:
"menu"` branches — is still worth carrying. It costs nothing at runtime and keeps those files
merging cleanly.

Git auto-merges hunks that are textually disjoint but semantically incompatible, so a sync is not
finished when the conflict markers are gone. Typecheck the workspaces you touched before
committing; that is what catches leftover references to props Fold removed.

## Afterwards

Update the upstream baseline commit and date in the README's "Extra features" preamble, so the
feature tables stay honest about what is Fold's and what upstream already ships.
