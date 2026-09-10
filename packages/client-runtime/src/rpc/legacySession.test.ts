import { describe, expect, it } from "@effect/vitest";
import { CommandId, ThreadId, MessageId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { RpcClient } from "effect/unstable/rpc";
import { OrchestrationThread } from "@t3tools/contracts/legacy-orchestration";
import { voiceStartInput } from "../realtime-voice/workspace.ts";
import { EnvironmentId } from "@t3tools/contracts";
import { makeLegacyWsRpcClient } from "./legacy.ts";

const thread = Schema.decodeUnknownSync(OrchestrationThread)({
  id: "old",
  projectId: "project",
  title: "Old thread",
  modelSelection: { instanceId: "codex", model: "test" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  latestTurn: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  deletedAt: null,
  messages: [],
  activities: [],
  checkpoints: [],
  session: null,
});

const makeHarness = Effect.gen(function* () {
  const requests: Array<{ tag: string; payload: unknown }> = [];
  const protocol = yield* RpcClient.Protocol.make((write) =>
    Effect.succeed({
      codecFor: Schema.toCodecJson,
      supportsAck: false,
      supportsTransferables: false,
      send: (clientId, request) =>
        Effect.gen(function* () {
          if (request._tag !== "Request") return;
          requests.push({ tag: request.tag, payload: request.payload });
          if (request.tag === "orchestration.subscribeThread") {
            yield* write(clientId, {
              _tag: "Chunk",
              requestId: request.id,
              values: [
                { kind: "snapshot", snapshot: { snapshotSequence: 5, thread } },
                { kind: "synchronized" },
              ],
            });
          } else {
            yield* write(clientId, {
              _tag: "Exit",
              requestId: request.id,
              exit: {
                _tag: "Success",
                value:
                  request.tag === "provider.realtimeVoice.start"
                    ? { sdp: "legacy-answer" }
                    : request.tag === "provider.realtimeVoice.stop"
                      ? null
                      : { sequence: 6 },
              },
            });
          }
        }),
    }),
  );
  const client = yield* makeLegacyWsRpcClient.pipe(
    Effect.provide(Layer.succeed(RpcClient.Protocol, protocol)),
  );
  return { client, requests };
});

describe("legacy RPC adapter", () => {
  it.effect("keeps the original voice wire protocol through the pre-orchestration adapter", () =>
    Effect.gen(function* () {
      const { client, requests } = yield* makeHarness;
      const input = voiceStartInput(
        { environmentId: EnvironmentId.make("old-host"), threadId: thread.id, title: "Old task" },
        "offer",
        "new-call-id",
        "spruce",
      );
      const answer = yield* client["provider.realtimeVoice.start"](input);
      expect(answer).toEqual({ sdp: "legacy-answer" });
      yield* client["provider.realtimeVoice.stop"]({ threadId: thread.id });
      expect(requests).toEqual([
        { tag: "provider.realtimeVoice.start", payload: { threadId: thread.id, sdp: "offer" } },
        { tag: "provider.realtimeVoice.stop", payload: { threadId: thread.id } },
      ]);
    }).pipe(Effect.scoped),
  );
  it.effect("resubscribes from a full legacy snapshot and preserves the ready marker", () =>
    Effect.gen(function* () {
      const { client, requests } = yield* makeHarness;
      const items = yield* client["orchestration.subscribeThread"]({
        threadId: thread.id,
        afterSequence: 100,
        requestCompletionMarker: true,
      }).pipe(Stream.take(2), Stream.runCollect);
      expect(items.map((item) => item.kind)).toEqual(["snapshot", "synchronized"]);
      expect(requests[0]).toEqual({
        tag: "orchestration.subscribeThread",
        payload: { threadId: "old", requestCompletionMarker: true },
      });
    }).pipe(Effect.scoped),
  );

  it.effect("sends the old turn command with the user's message and mode", () =>
    Effect.gen(function* () {
      const { client, requests } = yield* makeHarness;
      yield* client["orchestration.dispatchCommand"]({
        type: "message.dispatch",
        commandId: CommandId.make("send"),
        threadId: thread.id,
        messageId: MessageId.make("message"),
        createdBy: "user",
        creationSource: "mobile",
        text: "Continue",
        attachments: [],
        dispatchMode: { type: "start_immediately" },
      });
      expect(requests.at(-1)).toMatchObject({
        tag: "orchestration.dispatchCommand",
        payload: {
          type: "thread.turn.start",
          commandId: "send",
          threadId: "old",
          runtimeMode: "full-access",
          interactionMode: "default",
          message: { messageId: "message", role: "user", text: "Continue", attachments: [] },
        },
      });
    }).pipe(Effect.scoped),
  );

  it.effect("rejects unsupported new commands before sending a mutation", () =>
    Effect.gen(function* () {
      const { client, requests } = yield* makeHarness;
      const error = yield* client["orchestration.dispatchCommand"]({
        type: "thread.mark-unread",
        commandId: CommandId.make("unread"),
        threadId: ThreadId.make("old"),
      }).pipe(Effect.flip);
      expect(error.message).toContain("does not support");
      expect(requests).toEqual([]);
    }).pipe(Effect.scoped),
  );
});
