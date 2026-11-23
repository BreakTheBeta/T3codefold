import { expect, it } from "@effect/vitest";
import { ProviderSessionId, ThreadId } from "@t3tools/contracts";
import * as CodexClient from "effect-codex-app-server/client";
import * as Replay from "effect-codex-app-server/replay";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
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
              method: "thread/start",
              params: {
                cwd: "/workspace",
                ephemeral: true,
                approvalPolicy: "never",
                sandbox: "read-only",
                developerInstructions: instructions,
                dynamicTools: [{ type: "function", ...spec }],
                config: { "features.shell_tool": false, "features.apply_patch_freeform": false },
              },
            }),
            incoming({ id: 3, result: { thread: { id: "voice-native" } } }),
            out({
              id: 4,
              method: "thread/realtime/start",
              params: {
                threadId: "voice-native",
                outputModality: "audio",
                version: "v3",
                transport: { type: "webrtc", sdp: "offer" },
                initialItems: [{ role: "developer", text: instructions }],
              },
            }),
            incoming({ id: 4, result: {} }),
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
            out({ id: 5, method: "thread/realtime/stop", params: { threadId: "voice-native" } }),
            incoming({ id: 5, result: {} }),
          ],
        };
        yield* Effect.scoped(
          Effect.gen(function* () {
            const client = yield* CodexClient.CodexAppServerClient;
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
          }),
        ).pipe(Effect.provide(Replay.layerReplay(transcript)));
      }),
    ),
);
