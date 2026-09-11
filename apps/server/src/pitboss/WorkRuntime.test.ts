import { expect, it } from "@effect/vitest";
import {
  CommandId,
  PitbossAction,
  EventId,
  MessageId,
  NodeId,
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2Run,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import {
  emptyProjection,
  ProjectionStoreThreadNotFoundError,
} from "../orchestration-v2/ProjectionStore.ts";
import { OrchestratorProjectionError } from "../orchestration-v2/Orchestrator.ts";
import {
  ThreadManagementService,
  ThreadManagementProjectionLoadError,
} from "../orchestration-v2/ThreadManagementService.ts";
import { ThreadLaunchService, ThreadLaunchError } from "../orchestration-v2/ThreadLaunchService.ts";
import { PeerService } from "./PeerService.ts";
import { WorkStore, layer as storeLayer } from "./WorkStore.ts";
import { layer as runtime } from "./WorkRuntime.ts";

const decodeAction = Schema.decodeUnknownSync(Schema.fromJsonString(PitbossAction));
const time = DateTime.makeUnsafe("2026-09-11T00:00:00Z");
const model = { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.6-luna" };
const a = ProjectId.make("A"),
  b = ProjectId.make("B"),
  boss = ThreadId.make("boss");
function projection(threadId: ThreadId, projectId: ProjectId) {
  return emptyProjection({
    id: EventId.make(`created-${threadId}`),
    type: "thread.created",
    threadId,
    occurredAt: time,
    payload: {
      id: threadId,
      projectId,
      title: "Runtime fixture",
      createdBy: "user",
      creationSource: "web",
      providerInstanceId: model.instanceId,
      modelSelection: model,
      runtimeMode: "approval-required",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      activeProviderThreadId: null,
      lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
      forkedFrom: null,
      createdAt: time,
      updatedAt: time,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
      deletedAt: null,
    },
  });
}
function running(threadId: ThreadId): OrchestrationV2Run {
  return {
    id: RunId.make(`run-${threadId}`),
    threadId,
    ordinal: 1,
    providerInstanceId: model.instanceId,
    modelSelection: model,
    providerThreadId: null,
    userMessageId: MessageId.make(`message-${threadId}`),
    rootNodeId: NodeId.make(`node-${threadId}`),
    activeAttemptId: null,
    status: "running",
    queuePosition: null,
    requestedAt: time,
    startedAt: time,
    completedAt: null,
    checkpointId: null,
    contextHandoffId: null,
  };
}
const harness = Effect.gen(function* () {
  const store = yield* WorkStore;
  const projections = new Map<ThreadId, OrchestrationV2ThreadProjection>([
    [boss, projection(boss, a)],
  ]);
  const launched: ThreadId[] = [];
  const sent: ThreadId[] = [];
  const failLaunch = new Set<ThreadId>();
  const command = (action: PitbossAction) =>
    Effect.gen(function* () {
      const state = yield* store.read();
      return yield* store.command(
        {
          commandId: CommandId.make(`command-${state.revision}`),
          expectedRevision: state.revision,
          action,
        },
        { type: "user" },
      );
    });
  yield* command({
    type: "elect",
    threadId: boss,
    projectId: a,
    brief: {
      priorities: "Fixture",
      quality: "Run checks",
      projectIds: [a, b],
      maxWorkers: 2,
      maxAttempts: 2,
      workerModel: model,
    },
  });
  for (const effect of yield* store.effects()) yield* store.finishEffect(effect.operation_id);
  const services = Layer.mergeAll(
    Layer.succeed(WorkStore, store),
    Layer.mock(PeerService)({}),
    Layer.mock(ThreadLaunchService)({
      launch: (input) =>
        Effect.gen(function* () {
          const id = input.threadId!;
          launched.push(id);
          if (failLaunch.has(id))
            return yield* new ThreadLaunchError({
              operation: "provision-worktree",
              commandId: input.commandId,
              projectId: input.projectId,
              threadId: id,
              cause: "fixture failure",
            });
          const result = { ...projection(id, input.projectId), runs: [running(id)] };
          projections.set(id, result);
          return { threadId: id, projection: result, resumed: false };
        }),
    }),
    Layer.mock(ThreadManagementService)({
      streamDomainEvents: Stream.never,
      getProjectThread: (input) => {
        const p = projections.get(input.threadId);
        return p
          ? Effect.succeed(p)
          : Effect.fail(
              new ThreadManagementProjectionLoadError({
                projectId: input.projectId,
                threadId: input.threadId,
                cause: new OrchestratorProjectionError({
                  threadId: input.threadId,
                  cause: new ProjectionStoreThreadNotFoundError({ threadId: input.threadId }),
                }),
              }),
            );
      },
      sendToThread: (input) =>
        Effect.sync(() => {
          sent.push(input.threadId);
          const run = running(input.threadId);
          const p = { ...projections.get(input.threadId)!, runs: [run] };
          projections.set(input.threadId, p);
          return {
            dispatch: { sequence: 1, storedEvents: [] },
            projection: p,
            run,
            turnItem: null,
            delivery: "started" as const,
            message: {
              id: input.messageId!,
              threadId: input.threadId,
              runId: run.id,
              nodeId: null,
              role: "user" as const,
              text: input.text,
              attachments: [],
              streaming: false,
              createdBy: "agent" as const,
              creationSource: "mcp" as const,
              createdAt: time,
              updatedAt: time,
            },
          };
        }),
    }),
  );
  const drain = () => runtime.pipe(Layer.provide(services), Layer.build, Effect.scoped);
  const lead = (id: string, projectId: ProjectId) =>
    command({
      type: "create-lead",
      leadId: id,
      projectId,
      charter: "Own this project",
      model,
      maxWorkers: 1,
    }).pipe(Effect.map((s) => s.leads!.find((x) => x.id === id)!));
  return { store, projections, launched, sent, failLaunch, command, drain, lead };
});
const services = storeLayer.pipe(Layer.provideMerge(SqlitePersistenceMemory));
it.effect(
  "a missing failed lead does not occupy the coordinator slot, and can be retried after restart",
  () =>
    Effect.gen(function* () {
      const h = yield* harness;
      const broken = yield* h.lead("broken", a);
      const healthy = yield* h.lead("healthy", b);
      for (const effect of yield* h.store.effects()) {
        const action = decodeAction(effect.payload_json);
        if (action.type === "create-lead" && action.leadId === healthy.id)
          yield* h.store.finishEffect(effect.operation_id);
      }
      h.failLaunch.add(broken.threadId);
      h.projections.set(healthy.threadId, projection(healthy.threadId, b));
      yield* h.drain();
      expect(h.sent).toContain(healthy.threadId);
      expect(
        (yield* h.store.read()).messages.some((m) =>
          m.text.includes("Work delivery needs attention"),
        ),
      ).toBe(true);
      yield* h.store.rebuild();
      h.failLaunch.clear();
      h.projections.set(healthy.threadId, projection(healthy.threadId, b));
      yield* h.command({ type: "lead-status", leadId: broken.id, status: "active" });
      yield* h.drain();
      expect(h.projections.has(broken.threadId)).toBe(true);
      expect(h.launched.filter((id) => id === broken.threadId)).toHaveLength(2);
    }).pipe(Effect.provide(services)),
);
it.effect("queued lead dispatch stays durable while paused and starts once on resume", () =>
  Effect.gen(function* () {
    const h = yield* harness;
    const first = yield* h.lead("first", a);
    h.projections.set(first.threadId, {
      ...projection(first.threadId, a),
      runs: [running(first.threadId)],
    });
    for (const effect of yield* h.store.effects()) yield* h.store.finishEffect(effect.operation_id);
    const second = yield* h.lead("second", b);
    yield* h.drain();
    expect(h.launched).toEqual([]);
    yield* h.command({ type: "pause", paused: true });
    h.projections.set(first.threadId, projection(first.threadId, a));
    yield* h.drain();
    expect(h.launched).toEqual([]);
    expect((yield* h.store.effects()).some((e) => e.kind === "create-lead")).toBe(true);
    yield* h.command({ type: "pause", paused: false });
    yield* h.drain();
    expect(h.launched).toEqual([second.threadId]);
    yield* h.drain();
    expect(h.launched).toEqual([second.threadId]);
  }).pipe(Effect.provide(services)),
);

for (const hasPreparingRun of [false, true]) {
  it.effect(
    `replays an unfinished original lead launch with existing thread (preparing=${hasPreparingRun})`,
    () =>
      Effect.gen(function* () {
        const h = yield* harness;
        const lead = yield* h.lead("partial", a);
        h.projections.set(lead.threadId, {
          ...projection(lead.threadId, a),
          runs: hasPreparingRun ? [{ ...running(lead.threadId), status: "preparing" }] : [],
        });
        yield* h.drain();
        expect(h.launched).toEqual([lead.threadId]);
        expect(h.sent).not.toContain(lead.threadId);
        expect((yield* h.store.effects()).filter((e) => e.kind === "create-lead")).toEqual([]);
      }).pipe(Effect.provide(services)),
  );
}
