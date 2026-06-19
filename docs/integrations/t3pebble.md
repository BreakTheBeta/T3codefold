# T3 Pebble Integration Notes

T3 Pebble is a Pebble watch client for T3 Code:

- App repo: https://github.com/twodotwill/t3pebble
- This T3 Code fork/reference: https://github.com/twodotwill/t3code
- Upstream T3 Code: https://github.com/pingdotgg/t3code

## Fork Policy

This fork does not carry Pebble-specific runtime changes on `main`.

The Pebble integration is intentionally app-side:

- the watch app is Pebble C;
- the phone bridge is PebbleKit JS;
- the phone bridge talks to T3 Code's WebSocket RPC API;
- no external bridge process is required.

Keeping T3 Code vanilla avoids maintaining a long-running server fork for a watch client.

## Compatibility Branch

Current T3 Pebble targets the older token-based T3 Code remote API at:

```text
226ed997e1a6493e6b29d5264e0b0f8173e7c630
```

This fork publishes that point as:

```text
t3pebble-auth-token-compatible
```

Use that branch when running the current T3 Pebble app:

```sh
git clone git@github.com:twodotwill/t3code.git
cd t3code
git checkout t3pebble-auth-token-compatible
bun install
bun run build
```

Then start the server from the T3 Pebble repo:

```sh
T3CODE_DIR=../t3code T3PEBBLE_TOKEN=t3 ./run-t3code-tailscale.sh
```

## API Surface Used By Current T3 Pebble

The current Pebble phone bridge relies on:

- server startup with `--auth-token`;
- WebSocket auth using `/ws?token=<token>`;
- `orchestration.getSnapshot`;
- `orchestration.dispatchCommand`;
- command payloads such as `thread.turn.start`, `thread.turn.interrupt`, `thread.approval.respond`, and `thread.user-input.respond`.

## Current Upstream Differences

Current upstream T3 Code `0.0.27` changed the remote access model:

- `--auth-token` is gone;
- `t3 serve` prints a one-time pairing token and `/pair#token=...` URL;
- clients exchange pairing credentials for session/access tokens;
- WebSocket connections use a short-lived `wsTicket`;
- `orchestration.getSnapshot` is replaced by shell/thread subscription APIs:
  - `orchestration.subscribeShell`;
  - `orchestration.subscribeThread`;
  - `orchestration.getArchivedShellSnapshot`.

That means current T3 Pebble will not survive a restart onto current upstream T3 Code until the Pebble phone bridge is migrated.

## Why The Compatibility Branch Exists

The compatibility branch exists to make the current watch workflow reproducible while the Pebble app is migrated to the new upstream auth/read model.

It is not a Pebble-specific patch. It is a pinned older upstream commit that still supports the remote API shape the current Pebble app was built and tested against.

## Migration Plan

To run T3 Pebble against current upstream T3 Code:

1. Accept a T3 pairing URL or pairing token in Pebble app settings.
2. Exchange the pairing credential for an access token.
3. Request a WebSocket ticket before each WebSocket RPC connection.
4. Connect to `/ws?wsTicket=<ticket>`.
5. Replace `orchestration.getSnapshot` with `orchestration.subscribeShell`.
6. Use `orchestration.subscribeThread` for richer per-thread updates.
7. Keep `orchestration.dispatchCommand` for write operations where the schemas still match.
