import { expect, it } from "@effect/vitest";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  AuthOrchestrationOperateScope,
  AuthSessionId,
  ProjectId,
  ProviderInstanceId,
  ProviderDriverKind,
  ThreadId,
  RunId,
  RuntimeRequestId,
  type OrchestrationV2ThreadProjection,
  type AuthClientSession,
  type ProviderRealtimeVoiceEvent,
} from "@t3tools/contracts";
import type { ProviderInstance } from "@t3tools/provider-core/server/driver";
import type { VoiceCompanionInput } from "@t3tools/provider-core/server/ProviderAdapterRealtimeVoice";
import * as Queue from "effect/Queue";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as Schema from "effect/Schema";
const decode = Schema.decodeSync(
  Schema.fromJsonString(
    Schema.Struct({
      provider: Schema.optional(Schema.String),
      accepted: Schema.optional(Schema.Boolean),
      error: Schema.optional(Schema.String),
    }),
  ),
);
import * as SessionStore from "../auth/SessionStore.ts";
import * as ServerConfig from "../config.ts";
import * as Threads from "../orchestration-v2/ThreadManagementService.ts";
import * as Instances from "./ProviderInstanceRegistry.ts";
import * as Companion from "./VoiceCompanion.ts";

const owner = AuthSessionId.make("phone");
const stranger = AuthSessionId.make("another-phone");
const first = ThreadId.make("claude-work");
const second = ThreadId.make("cursor-work");
const projectId = ProjectId.make("project");
const runId = RunId.make("accepted-run");

