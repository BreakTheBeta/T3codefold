import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  NodeId,
  ProjectId,
  ProviderInstanceId,
  ProviderSessionId,
  RuntimeRequestId,
  ThreadId,
  type OrchestrationV2Command,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { EventSinkV2, layer as eventSinkLayer } from "./EventSink.ts";
import { layer as eventStoreLayer } from "./EventStore.ts";
import { layer as projectionStoreLayer } from "./ProjectionStore.ts";
import { OrchestratorV2 } from "./Orchestrator.ts";
import { makeLayer as registryLayer } from "./ProviderAdapterRegistry.ts";
import { makeOrchestratorV2ReplayLayerWithRegistry } from "./testkit/ProviderReplayHarness.ts";

const databaseLayer = SqlitePersistenceMemory;
const storesLayer = Layer.mergeAll(eventStoreLayer, projectionStoreLayer).pipe(
  Layer.provideMerge(databaseLayer),
);
const TestLayer = Layer.mergeAll(
  storesLayer,
  eventSinkLayer.pipe(Layer.provide(storesLayer)),
  makeOrchestratorV2ReplayLayerWithRegistry({ name: "thread-arrangement" }, registryLayer([]), {
    databaseLayer,
    runEffectWorker: false,
  }),
);
const projectId = ProjectId.make("arrangement-project");
const modelSelection = { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" };
const baseline = DateTime.makeUnsafe("2026-01-01T00:00:00Z");

const createThread = Effect.fn("createArrangementThread")(function* (name: string) {
  const orchestrator = yield* OrchestratorV2;
  const threadId = ThreadId.make(name);
  yield* orchestrator.dispatch({
    type: "thread.create",
    commandId: CommandId.make(`create:${name}`),
    threadId,
    projectId,
    title: name,
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: "feature",
    worktreePath: null,
    createdBy: "user",
    creationSource: "web",
  });
  return threadId;
});

it.live("persists active ordering without activity bumps and preserves lifecycle rules", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const orchestrator = yield* OrchestratorV2;
      const threadId = yield* createThread("active-order");
      const initialUpdatedAt = (yield* orchestrator.getThreadProjection(threadId)).thread.updatedAt;
      for (const [index, orderKey] of ["m", "m", "g"].entries()) {
        yield* orchestrator.dispatch({
          type: "thread.active.reorder",
          commandId: CommandId.make(`order:${index}`),
          threadId,
          orderKey,
        });
        const projection = yield* orchestrator.getThreadProjection(threadId);
        assert.equal(projection.thread.activeOrderKey, orderKey);
        assert.equal(
          DateTime.toEpochMillis(projection.thread.updatedAt),
          DateTime.toEpochMillis(initialUpdatedAt),
        );
        assert.equal((yield* orchestrator.getThreadShell(threadId))?.activeOrderKey, orderKey);
      }
      yield* orchestrator.dispatch({
        type: "thread.pin",
        commandId: CommandId.make("pin"),
        threadId,
      });
      assert.equal(
        (yield* orchestrator
          .dispatch({
            type: "thread.active.reorder",
            commandId: CommandId.make("pinned-order"),
            threadId,
            orderKey: "a",
          })
          .pipe(Effect.flip))._tag,
        "OrchestratorDispatchError",
      );
      yield* orchestrator.dispatch({
        type: "thread.unpin",
        commandId: CommandId.make("unpin"),
        threadId,
      });
      yield* orchestrator.dispatch({
        type: "thread.settle",
        commandId: CommandId.make("settle"),
        threadId,
      });
      assert.isNull((yield* orchestrator.getThreadProjection(threadId)).thread.activeOrderKey);
      assert.equal(
        (yield* orchestrator
          .dispatch({
            type: "thread.active.reorder",
            commandId: CommandId.make("settled-order"),
            threadId,
            orderKey: "a",
          })
          .pipe(Effect.flip))._tag,
        "OrchestratorDispatchError",
      );
    }),
  ).pipe(Effect.provide(TestLayer)),
);

