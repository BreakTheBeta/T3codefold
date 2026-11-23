import { expect, it } from "@effect/vitest";
import { ProviderSessionId, ThreadId } from "@t3tools/contracts";
import * as CodexClient from "effect-codex-app-server/client";
import * as Replay from "effect-codex-app-server/replay";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import * as Stream from "effect/Stream";
import * as CodexError from "effect-codex-app-server/errors";
import { makeCodexVoiceCompanion } from "./codexVoiceCompanion.ts";

it.effect(
  "negotiates voice on an independent ephemeral thread and routes its native tool calls back to T3",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const called = yield* Deferred.make<{ name: string; args: unknown }>();
        const instructions = "Use T3 tools to operate the selected Claude thread.";
        const spec = {
          name: "t3_read_thread",
          description: "Read work",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
        };
        const out = (frame: unknown): Replay.CodexAppServerReplayEntry => ({
          type: "expect_outbound",
          frame,
        });
        const incoming = (frame: unknown): Replay.CodexAppServerReplayEntry => ({
          type: "emit_inbound",
          frame,
        });
        const transcript: Replay.CodexAppServerReplayTranscript = {
          provider: "codex",
          protocol: "codex.app-server",
          version: "0.171.0",
          scenario: "independent-voice-tools",
          entries: [
            out({
              id: 1,
              method: "initialize",
              params: {
                clientInfo: { name: "t3-voice-companion", version: "1" },
                capabilities: { experimentalApi: true },
              },
            }),
            incoming({ id: 1, result: { userAgent: "codex/0.171.0" } }),
            out({ method: "initialized" }),
            out({ id: 2, method: "account/read", params: {} }),
            incoming({ id: 2, result: { account: { type: "chatgpt" } } }),
            out({
              id: 3,
              method: "config/read",
              params: { cwd: "/workspace", includeLayers: false },
            }),
            incoming({
              id: 3,
              result: { config: { mcp_servers: { "outside-host": { command: "acme" } } } },
            }),
            out({
              id: 4,
              method: "thread/start",
              params: {
                cwd: "/workspace",
                ephemeral: true,
                approvalPolicy: "never",
                sandbox: "read-only",
                developerInstructions: instructions,
                dynamicTools: [{ type: "function", ...spec }],
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
                  mcp_servers: { "outside-host": { enabled: false } },
                },
              },
            }),
            incoming({ id: 4, result: { thread: { id: "voice-native" } } }),
            out({
              id: 5,
              method: "thread/realtime/start",
              params: {
                threadId: "voice-native",
                outputModality: "audio",
                version: "v3",
                prompt: instructions,
                transport: { type: "webrtc", sdp: "offer" },
                initialItems: [{ role: "developer", text: instructions }],
              },
            }),
            incoming({ id: 5, result: {} }),
            incoming({
              method: "thread/realtime/sdp",
              params: { threadId: "voice-native", sdp: "answer" },
            }),
            incoming({
              id: "native-tool",
              method: "item/tool/call",
              params: {
                callId: "read-1",
                threadId: "voice-native",
                turnId: "native-turn",
                tool: "t3_read_thread",
                arguments: {},
              },
            }),
            out({
              id: "native-tool",
              result: {
                success: true,
                contentItems: [{ type: "inputText", text: "thread-result" }],
              },
            }),
            out({ id: 6, method: "thread/realtime/stop", params: { threadId: "voice-native" } }),
            incoming({ id: 6, result: {} }),
          ],
        };
        yield* Effect.scoped(
          Effect.gen(function* () {
            const native = yield* CodexClient.CodexAppServerClient;
            const termination = yield* Deferred.make<never, CodexError.CodexAppServerError>();
            const client = { ...native, awaitTermination: Deferred.await(termination) };
            const handle = yield* makeCodexVoiceCompanion(client, {
              threadId: ThreadId.make("claude-work"),
              providerSessionId: ProviderSessionId.make("call-provider"),
              cwd: "/workspace",
              instructions,
              tools: [spec],
              invoke: (_id, name, args) =>
                Deferred.succeed(called, { name, args }).pipe(Effect.as("thread-result")),
            });
            expect(yield* handle.start("offer", { callId: "call" })).toBe("answer");
            expect(yield* Deferred.await(called)).toEqual({ name: "t3_read_thread", args: {} });
            const ended = yield* handle.events.pipe(
              Stream.runDrain,
              Effect.exit,
              Effect.forkScoped,
            );
            yield* Deferred.fail(
              termination,
              new CodexError.CodexAppServerTransportError({
                operation: "read-process-exit-status",
                cause: "process exited",
              }),
            );
            expect((yield* Fiber.join(ended))._tag).toBe("Failure");
          }),
        ).pipe(Effect.provide(Replay.layerReplay(transcript)));
      }),
    ),
);

it.effect("bounds a silent native startup instead of holding the call open", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const client = {
        raw: {
          request: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
        },
        awaitTermination: Effect.never,
      } as unknown as CodexClient.CodexAppServerClient["Service"];
      const opening = yield* makeCodexVoiceCompanion(client, {
        threadId: ThreadId.make("work"),
        providerSessionId: ProviderSessionId.make("call"),
        cwd: "/workspace",
        instructions: "Use T3",
        tools: [],
        invoke: () => Effect.succeed(""),
      }).pipe(Effect.flip, Effect.forkScoped);
      yield* Deferred.await(started);
      yield* TestClock.adjust("30 seconds");
      expect(yield* Fiber.join(opening)).toMatchObject({
        _tag: "CodexVoiceRequestTimeoutError",
        method: "initialize",
      });
    }),
  ),
);
