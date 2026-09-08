# T3 Code Fold

T3 Code Fold extends [T3 Code](https://github.com/pingdotgg/t3code) with a foldable Android workspace, live Codex voice, and agent handoffs between connected machines. Web, desktop, and Android share compatibility with older servers, while Fold builds use their own install and update sources.

[Download Fold](https://github.com/BreakTheBeta/T3codefold/releases) · [Install a server](#installation) · [Update guide](docs/user/updating.md) · [Foldable demo](#foldable-demo)

## Extra features

Compared with upstream `main` at [d081ab7ab](https://github.com/pingdotgg/t3code/commit/d081ab7abc16a21570d3d96948acb6c1f8d847a4), reviewed **8 September 2026**. These tables describe the code on Fold's `main`; an older published installer may not include every change.

### Agents, voice, and compatibility

| Feature                        | What you get                                                                                                                                                                                                                                                                                                        | Available in                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Live Codex voice**           | Choose a speaking voice and microphone, read transcripts and agent status, mute speaker and mic separately, use shortcuts, and keep talking while navigating. Optional file/diff/question context and spoken end/task switching are supported. [Voice setup](docs/user/providers-codex.md#talk-to-codex-fold-beta). | Web · Desktop · Mobile                   |
| **Handoffs between machines**  | An agent can discover connected environments, start or message a thread elsewhere, and read or wait for its response.                                                                                                                                                                                               | Server · Connected clients               |
| **Fleet CLI**                  | Use `t3 fleet` to discover environments and projects, create threads, send messages, read results, and wait. Retried requests keep their original receipt.                                                                                                                                                          | CLI                                      |
| **Task handoff skill**         | Give another thread ownership of work with its objective, progress, code location, constraints, and a return contact. [Handoff instructions](.agents/skills/t3-handoff/SKILL.md).                                                                                                                                   | Agents with T3 tools or CLI              |
| **Older-server compatibility** | Connect the same client to pre-orchestration and current servers; browse threads, send messages, and answer approvals and questions. [Compatibility guide](docs/user/updating.md#compatibility-with-older-servers).                                                                                                 | Web · Desktop, including macOS · Android |
| **Optional Cite bubble**       | Hide the selection bubble through **Settings → General → Show Cite on text selection**, without disabling text selection.                                                                                                                                                                                           | Web · Desktop                            |

### Android and foldable phones

| Feature                              | What you get                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chat beside workspace tools**      | Keep the conversation visible while using Files, Terminal, or Git on an unfolded phone.                                                     |
| **Resizable panes**                  | Drag the divider to adjust the workspace, including a compact pane when chat needs more space.                                              |
| **Fold-aware navigation**            | Tool selection, sidebar controls, and Android Back behavior account for the split workspace.                                                |
| **Background voice calls**           | Keep talking with the screen locked, end calls from the ongoing notification, and use system speaker or Bluetooth call routing.             |
| **Shared project colours and icons** | See automatic colours, custom icons, and emoji configured on desktop for projects on the same server.                                       |
| **Selectable Markdown and links**    | Select and copy across paragraphs, lists, and tables, while keeping response links clickable.                                               |
| **Agent activity notifications**     | Get local alerts for completed or failed work, approvals, and questions; tap to return to the thread. Requires the app to remain connected. |

### Fold installation and updates

| Feature                       | What you get                                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Separate Android preview**  | Install Fold alongside the upstream Play Store app. Compatible JavaScript updates come from Fold's GitHub OTA feed and must match the native runtime.                                      |
| **Fork-owned server updates** | Server updates, remote SSH installs, and copied commands use Fold release packages. Older updaters get a manual Fold command instead of installing upstream T3.                            |
| **Dedicated desktop feeds**   | Windows, macOS, and Linux builds use Fold's desktop feeds, separate from APK releases. The release workflow publishes the matching server first and includes Windows WSL terminal support. |

<details>
<summary><strong>Connection and release limits</strong></summary>

- Cross-environment delivery requires a running client connected to both servers. Accepted work continues on the destination if that client disconnects; follow-up delivery needs the connection restored.
- A handoff passes context and code references. It does not copy your checkout or uncommitted changes to another machine.
- Compatibility mode connects updated Fold clients to older servers. New orchestration actions still need a current server; it does not retrofit old client binaries.
- Advanced voice controls require matching updated hosts and clients. Task switching reconnects audio; view sharing is optional and bounded, without screen capture. Recheck upstream voice controls, context sharing, and call ownership across clients before retiring these differences.
- Android activity notifications are local, connected-app notifications, not disconnected push delivery. Bluetooth behavior, including Meta Ray-Ban glasses, still needs physical-device verification.
- Installers and source availability differ. macOS automatic updates require signed builds; unsigned Mac builds are manual downloads. See [releases](https://github.com/BreakTheBeta/T3codefold/releases) for available artifacts.

</details>

### Upstream orchestration integrated early

Fold also includes [upstream's orchestration work](https://github.com/pingdotgg/t3code/commit/415ed0f73), merged ahead of the upstream `main` baseline above. These capabilities come from that integration; Fold's cross-environment routing builds on it.

| Capability                      | What it enables                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agent thread tools**          | Start, list, read, message, and wait for threads, with task delegation through T3's orchestration tools.                                            |
| **Subagent threads**            | Represent supported provider subagents as child threads with their own activity and relationship to the parent.                                     |
| **Forks and provider handoffs** | Branch work, switch providers, and merge work back where supported. Portable context has limits: [handoff details](docs/user/portable-handoffs.md). |
| **Server-owned message queues** | Queue work after an active turn and edit, reorder, remove, or promote queued messages. [Queue controls](docs/user/composer.md#queued-messages).     |
| **Cursor SDK runtime**          | Run Cursor through its SDK, including streamed task activity and child-thread projections. [Setup and capability limits](docs/user/cursor.md).      |

Upgrading an older server also migrates its conversation transcripts into the new runtime. Read [older-thread migration](docs/user/thread-migration.md) for what carries over and how sessions resume.

Upstream already supplies the core clients, remote connections, provider support, voice dictation, source-control tools, and much of the project styling. The tables above describe Fold's additions or extensions to that foundation. Recheck them after upstream merges overlapping functionality; Pebble's separate watch app and its legacy compatibility branch are not features of this main branch.

## Foldable demo

| Chat + Files                                                                                        | Resizable workspace                                                                                            |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| ![Chat and Files side by side on an unfolded Android phone](docs/images/t3codefold-chat-files.webp) | ![A resized T3 Code Fold workspace giving the active pane more room](docs/images/t3codefold-resized-pane.webp) |

### Select across Markdown

Android's native selection controls work across mixed response content, including headings, paragraphs, links, lists, inline code, and tables.

<img src="docs/images/t3codefold-text-selection.webp" alt="Native Android text selection spanning Markdown headings, paragraphs, lists, links, inline code, and a table" width="420">

Download the Android preview from [GitHub Releases](https://github.com/BreakTheBeta/T3codefold/releases). The preview package is separate from the Play Store build, so it can be installed for testing without replacing the production app.

## About upstream T3 Code

T3 Code is an "agent harness control surface". It enables control of the agents on your machine with a best-in-class mobile app ([iOS](https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824), [Android](https://play.google.com/store/apps/details?id=com.t3tools.t3code)), [web app](https://app.t3.codes) and [Electron-based desktop app](https://t3.codes).

Works with your subscriptions on Claude Code, Codex, Cursor, Grok Build, OpenCode, and Google Antigravity. If they're set up on your computer, T3 Code can control them.

## "Wait, what are you selling me?"

Nothing. We built T3 Code because we wanted the best possible development experience with agents. We were inspired by existing solutions like the Codex desktop app, Conductor, Claude Desktop and Cursor Glass, but none met our bar.

We wanted something performant, remote-ready, and truly open. If we ever go the wrong direction, we want you to have everything you need to fork and build the editor that you want.

## Installation

> [!WARNING]
> T3 Code currently supports Codex, Claude, Cursor, Grok Build, OpenCode, and Antigravity. Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - Cursor: install [Cursor CLI](https://cursor.com/cli) and run `agent login`
> - Grok Build: install [Grok Build CLI](https://x.ai/cli) and run `grok login`
> - OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`
> - Antigravity: enable it in Settings, then use **Install Antigravity** and **Sign in with Google**. No CLI is required.

### Try it out (install-free)

The easiest way to test T3 Code is to run the server in your terminal (requires Node.js 22.16+, 23.11+, or 24.10+):

```bash
npx --yes --prefer-online --package=https://github.com/BreakTheBeta/T3codefold/releases/download/fold-server-latest/t3.tgz t3
```

This will launch T3 Code's backend on your machine as well as the local web app to control your agents.

Tip: Use `npx --yes --prefer-online --package=https://github.com/BreakTheBeta/T3codefold/releases/download/fold-server-latest/t3.tgz t3 --help` for the full CLI reference.

### Desktop app

Download Fold desktop builds from [GitHub Releases](https://github.com/BreakTheBeta/T3codefold/releases). The upstream Homebrew, winget, and AUR packages install regular T3 Code.

## Some notes

We are very very early in this project. Expect bugs.

We are (mostly) not accepting contributions yet. Small fixes may be considered. Big features will not be.

## Documentation

Full docs live in [docs/](./docs). There's no docs site yet.

- [T3 Pebble integration notes](./docs/integrations/t3pebble.md)
- [Install and first run](./docs/user/install.md)
- [Permission modes](./docs/user/permission-modes.md)
- [Keyboard shortcuts](./docs/user/keybindings.md)
- [Project settings](./docs/user/project-settings.md)
- [Appearance preferences](./docs/user/appearance.md)
- [Remote access from a phone or another machine](./docs/user/remote-access.md)
- [Keeping app and server in sync](./docs/user/updating.md)
- [Source control integrations](./docs/user/source-control.md)
- Multiple accounts: [Codex](./docs/user/providers-codex.md) · [Claude](./docs/user/providers-claude.md)
- [Run T3 Code as a background service](./docs/user/background-service.md)

Building from source? Start at [docs/internals/overview.md](./docs/internals/overview.md).

## If you REALLY want to contribute still.... read this first

### Install `vp`

T3 Code uses Vite+ so you'll need to install the global `vp` command-line tool.

#### macOS / Linux

```bash
curl -fsSL https://vite.plus | bash
```

#### Windows

```bash
irm https://vite.plus/ps1 | iex
```

Checkout their getting started guide for more information: https://viteplus.dev/guide/

### Install dependencies

```bash
vp i
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before reporting a bug or opening a PR.

Have a feature request? Start an [Ideas discussion](https://github.com/pingdotgg/t3code/discussions/categories/ideas).

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
