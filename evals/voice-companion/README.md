# Native voice companion handoffs

Runs the production `VOICE_COMPANION_INSTRUCTIONS` against Codex's real v3 realtime websocket transport, with user text injected through `thread/realtime/appendText`. It sends the instructions through **both `prompt` and developer `initialItems`**, matching the corrected companion configuration. Initial history alone does not override the realtime transport prompt.

The four author-written Acme cases cover a natural exact-message send, a current-status read, a greeting, and refusal to approve permissions. Every case defaults to three independent ephemeral sessions. Work cases require actual native `item/tool/call` requests, not acknowledgments or descriptions of a handoff. Calls receive bounded fixture responses; no real work thread is read or changed. The production tool declarations are loaded from source, without duplicating their descriptions or schemas. Audio output is discarded; no microphone, browser, device or T3 server is used.

From `evals/`, with an installed Codex CLI and configured native login:

```sh
pnpm voice-companion --out runs/voice-companion --samples 3
pnpm voice-companion --out runs/voice-companion-new --baseline runs/voice-companion/results.json
```

Use `--case natural-send --samples 1` for a preflight. `--model <id>` selects the backing coding agent; the realtime voice model remains the native v3 default. Results record the CLI version, requested/returned backing model, prompt/tool/case hashes and transport. Compare arms on the same CLI and model. This exercises model behavior on text-injected websocket input; it does not prove speech recognition or WebRTC behavior.

To reproduce the pre-fix configuration, extract only `INSTRUCTIONS` from commit `706536688d26efa391c834654fd7488939a5cef0` to a temporary text file, then run:

```sh
pnpm voice-companion --out runs/voice-companion-old --baseline-prompt-file /tmp/old-voice-prompt.txt --initial-items-only
pnpm voice-companion --out runs/voice-companion-fixed --baseline runs/voice-companion-old/results.json
```

Omit `--initial-items-only` to compare wording while keeping the corrected `prompt` wiring constant. Do not copy a baseline prompt into the repository. The natural-send case comes from the maintainer's production reproduction and is held constant across arms. A genuine regression claim requires it to fail before and pass after; merely adding the case or passing its grader tests does not establish that.

`prompt.txt` snapshots the source prompt for the run. `results.json` retains ordered transcript/tool observations and native event names; `summary.json` reports majority outcomes and baseline samples. Review the observations and rubric, especially acceptance claims and permission refusals. A case passes only with more than half its samples passing. Incomplete arms have no pass/fail verdict. Exit codes: 0 for passing, 1 for a scored failure, 2 for unavailable transport/authentication or another execution error. A transport failure ends the arm and marks remaining samples skipped; there is no ordinary-model fallback.

Codex 0.171.0 was observed accepting the v3 websocket request but emitting `realtime conversation requires API key auth` for a ChatGPT login. Such an outcome is **unsupported**, not a model failure or pass. This runner does not provision credentials or change authentication. It also accepts an explicitly configured native API-key login for future websocket runs and records the account type; such evidence must not be labeled ChatGPT-authenticated WebRTC evidence. Native/subscription requests can consume quota; this transport exposes no dollar-cost accounting. Default successful arms open twelve short sessions, each observed for at most 45 seconds after user input (`--timeout-ms` changes that window). There are no retries or prompt tuning loops. Native MCP integrations, plugins and hooks are disabled; all dynamic work tools are mocked. Never save auth tokens or real user histories as fixtures.

`run.test.ts` tests only evidence grading; run it separately with `vp test run evals/voice-companion/run.test.ts` from the repository root. It is not native-model evidence.