it.effect(
  "keeps a Codex call independent of work providers, confirms delivery once, restores target events, and isolates owners",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const transportClosed = yield* Deferred.make<void>();
        const nativeEvents = yield* Queue.unbounded<ProviderRealtimeVoiceEvent>();
        const completed = yield* Deferred.make<void>();
        const spoken = yield* Deferred.make<string>();
        const prepared: VoiceCompanionInput[] = [];
        const answered: string[] = [];
        const sent: Threads.ThreadManagementSendInput[] = [];
        const contexts: string[] = [];
        const closed: string[] = [];
        let validOwner = true;
        const projection = (threadId: ThreadId) =>
          ({
            thread: {
              id: threadId,
              projectId,
              title: threadId,
              modelSelection: {
                instanceId: ProviderInstanceId.make(threadId === first ? "claude" : "cursor"),
                model: "unchanged-model",
              },
              worktreePath: "/workspace",
              archivedAt: null,
              deletedAt: null,
            },
            messages: [{ role: "assistant", runId, text: "The approach preserves compatibility." }],
            runs: [{ id: runId, status: "completed" }],
            runtimeRequests: [
              { id: "question", kind: "user_input", status: "pending" },
              { id: "approval", kind: "command", status: "pending" },
            ],
            turnItems: [],
          }) as unknown as OrchestrationV2ThreadProjection;
        const provider = {
          snapshot: {
            getSnapshot: Effect.succeed({ auth: { status: "authenticated", type: "chatgpt" } }),
          },
          instanceId: ProviderInstanceId.make("codex"),
          enabled: true,
          driverKind: ProviderDriverKind.make("codex"),
          orchestrationAdapter: {
            openVoiceCompanion: (input: VoiceCompanionInput) =>
              Effect.gen(function* () {
                prepared.push(input);
                yield* Effect.addFinalizer(() =>
                  Effect.sync(() => {
                    closed.push(input.threadId);
                  }).pipe(
                    Effect.andThen(
                      Effect.suspend(() =>
                        closed.length === 2
                          ? Deferred.succeed(transportClosed, undefined).pipe(Effect.asVoid)
                          : Effect.void,
                      ),
                    ),
                  ),
                );
                return {
                  start: () => Effect.succeed("answer-sdp"),
                  listVoices: Effect.succeed({
                    voices: ["test-voice"],
                    defaultVoice: "test-voice",
                  }),
                  context: (text: string) =>
                    Effect.sync(() => {
                      contexts.push(text);
                    }),
                  speak: (text: string) => Deferred.succeed(spoken, text).pipe(Effect.asVoid),
                  events: Stream.fromQueue(nativeEvents),
                  stop: Effect.void,
                };
              }),
          },
        } as unknown as ProviderInstance;
        const layer = Companion.layer.pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.mock(Instances.ProviderInstanceRegistry, {
                listInstances: Effect.succeed([provider]),
              }),
              Layer.mock(SessionStore.SessionStore, {
                streamChanges: Stream.never,
                cookieName: "test",
                legacyCookieName: undefined,
                listActive: () =>
                  Effect.succeed(
                    validOwner
                      ? ([
                          { sessionId: owner, scopes: [AuthOrchestrationOperateScope] },
                        ] as unknown as AuthClientSession[])
                      : [],
                  ),
              }),
              ServerConfig.layerTest("/workspace", { prefix: "voice-companion" }).pipe(
                Layer.provide(NodeServices.layer),
              ),
              Layer.mock(Threads.ThreadManagementService, {
                dispatch: (command) =>
                  Effect.sync(() => {
                    if (command.type === "runtime-request.respond")
                      answered.push(command.requestId);
                    return { sequence: 1, storedEvents: [] };
                  }),
                getThreadSnapshotWindow: (id) =>
                  Effect.succeed({
                    schemaVersion: 2,
                    snapshotSequence: 1,
                    projection: projection(id),
                  }),
                sendToThread: (input) =>
                  Effect.sync(() => {
                    sent.push(input);
                    return {
                      delivery: "started",
                      run: { id: runId },
                      projection: projection(input.threadId),
                    } as unknown as Threads.ThreadManagementSendResult;
                  }),
                waitForThread: (input) =>
                  Deferred.await(completed).pipe(
                    Effect.as({ threadId: input.threadId, run: null, timedOut: false }),
                  ),
              }),
              NodeCrypto.layer,
            ),
          ),
        );
        yield* Effect.gen(function* () {
          const service = yield* Companion.VoiceCompanion;
          expect(
            yield* service.start(owner, { threadId: first, callId: "call", sdp: "offer" }),
          ).toEqual({ sdp: "answer-sdp" });
          const native = prepared[0]!;
          expect(native.threadId).toBe(first);
          const read = decode(yield* native.invoke("read", "t3_read_thread", {}));
          expect(read.provider).toBe("claude");
          expect(
            decode(
              yield* native.invoke("approval", "t3_answer_question", {
                requestId: RuntimeRequestId.make("approval"),
                answers: { answer: "yes" },
              }),
            ).error,
          ).toContain("Permission approvals");
          expect(answered).toEqual([]);
          yield* native.invoke("question", "t3_answer_question", {
            requestId: RuntimeRequestId.make("question"),
            answers: { answer: "preserve compatibility" },
          });
          expect(answered).toEqual(["question"]);
          const accepted = yield* native.invoke("send", "t3_send_message", {
            message: "Why this approach?",
          });
          expect(decode(accepted).accepted).toBe(true);
          expect(
            yield* native.invoke("send", "t3_send_message", { message: "Why this approach?" }),
          ).toBe(accepted);
          expect(sent).toHaveLength(1);
          expect(sent[0]?.threadId).toBe(first);
          expect(sent[0]?.modelSelection).toBeUndefined();
          expect(yield* Deferred.isDone(spoken)).toBe(false);
          yield* Deferred.succeed(completed, undefined);
          expect(yield* Deferred.await(spoken)).toContain("The approach preserves compatibility.");
          yield* service.select(owner, { threadId: second, callId: "call" });
          expect(prepared).toHaveLength(1);
          expect(closed).toEqual([]);
          expect(contexts.at(-1)).toContain(second);
          const target = yield* service
            .events(owner, { threadId: first, callId: "call" })
            .pipe(Stream.take(1), Stream.runCollect);
          expect(target[0]?.threadId).toBe(second);
          yield* service.stop(stranger, { threadId: first, callId: "call" });
          expect(closed).toEqual([]);
          yield* service.stop(owner, { threadId: second, callId: "call" });
          expect(closed).toEqual([first]);
          expect(
            decode(yield* native.invoke("late", "t3_send_message", { message: "late" })).error,
          ).toContain("ended");
          expect(sent).toHaveLength(1);
          yield* service.start(owner, { threadId: first, callId: "transport", sdp: "offer" });
          yield* Queue.offer(nativeEvents, { type: "closed", callId: "transport", sequence: 1 });
          yield* Deferred.await(transportClosed);
          expect(closed).toEqual([first, first]);
          expect(
            decode(
              yield* prepared[1]!.invoke("late-after-transport", "t3_send_message", {
                message: "late",
              }),
            ).error,
          ).toContain("ended");
          validOwner = false;
          expect(
            (yield* Effect.exit(
              service.start(owner, { threadId: first, callId: "revoked", sdp: "offer" }),
            ))._tag,
          ).toBe("Failure");
        }).pipe(Effect.provide(layer));
      }),
    ),
);
