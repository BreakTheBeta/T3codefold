# Fold maintainer operations

Where Fold's maintenance differs from upstream's. The upstream pages in this directory describe
upstream's procedures; this page overrides them for this repository. Syncing with upstream is in
[upstream-sync.md](./upstream-sync.md).

## Pre-push gate

The fork runs no CI; its test workflows are disabled in GitHub. Instead
[pre-push.ts](../../scripts/pre-push.ts) runs on every `git push` for the workspaces the pushed
commits change and the workspaces that depend on them: format on the changed files, lint on the
changed lines, typecheck, and tests. Unchanged packages replay their last passing result from the
`vp run --cache` task cache in `node_modules/.vite/task-cache`, so it stays fast after the first
run in a checkout. The cache is per checkout; a new worktree warms its own.

- Server tests are not gated yet: the suite takes over half an hour and still has failures
  from before the gate. Run `vp test run <files>` for what you touch.
- Lint blocks only errors on lines the push adds, because many files still carry older
  errors.
- Typecheck covers the workspaces listed in `TYPECHECK_GATED`; add a workspace there once it
  typechecks cleanly.
- Checks run against the working tree, so push the checked-out branch.
- A test that writes files inside its own package can't be cached; keep test scratch files in
  the OS temp directory.
- `git push --no-verify` bypasses the gate for one push.

`vp run knip:check` is not part of the gate yet; knip still has findings on `main`.

## Fold releases

Use **Fold server release** or **Fold desktop release** in this fork's GitHub Actions.
The upstream npm release workflow is disabled on forks. Fold is distributed from
`BreakTheBeta/T3codefold`, not the npm `t3` package.

The server workflow builds self-contained CLI archives on macOS arm64, Linux
arm64/x64, and Windows arm64/x64, using upstream's build and packaging scripts.
It publishes them with `SHA256SUMS` under `fold-server-v<version>`. The
npm-compatible `t3-<version>.tgz` remains available for older launchers, and the
selected `fold-server-latest` or `fold-server-nightly` feed retains its `t3.tgz`.
Never reuse a version for a different commit. Versions published before executable
archives were introduced must be installed using their npm-compatible tarball.

The desktop workflow publishes the matching server first, then builds Windows,
macOS universal, and Linux x64 artifacts. It attaches installers to the selected
`fold-preview-v<version>` release and publishes platform update metadata and assets
to `fold-desktop-latest` or `fold-desktop-nightly`. Keep the platform-specific YAML
files with their referenced installers and blockmaps. These feeds are separate
from Android releases. macOS distribution still requires the maintainer's signing
and notarization setup for trusted installation and automatic updates. Without those
credentials, the workflow publishes a manual Mac download and leaves the automatic
Mac feed unchanged.

Fold 0.4.0 is the first release on upstream's orchestrator v2. Its server upgrades
an earlier Fold database in place on first start (see
[thread migration](../user/thread-migration.md#upgrading-from-an-earlier-fold-build)),
so smoke-test it against a copy of real pre-0.4.0 data, and keep later versions on
0.4.0 or above. Mobile moves to 1.4.0 (versionCode 21) on Expo SDK 58; that first
build changes the native runtime and must ship as an APK, not an OTA update.

Android APKs and the mobile OTA branch continue to use this fork's existing release
process. OTA updates must match the installed native runtime fingerprint.

> For maintainers. Using T3 Code? See [docs/user](../user/).

This document covers the unified release workflow for stable and nightly desktop releases.

## Shared Android build caches

A cold Android build takes about an hour, almost all of it compiling NDK C++. Maintainers run many
worktrees at once, and pnpm gives each one its own `node_modules`, so without shared caches every
worktree pays that hour again. Two host-level caches avoid it, and they solve different halves of
the problem:

- **Gradle's local build cache** reuses JVM, resource, and dex task outputs. It lives in the Gradle
  user home, not the project, so it is shared across worktrees as soon as it is enabled.
  `withAndroidBuildCache.cjs` sets `org.gradle.caching` in the generated `gradle.properties`.
- **ccache** reuses the compiled NDK objects, which Gradle cannot: `externalNativeBuild` tasks are
  not cacheable. Install it once per machine (`sudo apt install ccache`, or Homebrew on macOS).
  `mobile-native-client.ts` detects it and warns when it is absent.

ccache only shares across worktrees because the build sets `CCACHE_BASEDIR` to the checkout root,
which rewrites checkout-absolute paths to be relative before hashing, and relaxes the timestamp
comparisons that differ between two pnpm copies of the same dependency. The Android NDK lives
outside any checkout, so a toolchain change stays a miss, which is what you want. Precompiled
headers are the exception to that path rewriting: they live under AGP's `.cxx/<variant>/<hash>`
directory, whose hash derives from the absolute project path, so the same plugin turns PCH off for
ccache builds. Leaving it on drops cross-worktree hits to about half. Those settings are only read
when CMake configures, so a worktree that already configured `.cxx` before ccache was installed
keeps missing until the next prebuild regenerates its native project.

Do not try to share anything else. The generated `apps/mobile/android/` tree and its `.gradle`,
`build`, and `.cxx` directories record absolute paths; symlinking or copying them between worktrees
produces builds that fail in confusing ways. Keep them per-worktree and let the content-addressed
caches carry the work across.

Inspect effectiveness with `ccache -s`. Cleaning is a last resort, not routine hygiene: see the
incremental-build rule in [AGENTS.md](../../AGENTS.md).
