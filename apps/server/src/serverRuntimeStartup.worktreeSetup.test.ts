import {
  EventId,
  type OrchestrationV2Command,
  RunId,
  ThreadId,
  WORKTREE_SETUP_ACTIVITY_KIND,
  WorktreeSetupSnapshot,
  worktreeSetupActivityId,
  type WorktreeSetupPhase,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as ThreadManagement from "./orchestration-v2/ThreadManagementService.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as ServerRuntimeStartup from "./serverRuntimeStartup.ts";

const startedAt = "2026-08-20T12:00:00.000Z";

const snapshotFor = (
  threadId: ThreadId,
  phase: WorktreeSetupPhase,
  agentStatus: "pending" | "done" = phase === "running" ? "pending" : "done",
): WorktreeSetupSnapshot => ({
  threadId,
  phase,
  startedAt,
  endedAt: phase === "running" ? null : startedAt,
  branch: "feature",
  baseRef: "main",
  worktreePath: null,
  setupScript: null,
  stages: [
    {
      id: "checkout",
      status: "done",
      startedAt,
      endedAt: startedAt,
      percent: null,
      detail: null,
      tail: [],
    },
    {
      id: "setup-script",
      status: phase === "running" ? "running" : "done",
      startedAt,
      endedAt: phase === "running" ? null : startedAt,
      percent: null,
      detail: null,
      tail: [],
    },
    {
      id: "agent",
      status: agentStatus,
      startedAt: null,
      endedAt: null,
      percent: null,
      detail: null,
      tail: [],
    },
  ],
  error: null,
  sequence: 4,
});

const recordedSetup = (id: string, phase: WorktreeSetupPhase, agentStatus?: "pending" | "done") => {
  const threadId = ThreadId.make(id);
  return {
    id: EventId.make(worktreeSetupActivityId(threadId)),
    tone: "info" as const,
    kind: WORKTREE_SETUP_ACTIVITY_KIND,
    summary: "Setting up worktree",
    payload: snapshotFor(threadId, phase, agentStatus),
    turnId: null,
    createdAt: startedAt,
  };
};

const run = (activities: ReadonlyArray<ReturnType<typeof recordedSetup>>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TABLE orchestration_v2_projection_threads (thread_id TEXT, deleted_at TEXT)`;
    yield* sql`CREATE TABLE orchestration_v2_projection_turn_items (thread_id TEXT, run_id TEXT, type TEXT, payload_json TEXT)`;
    for (const activity of activities) {
      yield* sql`INSERT INTO orchestration_v2_projection_threads VALUES (${activity.payload.threadId}, NULL)`;
      yield* sql`INSERT INTO orchestration_v2_projection_turn_items VALUES (${activity.payload.threadId}, ${RunId.make(`run:${activity.payload.threadId}`)}, 'command_execution', ${yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Struct({ worktreeSetup: WorktreeSetupSnapshot })))({ worktreeSetup: activity.payload })})`;
    }
    const dispatched: Array<OrchestrationV2Command> = [];
    yield* ServerRuntimeStartup.reconcileWorktreeSetups.pipe(
      Effect.provideService(ThreadManagement.ThreadManagementService, {
        dispatch: (command: OrchestrationV2Command) =>
          Effect.sync(() => {
            dispatched.push(command);
            return { sequence: dispatched.length };
          }),
      } as unknown as ThreadManagement.ThreadManagementService["Service"]),
    );
    return dispatched;
  }).pipe(Effect.provide(NodeSqliteClient.layerMemory()));

it.effect("marks setups still recorded as running failed after a restart", () =>
  Effect.gen(function* () {
    const dispatched = yield* run([
      recordedSetup("thread-running", "running"),
      recordedSetup("thread-done", "done"),
      recordedSetup("thread-failed", "failed"),
    ]);

    assert.equal(dispatched.length, 1);
    const command = dispatched[0]!;
    assert.equal(command.type, "prepared-run.progress");
    if (command.type !== "prepared-run.progress") return;
    assert.equal(command.threadId, ThreadId.make("thread-running"));
    const payload = yield* Schema.decodeUnknownEffect(WorktreeSetupSnapshot)(command.snapshot);
    assert.equal(payload.phase, "failed");
    assert.isNotNull(payload.endedAt);
    assert.equal(payload.sequence, 5);
    assert.deepEqual(
      payload.stages.map((stage) => stage.status),
      ["done", "failed", "failed"],
    );
  }),
);

it.effect(
  "settles an async setup script whose turn already started without failing the setup",
  () =>
    Effect.gen(function* () {
      const dispatched = yield* run([recordedSetup("thread-async", "running", "done")]);

      assert.equal(dispatched.length, 1);
      const command = dispatched[0]!;
      if (command.type !== "prepared-run.progress") return assert.fail(command.type);
      const payload = yield* Schema.decodeUnknownEffect(WorktreeSetupSnapshot)(command.snapshot);
      // The turn is live; only the background script was lost. Nothing asks the
      // user to resend, and the setup reads as done with a failed script stage.
      assert.equal(payload.phase, "done");
      assert.isNull(payload.error);
      assert.deepEqual(
        payload.stages.map((stage) => stage.status),
        ["done", "failed", "done"],
      );
    }),
);
