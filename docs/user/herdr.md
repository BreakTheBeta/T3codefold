# Native Herdr Core connections

The desktop client can connect directly to an existing Herdr Core socket, locally or over SSH. Core continues running independently of T3. This integration does not install, update, start or stop Core, and requires no changes to Core's source.

Open **Factory** in the main sidebar. Herdr Core opens in that workspace; **T3 sessions** keeps the existing T3-managed factory available. You can also use **Settings → Connections → Open Factory**. Add the absolute socket path and, for a remote machine, its SSH host alias. Remote connections require Python 3 and an already authenticated SSH agent/configuration. Connections are read-only by default; clear that setting when creating a connection to allow supported controls under your OS account's authority. Core does not supply separate per-client permission scopes.

Select a terminal to inspect it, and pin the conversations you follow. When a terminal runs `claude` or `codex` and carries a provider session id label (`herd.session` by default), the client finds that session's transcript in the provider's default store on the Core host (`~/.claude/projects` or `~/.codex/sessions`, honouring `CLAUDE_CONFIG_DIR` and `CODEX_HOME`) with one bounded `machine.exec` per refresh. Without a published mapping, `herd.name`, `herd.role` and `herd.token.parent` name, group and nest terminals. **Conversation source** shows the detected file, or attaches a different absolute JSONL path. A binding is a file association, not proof that Core associates the file with that terminal. History uses Core's `file.read` API, starting near the end of the file; older records load on demand. While the workspace is visible, the client refreshes recorded history every three seconds. Updates appear when the provider writes them, so this is not a guarantee of token-by-token streaming. Unsupported transcript records are not interpreted as chat.

Ordinary prompts use Core's existing `terminal.send`; interruption uses `terminal.interrupt`. The client never sends chat text to answer a blocked permission dialog. Core has no durable send-receipt lookup: if delivery is unknown, inspect the transcript or terminal before allowing a new operation. Reconnecting never automatically resends a prompt.

## Optional factory panels

A setup can publish a versioned profile in Core's opaque `t3-client` document through its existing JSON-RPC `doc.set` API. The document is optional; a plain Core setup needs no factory services, special roles or herd labels. The profile can map metadata keys, bind transcripts and describe existing loopback HTTP service resources and controls. T3 does not write the Herdr desktop app's private layout document.

For example, the following document value adds a read-only triggers panel for an existing factoryd service:

```json
{
  "metadataMapping": {
    "name": "herd.name",
    "role": "herd.role",
    "parent": "herd.token.parent",
    "session": "herd.session"
  },
  "transcripts": [
    { "terminal": "t7", "path": "/absolute/path/to/session.jsonl", "provider": "claude" }
  ],
  "modules": [
    {
      "id": "example.automations",
      "schemaVersion": 1,
      "label": "Automations",
      "baseUrl": "http://127.0.0.1:8796",
      "resources": [
        {
          "kind": "trigger",
          "label": "Triggers",
          "fields": ["id", "owner", "schedule", "state"],
          "path": "/v1/triggers",
          "resultKey": "triggers"
        }
      ],
      "actions": []
    }
  ]
}
```

Service adapters use Core's existing `machine.exec` API to run a bounded Python HTTP request on the host. They require Python 3 and a loopback service using the `{ "ok": true, "data": ... }` envelope. A module can specify `tokenPath`; its contents stay on the host. Configure only trusted service profiles. The current resource view shows at most 100 rows per request.

An action descriptor supplies `id`, `label`, `permission`, `targetKind`, HTTP `method`, `path` (optionally containing `{id}`), and string `input` fields with `name`, `label` and `required`. The permission label describes the action; it does not create Core authorization scopes. Every write requires a control-enabled connection and an explicit staged payload review. Service-specific approval, revision and policy rules remain the service's responsibility. Generic staging is not a replacement for an outward-action approval protocol.

## Current limits

Standalone web browsers and mobile do not have a direct transport to unmodified Core's sockets/SSH stdio. The mobile Factory panel states this limitation. A desktop build containing the native IPC transport is required; opening the new page in an older installed desktop build does not add that transport.

Provider permission replies, model switching, discovery of transcripts outside the default provider stores, provider-specific lifecycle recovery and complete transcript-dialect coverage are not claimed. Existing terminal/process status remains visible when structured chat is unavailable. Disconnecting or removing a connection does not stop agents.
