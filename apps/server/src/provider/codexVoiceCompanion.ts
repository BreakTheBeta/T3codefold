import type { ProviderSetupError } from "@t3tools/contracts";
import type { VoiceCompanionInput } from "@t3tools/provider-core/server/ProviderAdapterRealtimeVoice";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type * as CodexClient from "effect-codex-app-server/client";
import { makeCodexRealtimeVoice } from "./codexRealtimeVoice.ts";

const Handshake = Schema.Struct({ userAgent: Schema.String });
const decodeHandshake = Schema.decodeUnknownEffect(Handshake);
export class CodexVoiceRequestTimeoutError extends Schema.TaggedError<CodexVoiceRequestTimeoutError>()(
  "CodexVoiceRequestTimeoutError",
  { method: Schema.String },
) {}

const NativeThread = Schema.Struct({ thread: Schema.Struct({ id: Schema.String }) });
const ChatGptAccount = Schema.Struct({
  account: Schema.Struct({ type: Schema.Literal("chatgpt") }),
});

export const makeCodexVoiceCompanion = Effect.fn("CodexVoiceCompanion.open")(function* (
  client: CodexClient.CodexAppServerClient["Service"],
  input: VoiceCompanionInput,
  options?: { validateVersion: (version: string) => Effect.Effect<void, ProviderSetupError> },
) {
  const retired = yield* Deferred.make<never, CodexVoiceRequestTimeoutError>();
  const termination = Effect.raceFirst(client.awaitTermination, Deferred.await(retired));
  const deadline =
    (method: string) =>
    <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.raceFirst(termination),
        Effect.timeoutOrElse({
          duration: "30 seconds",
          orElse: () => {
            const error = new CodexVoiceRequestTimeoutError({ method });
            return Deferred.fail(retired, error).pipe(Effect.andThen(Effect.fail(error)));
          },
        }),
      );
  const request = Effect.fn("CodexVoiceCompanion.request")((method: string, payload: unknown) =>
    client.raw.request(method, payload).pipe(deadline(method)),
  );
  const handshake = yield* request("initialize", {
    clientInfo: { name: "t3-voice-companion", version: "1" },
    capabilities: { experimentalApi: true },
  }).pipe(Effect.flatMap(decodeHandshake));
  const version = /\/(\S+)/u.exec(handshake.userAgent)?.[1];
  if (version && options) yield* options.validateVersion(version);
  yield* client.raw.notify("initialized", undefined).pipe(deadline("initialized"));
  yield* request("account/read", {}).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ChatGptAccount)),
  );
  const { config } = yield* request("config/read", {
    cwd: input.cwd,
    includeLayers: false,
  }).pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(
        Schema.Struct({ config: Schema.Record(Schema.String, Schema.Unknown) }),
      ),
    ),
  );
  const servers = config.mcp_servers;
  const disabledServers =
    servers && typeof servers === "object" && !Array.isArray(servers)
      ? {
          mcp_servers: Object.fromEntries(
            Object.keys(servers).map((name) => [name, { enabled: false }]),
          ),
        }
      : {};
  const { thread } = yield* request("thread/start", {
    cwd: input.cwd,
    ephemeral: true,
    approvalPolicy: "never",
    sandbox: "read-only",
    developerInstructions: input.instructions,
    dynamicTools: input.tools.map((tool) => ({ type: "function", ...tool })),
    config: {
      "features.shell_tool": false,
      "features.apply_patch_freeform": false,
      "features.apps": false,
      "features.connectors": false,
      "features.plugins": false,
      "features.hooks": false,
      "features.multi_agent": false,
      "features.multi_agent_v2": false,
      web_search: "disabled",
      project_doc_max_bytes: 0,
      ...disabledServers,
    },
  }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(NativeThread)));
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
    start: (sdp: string, options: Parameters<typeof voice.startRealtimeVoice>[1]) =>
      voice.startRealtimeVoice(sdp, options).pipe(deadline("thread/realtime/start")),
    listVoices: voice.listVoices.pipe(deadline("thread/realtime/listVoices")),
    context: (text: string) =>
      request("thread/realtime/appendText", {
        threadId: thread.id,
        role: "developer",
        text: text.slice(0, 8192),
      }).pipe(Effect.asVoid),
    events: Stream.merge(voice.events, Stream.fromEffect(termination)),
    speak: (text: string) =>
      request("thread/realtime/appendSpeech", {
        threadId: thread.id,
        text: text.slice(0, 6000),
      }).pipe(Effect.asVoid),
    stop: voice.stopRealtimeVoice.pipe(deadline("thread/realtime/stop")),
  };
});
