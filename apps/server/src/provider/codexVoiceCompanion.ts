import type { VoiceCompanionInput } from "@t3tools/provider-core/server/ProviderAdapterRealtimeVoice";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as CodexClient from "effect-codex-app-server/client";
import { makeCodexRealtimeVoice } from "./codexRealtimeVoice.ts";

const NativeThread = Schema.Struct({ thread: Schema.Struct({ id: Schema.String }) });
const ChatGptAccount = Schema.Struct({
  account: Schema.Struct({ type: Schema.Literal("chatgpt") }),
});

export const makeCodexVoiceCompanion = Effect.fn("CodexVoiceCompanion.open")(function* (
  client: CodexClient.CodexAppServerClient["Service"],
  input: VoiceCompanionInput,
) {
  yield* client.raw.request("initialize", {
    clientInfo: { name: "t3-voice-companion", version: "1" },
    capabilities: { experimentalApi: true },
  });
  yield* client.raw.notify("initialized", undefined);
  yield* client.raw
    .request("account/read", {})
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(ChatGptAccount)));
  const { thread } = yield* client.raw
    .request("thread/start", {
      cwd: input.cwd,
      ephemeral: true,
      approvalPolicy: "never",
      sandbox: "read-only",
      developerInstructions: input.instructions,
      dynamicTools: input.tools.map((tool) => ({ type: "function", ...tool })),
      config: { "features.shell_tool": false, "features.apply_patch_freeform": false },
    })
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(NativeThread)));
  yield* client.handleServerRequest("item/tool/call", (payload) =>
    (payload.threadId === thread.id
      ? input.invoke(payload.callId, payload.tool, payload.arguments)
      : Effect.succeed(JSON.stringify({ error: "This call does not own that voice thread." }))
    ).pipe(
      Effect.map((text) => ({
        success: true,
        contentItems: [{ type: "inputText" as const, text }],
      })),
    ),
  );
  const voice = yield* makeCodexRealtimeVoice(client, {
    providerThreadId: thread.id,
    instructions: input.instructions,
  });
  yield* Effect.addFinalizer(() => voice.close);
  return {
    start: voice.startRealtimeVoice,
    listVoices: voice.listVoices,
    context: (text: string) =>
      client.raw
        .request("thread/realtime/appendText", {
          threadId: thread.id,
          role: "developer",
          text: text.slice(0, 8192),
        })
        .pipe(Effect.asVoid),
    events: voice.events,
    speak: (text: string) =>
      client.raw
        .request("thread/realtime/appendSpeech", { threadId: thread.id, text: text.slice(0, 6000) })
        .pipe(Effect.asVoid),
    stop: voice.stopRealtimeVoice,
  };
});