it.live("guards discovered PR links against changed thread and project state", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`INSERT INTO projection_projects (project_id, title, workspace_root, default_model_selection_json, scripts_json, created_at, updated_at) VALUES (${projectId}, 'project', '/workspace', NULL, '[]', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`;
      const orchestrator = yield* OrchestratorV2;
      const threadId = yield* createThread("pr-guard");
      const initialUpdatedAt = (yield* orchestrator.getThreadProjection(threadId)).thread.updatedAt;
      const ref = {
        projectId,
        repository: "owner/repo",
        number: 42,
        url: "https://github.com/owner/repo/pull/42",
      };
      const command = {
        type: "thread.pull-request.sync",
        commandId: CommandId.make("pr:first"),
        threadId,
        projectId,
        snapshotSequence: 0,
        expected: {
          workspaceRoot: "/workspace",
          branch: "feature",
          worktreePath: null,
          linkedPullRequest: null,
          branchPullRequest: null,
        },
        branchPullRequest: ref,
      } satisfies OrchestrationV2Command;
      yield* orchestrator.dispatch(command);
      const linked = yield* orchestrator.getThreadProjection(threadId);
      assert.deepEqual(linked.thread.branchPullRequest, ref);
      assert.equal(
        DateTime.toEpochMillis(linked.thread.updatedAt),
        DateTime.toEpochMillis(initialUpdatedAt),
      );
      assert.equal(
        (yield* orchestrator
          .dispatch({ ...command, commandId: CommandId.make("pr:stale") })
          .pipe(Effect.flip))._tag,
        "OrchestratorDispatchError",
      );
      yield* sql`UPDATE projection_projects SET workspace_root = '/moved' WHERE project_id = ${projectId}`;
      assert.equal(
        (yield* orchestrator
          .dispatch({
            ...command,
            commandId: CommandId.make("pr:moved"),
            expected: { ...command.expected, branchPullRequest: ref },
            branchPullRequest: null,
          })
          .pipe(Effect.flip))._tag,
        "OrchestratorDispatchError",
      );
      assert.deepEqual(
        (yield* orchestrator.getThreadProjection(threadId)).thread.branchPullRequest,
        ref,
      );
    }),
  ).pipe(Effect.provide(TestLayer)),
);

const seedQuestion = Effect.fn("seedArrangementQuestion")(function* (
  threadId: ThreadId,
  name: string,
  mode: "message" | "live",
) {
  const sink = yield* EventSinkV2;
  const requestId = RuntimeRequestId.make(name);
  const nodeId = NodeId.make(`node:${name}`);
  yield* sink.write({
    events: [
      {
        type: "runtime-request.updated",
        id: EventId.make(`request:${name}`),
        threadId,
        nodeId,
        occurredAt: baseline,
        payload: {
          id: requestId,
          nodeId,
          providerTurnId: null,
          nativeRequestRef: null,
          kind: "user_input",
          status: "pending",
          responseCapability:
            mode === "message"
              ? { type: "message" }
              : { type: "live", providerSessionId: ProviderSessionId.make("session") },
          createdAt: baseline,
          resolvedAt: null,
        },
      },
    ],
  });
  return requestId;
});

it.live(
  "dismisses async questions without messages, while native questions and automatic settlement remain blocked",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const orchestrator = yield* OrchestratorV2;
        const threadId = yield* createThread("question-dismiss");
        const requestId = yield* seedQuestion(threadId, "async", "message");
        yield* orchestrator.dispatch({
          type: "runtime-request.dismiss",
          commandId: CommandId.make("dismiss"),
          threadId,
          requestId,
        });
        let projection = yield* orchestrator.getThreadProjection(threadId);
        assert.equal(projection.runtimeRequests[0]?.status, "resolved");
        assert.isEmpty(projection.messages);
        assert.isEmpty(projection.runs);
        yield* seedQuestion(threadId, "async-settle", "message");
        assert.equal(
          (yield* orchestrator
            .dispatch({
              type: "thread.auto-settle",
              commandId: CommandId.make("auto-settle"),
              threadId,
              snapshotAt: yield* DateTime.now,
            })
            .pipe(Effect.flip))._tag,
          "OrchestratorDispatchError",
        );
        yield* orchestrator.dispatch({
          type: "thread.settle",
          commandId: CommandId.make("manual-settle"),
          threadId,
        });
        projection = yield* orchestrator.getThreadProjection(threadId);
        assert.equal(projection.thread.settledOverride, "settled");
        assert.isTrue(projection.runtimeRequests.every((request) => request.status === "resolved"));
        assert.isEmpty(projection.messages);
        const nativeThread = yield* createThread("native-question");
        const nativeRequest = yield* seedQuestion(nativeThread, "native", "live");
        assert.equal(
          (yield* orchestrator
            .dispatch({
              type: "runtime-request.dismiss",
              commandId: CommandId.make("native-dismiss"),
              threadId: nativeThread,
              requestId: nativeRequest,
            })
            .pipe(Effect.flip))._tag,
          "OrchestratorDispatchError",
        );
        assert.equal(
          (yield* orchestrator
            .dispatch({
              type: "thread.settle",
              commandId: CommandId.make("native-settle"),
              threadId: nativeThread,
            })
            .pipe(Effect.flip))._tag,
          "OrchestratorDispatchError",
        );
      }),
    ).pipe(Effect.provide(TestLayer)),
);
