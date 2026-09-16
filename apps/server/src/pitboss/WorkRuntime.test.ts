import { expect, it } from "@effect/vitest";
import {
  CommandId,
  PitbossAction,
  EventId,
  EnvironmentId,
  MessageId,
  NodeId,
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2ThreadLaunchInput,
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
import { readyTasks } from "./Work.ts";

const decodeAction = Schema.decodeUnknownSync(Schema.fromJsonString(PitbossAction));
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
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
  const launches: OrchestrationV2ThreadLaunchInput[] = [];
  const launchModes: string[] = [];
  const permissionModes: string[] = [];
  let failPermissions = false;
  const sent: ThreadId[] = [];
  const sentMessages: Array<{
    readonly threadId: ThreadId;
    readonly text: string;
    readonly createdBy: string;
    readonly creationSource: string;
  }> = [];
  const sendAttempts: string[] = [];
  let failNextSend = false;
  let failAllSends = false;
  const interrupted: ThreadId[] = [];
  let deferInterrupt = false;
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
          launches.push(input);
          launchModes.push(input.runtimeMode);
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
      dispatch: (command) =>
        Effect.gen(function* () {
          if (command.type === "thread.runtime-mode.set") {
            if (failPermissions) {
              failPermissions = false;
              return yield* new OrchestratorProjectionError({
                threadId: command.threadId,
                cause: "fixture permission failure",
              });
            }
            permissionModes.push(command.runtimeMode);
            const p = projections.get(command.threadId)!;
            projections.set(command.threadId, {
              ...p,
              thread: { ...p.thread, runtimeMode: command.runtimeMode },
            });
          }
          return { sequence: 1, storedEvents: [] };
        }),
      streamDomainEvents: Stream.never,
      getThreadProjection: (id) => Effect.succeed(projections.get(id)!),
      interruptThread: (input) =>
        Effect.sync(() => {
          interrupted.push(input.threadId);
          if (!deferInterrupt) {
            const p = projections.get(input.threadId)!;
            projections.set(input.threadId, { ...p, runs: [] });
          }
          return { type: "no_active_run" as const };
        }),
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
        Effect.gen(function* () {
          sendAttempts.push(input.commandId);
          if (failAllSends || failNextSend) {
            failNextSend = false;
            return yield* new OrchestratorProjectionError({
              threadId: input.threadId,
              cause: "fixture wake delivery failure",
            });
          }
          sent.push(input.threadId);
          sentMessages.push({
            threadId: input.threadId,
            text: input.text,
            createdBy: input.createdBy,
            creationSource: input.creationSource,
          });
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
  return {
    store,
    projections,
    launched,
    launches,
    launchModes,
    permissionModes,
    failPermissions: () => {
      failPermissions = true;
    },
    sent,
    sentMessages,
    sendAttempts,
    failNextSend: () => {
      failNextSend = true;
    },
    failAllSends: () => {
      failAllSends = true;
    },
    interrupted,
    deferInterrupt: () => {
      deferInterrupt = true;
    },
    failLaunch,
    command,
    drain,
    lead,
  };
});
const services = storeLayer.pipe(Layer.provideMerge(SqlitePersistenceMemory));
it.effect(
  "does not wake GLaDOS again when its no-op turn leaves the same task ready across restart",
  () =>
    Effect.gen(function* () {
      const h = yield* harness;
      yield* h.command({
        type: "create",
        taskId: "ready-once",
        projectId: a,
        title: "Ready once",
        outcome: "Assign this managed task",
        criteria: "Worker reports once",
        verifyCommand: "",
        priority: 1,
        dependencies: [],
        workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
      });
      yield* h.drain();
      expect(h.sent).toEqual([boss]);
      const unchangedRevision = (yield* h.store.read()).revision;
      h.projections.set(boss, projection(boss, a));
      const unrelated = ThreadId.make("unrelated-worker");
      h.projections.set(unrelated, { ...projection(unrelated, b), runs: [running(unrelated)] });
      yield* h.drain();
      expect((yield* h.store.read()).revision).toBe(unchangedRevision);
      expect(h.sent).toEqual([boss]);
    }).pipe(Effect.provide(services)),
);
it.effect("does not re-wake the same assign obligation for an unrelated task revision", () =>
  Effect.gen(function* () {
    const h = yield* harness;
    yield* h.command({
      type: "create",
      taskId: "stable-assign-obligation",
      projectId: a,
      title: "Stable assign obligation",
      outcome: "Assign once",
      criteria: "Worker returns evidence",
      verifyCommand: "",
      priority: 10,
      dependencies: [],
      workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
    });
    yield* h.drain();
    expect(h.sent).toEqual([boss]);
    h.projections.set(boss, projection(boss, a));
    yield* h.command({
      type: "edit",
      taskId: "stable-assign-obligation",
      projectId: a,
      title: "Stable assign obligation",
      outcome: "Assign once",
      criteria: "Worker returns evidence",
      verifyCommand: "",
      priority: 11,
      dependencies: [],
      workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
    });
    yield* h.drain();
    expect(h.sent).toEqual([boss]);
  }).pipe(Effect.provide(services)),
);
it.effect("wakes once for a failed managed attempt and leaves recovery explicit", () =>
  Effect.gen(function* () {
    const h = yield* harness;
    yield* h.command({
      type: "create",
      taskId: "failed-attempt",
      projectId: a,
      title: "Failed attempt",
      outcome: "Recover the managed failure",
      criteria: "A later attempt returns evidence",
      verifyCommand: "",
      priority: 1,
      dependencies: [],
      workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
    });
    yield* h.command({ type: "assign", taskId: "failed-attempt" });
    yield* h.drain();
    const attempt = (yield* h.store.read()).tasks[0]!.attempts[0]!;
    yield* h.store.updateAttempt(
      "failed-attempt",
      attempt.id,
      "failed",
      "Provider exited before producing evidence",
    );
    yield* h.drain();
    expect((yield* h.store.read()).tasks[0]?.status).toBe("blocked");
    expect(h.sentMessages[0]?.text).toContain(
      `Recovery needed · task failed-attempt · attempt ${attempt.id} · owner GLaDOS`,
    );
    h.projections.set(boss, projection(boss, a));
    yield* h.drain();
    expect(h.sent).toEqual([boss]);
  }).pipe(Effect.provide(services)),
);
it.effect("wakes once for each changed failed review and not again after restart", () =>
  Effect.gen(function* () {
    const h = yield* harness;
    yield* h.command({
      type: "create",
      taskId: "stable-review",
      projectId: a,
      title: "Stable review",
      outcome: "Review the failed attempt once",
      criteria: "One review wake",
      verifyCommand: "",
      priority: 1,
      dependencies: [],
      workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
    });
    yield* h.command({ type: "assign", taskId: "stable-review" });
    yield* h.drain();
    const attempt = (yield* h.store.read()).tasks[0]!.attempts[0]!;
    yield* h.store.updateAttempt("stable-review", attempt.id, "failed", "Provider failed");
    yield* h.drain();
    expect(h.sent).toEqual([boss]);
    h.projections.set(boss, projection(boss, a));
    yield* h.command({
      type: "review",
      taskId: "stable-review",
      attemptId: attempt.id,
      criteriaVersion: 1,
      candidate: `commit:${"a".repeat(40)}`,
      verdict: "fail",
      summary: "Diagnostics confirm the same failed attempt.",
      command: "vp test run focused.test.ts",
      artifactUrls: [],
    });
    yield* h.drain();
    expect(h.sent).toEqual([boss, boss]);
    expect(h.sentMessages.at(-1)?.text).toContain("Recovery needed");
    h.projections.set(boss, projection(boss, a));
    yield* h.command({
      type: "review",
      taskId: "stable-review",
      attemptId: attempt.id,
      criteriaVersion: 1,
      candidate: `commit:${"b".repeat(40)}`,
      verdict: "inconclusive",
      summary: "A different retained candidate is still inconclusive.",
      command: "vp test run focused.test.ts",
      artifactUrls: [],
    });
    yield* h.drain();
    expect(h.sent).toEqual([boss, boss, boss]);
    h.projections.set(boss, projection(boss, a));
    yield* h.drain();
    expect(h.sent).toEqual([boss, boss, boss]);
  }).pipe(Effect.provide(services)),
);
it.effect("resumes a retained candidate after explicit rework and reopen", () =>
  Effect.gen(function* () {
    const h = yield* harness;
    yield* h.command({
      type: "create",
      taskId: "retained-rework",
      projectId: a,
      title: "Retained rework",
      outcome: "Repair the retained candidate",
      criteria: "Replacement evidence passes",
      verifyCommand: "vp test run focused.test.ts",
      priority: 1,
      dependencies: [],
      workspaceStrategy: {
        type: "existing_worktree",
        worktreePath: "/tmp/retained-rework",
      },
    });
    yield* h.command({ type: "assign", taskId: "retained-rework" });
    yield* h.drain();
    const first = (yield* h.store.read()).tasks[0]!.attempts[0]!;
    yield* h.store.updateAttempt(
      "retained-rework",
      first.id,
      "stopped",
      "Candidate retained for review",
      "/tmp/retained-rework",
    );
    yield* h.command({
      type: "review",
      taskId: "retained-rework",
      attemptId: first.id,
      criteriaVersion: 1,
      candidate: `commit:${"a".repeat(40)}`,
      verdict: "inconclusive",
      summary: "The retained candidate needs another implementation pass.",
      command: "vp test run focused.test.ts",
      artifactUrls: [],
    });
    yield* h.command({
      type: "rework",
      taskId: "retained-rework",
      note: "Repair the inconclusive candidate in its retained workspace.",
    });
    yield* h.command({ type: "reopen", taskId: "retained-rework" });
    expect(readyTasks(yield* h.store.read()).map((task) => task.id)).toEqual(["retained-rework"]);
    h.projections.set(boss, projection(boss, a));
    yield* h.drain();
    expect(h.sentMessages.at(-1)?.text).toContain(
      `Rework ready · task retained-rework · attempt ${first.id} · owner GLaDOS`,
    );
    expect(h.sentMessages.at(-1)?.text).toContain(`resumeAttemptId ${first.id}`);
    yield* h.command({
      type: "assign",
      taskId: "retained-rework",
      resumeAttemptId: first.id,
    });
    yield* h.drain();
    const resumed = (yield* h.store.read()).tasks[0]!;
    const second = resumed.attempts.at(-1)!;
    expect(second.id).not.toBe(first.id);
    expect(second.workspacePath).toBe("/tmp/retained-rework");
    expect(resumed.evidence).toHaveLength(1);
    yield* h.store.command(
      {
        commandId: CommandId.make("retained-rework-submit"),
        expectedRevision: (yield* h.store.read()).revision,
        action: {
          type: "submit",
          taskId: resumed.id,
          attemptId: second.id,
          criteriaVersion: resumed.criteriaVersion,
          candidate: `commit:${"b".repeat(40)}`,
          verdict: "pass",
          summary: "Replacement candidate is ready for verification.",
          command: "vp test run focused.test.ts",
          artifactUrls: [],
        },
      },
      { type: "agent", threadId: second.threadId },
    );
    const submitted = (yield* h.store.read()).tasks[0]!;
    expect(submitted.attempts.map((attempt) => attempt.state)).toEqual(["stopped", "submitted"]);
    expect(submitted.evidence.map((evidence) => evidence.verdict)).toEqual([
      "inconclusive",
      "pass",
    ]);
    expect(submitted.acceptedEvidenceId).toBeNull();
  }).pipe(Effect.provide(services)),
);
it.effect("changes a submitted result from await-writer to review after the worker drains", () =>
  Effect.gen(function* () {
    const h = yield* harness;
    yield* h.command({
      type: "create",
      taskId: "submitted-result",
      projectId: a,
      title: "Submitted result",
      outcome: "Return a candidate",
      criteria: "Review the candidate",
      verifyCommand: "vp test run focused.test.ts",
      priority: 1,
      dependencies: [],
      workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
    });
    yield* h.command({ type: "assign", taskId: "submitted-result" });
    yield* h.drain();
    const assigned = (yield* h.store.read()).tasks[0]!;
    const attempt = assigned.attempts[0]!;
    yield* h.store.command(
      {
        commandId: CommandId.make("submit-result"),
        expectedRevision: (yield* h.store.read()).revision,
        action: {
          type: "submit",
          taskId: assigned.id,
          attemptId: attempt.id,
          criteriaVersion: assigned.criteriaVersion,
          candidate: "commit:abc123",
          verdict: "pass",
          summary: "Focused test passed",
          command: "vp test run focused.test.ts",
          artifactUrls: [],
        },
      },
      { type: "agent", threadId: attempt.threadId },
    );
    yield* h.drain();
    expect(h.sentMessages[0]?.text).toContain(
      `Result submitted · task submitted-result · attempt ${attempt.id} · owner GLaDOS`,
    );
    expect(h.sentMessages[0]?.text).toContain(
      "Next: wait for the worker to stop, then run the required verification.",
    );
    h.projections.set(boss, projection(boss, a));
    const worker = h.projections.get(attempt.threadId)!;
    h.projections.set(attempt.threadId, {
      ...worker,
      runs: [{ ...running(attempt.threadId), status: "completed", completedAt: time }],
    });
    yield* h.drain();
    const submitted = (yield* h.store.read()).tasks[0]!;
    expect(submitted.status).toBe("verifying");
    expect(submitted.acceptedEvidenceId).toBeNull();
    expect(h.sentMessages[1]?.text).toContain(
      `Result ready for review · task submitted-result · attempt ${attempt.id} · owner GLaDOS`,
    );
    expect(h.sentMessages[1]?.text).toContain(
      "Next: inspect the reported evidence and record review; do not accept the stopped turn itself.",
    );
    h.projections.set(boss, projection(boss, a));
    yield* h.drain();
    expect(h.sent).toEqual([boss, boss]);
    yield* h.command({
      type: "review",
      taskId: submitted.id,
      attemptId: attempt.id,
      criteriaVersion: submitted.criteriaVersion,
      candidate: `commit:${"a".repeat(40)}`,
      verdict: "pass",
      summary: "Coordinator inspected the retained candidate",
      command: "vp test run focused.test.ts",
      artifactUrls: [],
    });
    yield* h.drain();
    expect(h.sent).toEqual([boss, boss, boss]);
    expect(h.sentMessages.at(-1)?.text).toContain("Acceptance needed");
    h.projections.set(boss, projection(boss, a));
    yield* h.drain();
    expect(h.sent).toEqual([boss, boss, boss]);
    const reviewed = (yield* h.store.read()).tasks[0]!;
    yield* h.command({
      type: "accept",
      taskId: reviewed.id,
      evidenceId: reviewed.evidence.at(-1)!.id,
      note: "Accepted after explicit coordinator review",
    });
    yield* h.drain();
    expect((yield* h.store.read()).tasks[0]!.status).toBe("done");
    expect(h.sent).toEqual([boss, boss, boss]);
  }).pipe(Effect.provide(services)),
);

it.effect(
  "does not offer a retained result for duplicate assignment after setup approval resolves its decision",
  () =>
    Effect.gen(function* () {
      const h = yield* harness;
      yield* h.command({
        type: "create",
        taskId: "approved-retained-result",
        projectId: a,
        title: "Approved retained result",
        outcome: "Verify the retained candidate",
        criteria: "Captured verification and review",
        verifyCommand: "vp test run focused.test.ts",
        priority: 1,
        dependencies: [],
        workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
      });
      yield* h.command({ type: "assign", taskId: "approved-retained-result" });
      yield* h.drain();
      const assigned = (yield* h.store.read()).tasks[0]!;
      const attempt = assigned.attempts[0]!;
      yield* h.store.command(
        {
          commandId: CommandId.make("retained-submit"),
          expectedRevision: (yield* h.store.read()).revision,
          action: {
            type: "submit",
            taskId: assigned.id,
            attemptId: attempt.id,
            criteriaVersion: assigned.criteriaVersion,
            candidate: `commit:${"a".repeat(40)}`,
            verdict: "pass",
            summary: "Candidate retained while setup is approved",
            command: "vp test run focused.test.ts",
            artifactUrls: [],
          },
        },
        { type: "agent", threadId: attempt.threadId },
      );
      yield* h.command({
        type: "request-decision",
        taskId: assigned.id,
        question: "Approve the proposed verification setup?",
        options: ["Approve", "Revise"],
        recommendation: "Approve",
      });
      yield* h.command({
        type: "propose-verification",
        taskId: assigned.id,
        recipe: {
          profileId: "focused",
          mode: "commit",
          environmentId: EnvironmentId.make("verification-host"),
          effects: "observe",
          enabled: true,
          projectId: a,
          version: 1,
          name: "Focused code checks",
          doctor: "command -v vp",
          verify: "vp test run focused.test.ts",
          cleanup: "",
          timeoutSeconds: 60,
          artifacts: [],
        },
      });
      yield* h.drain();
      const parked = (yield* h.store.read()).tasks[0]!;
      expect(parked.attempts[0]?.state).toBe("stopped");
      h.projections.set(boss, projection(boss, a));
      yield* h.command({
        type: "verification-recipe",
        selectForTaskId: assigned.id,
        recipe: parked.proposedVerificationRecipe!,
      });
      const configured = (yield* h.store.read()).tasks[0]!;
      yield* h.command({
        type: "resolve-decision",
        taskId: configured.id,
        decisionId: configured.decisions![0]!.id,
        answer: "Approve",
      });
      yield* h.drain();
      const approved = (yield* h.store.read()).tasks[0]!;
      expect(approved.status).toBe("queued");
      expect(approved.proposedVerificationRecipe).toBeUndefined();
      expect(readyTasks(yield* h.store.read())).toEqual([]);
      expect(h.sentMessages.at(-1)?.text).toContain(
        "Changed: the recorded update preserved the retained result.",
      );
      expect(h.sentMessages.at(-1)?.text).toContain(
        "Next: review the retained candidate against the current criteria before verification.",
      );
      expect(h.sentMessages.at(-1)?.text).not.toContain("Newly ready");
      expect(h.sentMessages.at(-1)?.text).not.toContain("assign a managed worker");
    }).pipe(Effect.provide(services)),
);

it.effect("re-wakes review once when the retained result proof contract changes", () =>
  Effect.gen(function* () {
    const h = yield* harness;
    yield* h.command({
      type: "create",
      taskId: "changed-proof-contract",
      projectId: a,
      title: "Changed proof contract",
      outcome: "Review the retained result under current proof",
      criteria: "Current profile and criteria are reviewed",
      verifyCommand: "vp test run focused.test.ts",
      priority: 1,
      dependencies: [],
      workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
    });
    yield* h.command({ type: "assign", taskId: "changed-proof-contract" });
    yield* h.drain();
    const task = (yield* h.store.read()).tasks[0]!;
    const attempt = task.attempts[0]!;
    yield* h.store.command(
      {
        commandId: CommandId.make("proof-identity-submit"),
        expectedRevision: (yield* h.store.read()).revision,
        action: {
          type: "submit",
          taskId: task.id,
          attemptId: attempt.id,
          criteriaVersion: task.criteriaVersion,
          candidate: `commit:${"a".repeat(40)}`,
          verdict: "pass",
          summary: "Retained candidate",
          command: "vp test run focused.test.ts",
          artifactUrls: [],
        },
      },
      { type: "agent", threadId: attempt.threadId },
    );
    const worker = h.projections.get(attempt.threadId)!;
    h.projections.set(attempt.threadId, {
      ...worker,
      runs: [{ ...running(attempt.threadId), status: "completed", completedAt: time }],
    });
    yield* h.drain();
    expect(h.sent).toEqual([boss]);
    h.projections.set(boss, projection(boss, a));
    yield* h.command({ type: "acknowledge", messageId: "proof-identity-submit" });
    yield* h.command({
      type: "verification-recipe",
      selectForTaskId: task.id,
      recipe: {
        profileId: "focused",
        mode: "commit",
        projectId: a,
        version: 1,
        name: "Focused checks",
        doctor: "command -v vp",
        verify: "vp test run focused.test.ts",
        cleanup: "",
        timeoutSeconds: 60,
        artifacts: [],
      },
    });
    yield* h.drain();
    expect(h.sent).toEqual([boss, boss]);
    expect(h.sentMessages.at(-1)?.text).toContain("Result ready for review");
    h.projections.set(boss, projection(boss, a));
    yield* h.drain();
    expect(h.sent).toEqual([boss, boss]);
  }).pipe(Effect.provide(services)),
);
it.effect("does not offer managed work again while its persisted writer is running", () =>
  Effect.gen(function* () {
    const h = yield* harness;
    yield* h.command({
      type: "create",
      taskId: "linked-writer",
      projectId: a,
      title: "Linked writer",
      outcome: "Run in its managed thread",
      criteria: "Return evidence",
      verifyCommand: "",
      priority: 1,
      dependencies: [],
      workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
    });
    yield* h.command({ type: "assign", taskId: "linked-writer" });
    yield* h.drain();
    const task = (yield* h.store.read()).tasks[0]!;
    expect(task.status).toBe("active");
    expect(task.attempts[0]?.state).toBe("running");
    expect(h.sent).toEqual([]);
    yield* h.drain();
    expect(h.sent).toEqual([]);
  }).pipe(Effect.provide(services)),
);
it.effect("wakes once with an honest review action when a worker finishes without a result", () =>
  Effect.gen(function* () {
    const h = yield* harness;
    yield* h.command({
      type: "create",
      taskId: "unfinished-result",
      projectId: a,
      title: "Unfinished result",
      outcome: "Return verified evidence",
      criteria: "Evidence is reviewed",
      verifyCommand: "",
      priority: 1,
      dependencies: [],
      workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
    });
    yield* h.command({ type: "assign", taskId: "unfinished-result" });
    yield* h.drain();
    const before = (yield* h.store.read()).tasks[0]!;
    const attempt = before.attempts[0]!;
    const worker = h.projections.get(attempt.threadId)!;
    h.projections.set(attempt.threadId, {
      ...worker,
      runs: [{ ...running(attempt.threadId), status: "completed", completedAt: time }],
    });
    yield* h.drain();
    const after = (yield* h.store.read()).tasks[0]!;
    expect(after.status).toBe("blocked");
    expect(after.acceptedEvidenceId).toBeNull();
    expect(after.attempts[0]?.state).toBe("stopped");
    expect(h.sent).toEqual([boss]);
    expect(h.sentMessages[0]).toMatchObject({
      threadId: boss,
      createdBy: "system",
      creationSource: "server",
    });
    expect(h.sentMessages[0]?.text).toContain(
      `Recovery needed · task unfinished-result · attempt ${attempt.id} · owner GLaDOS`,
    );
    expect(h.sentMessages[0]?.text).toContain(
      "Next: inspect the retained thread, then rework or cancel with an honest superseded reason; do not invent evidence for historical work.",
    );
    expect(h.sentMessages[0]?.text).not.toContain("work_read");
    expect(h.sentMessages[0]?.text).not.toContain("Pending user decisions");
    h.projections.set(boss, projection(boss, a));
    yield* h.drain();
    expect(h.sent).toEqual([boss]);
  }).pipe(Effect.provide(services)),
);
it.effect(
  "retries a durable wake after restart without changing work or duplicating delivery",
  () =>
    Effect.gen(function* () {
      const h = yield* harness;
      yield* h.command({
        type: "create",
        taskId: "retry-wake",
        projectId: a,
        title: "Retry wake",
        outcome: "Deliver one actionable wake",
        criteria: "One delivery",
        verifyCommand: "",
        priority: 1,
        dependencies: [],
        workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
      });
      const revision = (yield* h.store.read()).revision;
      h.failNextSend();
      yield* h.drain();
      expect(h.sent).toEqual([]);
      const pending = (yield* h.store.effects()).filter((effect) => effect.kind === "wake");
      expect(pending).toHaveLength(1);
      expect(pending[0]?.attempts).toBe(1);
      expect((yield* h.store.read()).revision).toBe(revision);
      yield* h.drain();
      expect(h.sent).toEqual([boss]);
      expect(h.sendAttempts).toHaveLength(2);
      expect(new Set(h.sendAttempts).size).toBe(1);
      expect((yield* h.store.effects()).filter((effect) => effect.kind === "wake")).toEqual([]);
      expect((yield* h.store.read()).revision).toBe(revision);
    }).pipe(Effect.provide(services)),
);
it.effect("delivers a ready obligation after capacity is temporarily unavailable", () =>
  Effect.gen(function* () {
    const h = yield* harness;
    const create = (taskId: string) =>
      h.command({
        type: "create",
        taskId,
        projectId: a,
        title: taskId,
        outcome: "Complete managed work",
        criteria: "Report evidence",
        verifyCommand: "",
        priority: 1,
        dependencies: [],
        workspaceStrategy: { type: "worktree" as const, baseRef: "HEAD" },
      });
    yield* create("deferred-ready");
    h.failNextSend();
    yield* h.drain();
    expect(h.sent).toEqual([]);
    for (const taskId of ["capacity-one", "capacity-two"]) {
      yield* create(taskId);
      yield* h.command({ type: "assign", taskId });
    }
    yield* h.drain();
    expect(h.sent).toEqual([]);
    const occupied = yield* h.store.read();
    for (const task of occupied.tasks.filter((entry) => entry.id.startsWith("capacity-")))
      yield* h.store.updateAttempt(task.id, task.attempts[0]!.id, "stopped", "Capacity freed");
    yield* h.drain();
    expect(h.sentMessages.some((message) => message.text.includes("task deferred-ready"))).toBe(
      true,
    );
  }).pipe(Effect.provide(services)),
);

it.effect("runs later assignment effects behind a full page of deferred wakes", () =>
  Effect.gen(function* () {
    const h = yield* harness;
    yield* h.command({
      type: "create",
      taskId: "wake-source",
      projectId: a,
      title: "Wake source",
      outcome: "Remain ready",
      criteria: "Wake eventually delivers",
      verifyCommand: "",
      priority: 1,
      dependencies: [],
      workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
    });
    const readyTask = (yield* h.store.read()).tasks[0]!;
    const key = `ready:${readyTask.id}:owner:0:${readyTask.revision}`;
    h.failAllSends();
    for (let index = 0; index < 20; index++)
      yield* h.store.queueWake(
        `deferred-wake-${index}`,
        encodeJson({
          recipientId: "glados",
          projectId: a,
          threadId: boss,
          generation: 1,
          keys: [key],
        }),
      );
    yield* h.command({
      type: "create",
      taskId: "later-launch",
      projectId: a,
      title: "Later launch",
      outcome: "Launch despite deferred wakes",
      criteria: "Managed thread starts",
      verifyCommand: "",
      priority: 2,
      dependencies: [],
      workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
    });
    yield* h.command({ type: "assign", taskId: "later-launch" });
    yield* h.drain();
    const later = (yield* h.store.read()).tasks.find((task) => task.id === "later-launch")!;
    expect(h.launched).toContain(later.attempts[0]!.threadId);
  }).pipe(Effect.provide(services)),
);
it.effect("delivers unresolved decisions and genuinely new readiness once each", () =>
  Effect.gen(function* () {
    const h = yield* harness;
    yield* h.command({
      type: "create",
      taskId: "decision-task",
      projectId: a,
      title: "Decision task",
      outcome: "Follow the recorded choice",
      criteria: "Choice is resolved",
      verifyCommand: "",
      priority: 1,
      dependencies: [],
      workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
    });
    yield* h.command({ type: "assign", taskId: "decision-task" });
    yield* h.drain();
    yield* h.command({
      type: "request-decision",
      taskId: "decision-task",
      question: "Choose the retained format?",
      options: ["A", "B"],
      recommendation: "A",
    });
    yield* h.drain();
    expect(h.sent).toEqual([boss]);
    expect(h.sentMessages[0]?.text).toContain("decision · task decision-task");
    expect(h.sentMessages[0]?.text).toContain("Resolve the recorded decision");
    h.projections.set(boss, projection(boss, a));
    yield* h.drain();
    expect(h.sent).toEqual([boss]);
    const decision = (yield* h.store.read()).tasks[0]!.decisions![0]!;
    yield* h.command({
      type: "resolve-decision",
      taskId: "decision-task",
      decisionId: decision.id,
      answer: "A",
    });
    yield* h.command({
      type: "create",
      taskId: "newly-ready",
      projectId: a,
      title: "Newly ready",
      outcome: "Start after the decision",
      criteria: "Managed worker starts",
      verifyCommand: "",
      priority: 2,
      dependencies: [],
      workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
    });
    yield* h.drain();
    expect(h.sent).toEqual([boss, boss]);
    expect(h.sentMessages[1]?.text).toContain(
      "Ready to assign · task newly-ready · attempt none · owner GLaDOS",
    );
    expect(h.sentMessages[1]?.text).not.toContain("decision · task decision-task");
  }).pipe(Effect.provide(services)),
);
it.effect("redelivers a mirrored task obligation when ownership returns to a prior manager", () =>
  Effect.gen(function* () {
    const h = yield* harness;
    const home = EnvironmentId.make("remote-home");
    const coordinator = EnvironmentId.make("coordinator");
    yield* h.store.importSources(
      {
        id: "remote-source",
        kind: "linear",
        baseUrl: "https://tracker.invalid",
        tenantId: "team",
        remoteProjectId: "project",
        projectId: a,
        enabled: true,
      },
      [
        {
          title: "Mirrored task",
          outcome: "Remain ready across ownership changes",
          source: {
            kind: "linear",
            tenantId: "team",
            itemId: "remote-one",
            scope: "remote-scope",
            key: "REMOTE-1",
            url: "https://tracker.invalid/REMOTE-1",
            status: "Open",
            priority: "1",
            observedAt: "2026-09-11T00:00:00.000Z",
          },
        },
      ],
    );
    const imported = (yield* h.store.read()).tasks[0]!;
    const remoteScope = imported.source!.scope!;
    yield* h.store.setSourceAuthority({
      scope: remoteScope,
      self: coordinator,
      coordinator,
      homeEnvironmentId: home,
      peerId: "remote-peer",
      proposalId: "approved-remote-scope",
    });
    yield* h.store.mirrorTask(home, {
      ...imported,
      revision: imported.revision + 1,
      status: "queued",
      note: "Ready at its fixed home",
    });
    for (const message of (yield* h.store.read()).messages.filter((entry) => !entry.acknowledged))
      yield* h.command({ type: "acknowledge", messageId: message.id });
    const leadA = yield* h.lead("lead-a", a);
    for (const effect of yield* h.store.effects())
      if (effect.kind === "create-lead") yield* h.store.finishEffect(effect.operation_id);
    h.projections.set(leadA.threadId, projection(leadA.threadId, a));
    const homeRevision = (yield* h.store.read()).tasks[0]!.revision;
    for (const lead of [leadA, null, leadA]) {
      h.projections.set(leadA.threadId, projection(leadA.threadId, a));
      h.projections.set(boss, projection(boss, a));
      yield* h.command({ type: "manage-task", taskId: imported.id, leadId: lead?.id ?? null });
      yield* h.drain();
    }
    expect(h.sent).toEqual([leadA.threadId, boss, leadA.threadId]);
    const returned = (yield* h.store.read()).tasks[0]!;
    expect(returned.revision).toBe(homeRevision);
    expect(returned.ownershipRevision).toBe(3);
  }).pipe(Effect.provide(services)),
);
it.effect("launches leads and workers as ordinary managed threads in independent worktrees", () =>
  Effect.gen(function* () {
    const h = yield* harness;
    const lead = yield* h.lead("managed", a);
    yield* h.drain();
    expect(h.launches[0]).toMatchObject({
      threadId: lead.threadId,
      projectId: a,
      workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
      createdBy: "agent",
      creationSource: "mcp",
    });
    yield* h.command({
      type: "create",
      taskId: "managed-worker",
      projectId: a,
      title: "Managed worker",
      outcome: "Implement the bounded change",
      criteria: "Focused proof passes",
      verifyCommand: "vp test run focused.test.ts",
      priority: 1,
      dependencies: [],
      workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
    });
    yield* h.command({ type: "manage-task", taskId: "managed-worker", leadId: lead.id });
    yield* h.command({ type: "assign", taskId: "managed-worker" });
    yield* h.drain();
    const state = yield* h.store.read();
    const attempt = state.tasks.find((task) => task.id === "managed-worker")!.attempts[0]!;
    expect(h.launches[1]).toMatchObject({
      threadId: attempt.threadId,
      projectId: a,
      workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
      createdBy: "agent",
      creationSource: "mcp",
    });
    expect(attempt.threadId).not.toBe(lead.threadId);
  }).pipe(Effect.provide(services)),
);
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

it.effect(
  "a user decision stops only its writer while the runtime launches unrelated work and survives replay",
  () =>
    Effect.gen(function* () {
      const h = yield* harness;
      for (const id of ["waiting", "independent"])
        yield* h.command({
          type: "create",
          taskId: id,
          projectId: a,
          title: id,
          outcome: id,
          criteria: "Evidence",
          verifyCommand: "",
          priority: 1,
          dependencies: [],
          workspaceStrategy: { type: "root" },
        });
      yield* h.command({ type: "assign", taskId: "waiting" });
      yield* h.drain();
      const first = (yield* h.store.read()).tasks[0]!.attempts[0]!;
      yield* h.command({
        type: "request-decision",
        taskId: "waiting",
        question: "Which direction?",
        options: ["A", "B"],
        recommendation: "A",
      });
      yield* h.command({ type: "assign", taskId: "independent" });
      yield* h.drain();
      const parked = yield* h.store.read();
      expect(h.interrupted).toEqual([first.threadId]);
      expect(parked.role?.paused).toBe(false);
      expect(parked.tasks[0]!.status).toBe("blocked");
      expect(parked.tasks[0]!.attempts[0]!.state).toBe("stopped");
      expect(parked.tasks[1]!.attempts[0]!.state).toBe("running");
      expect(h.launched).toHaveLength(2);
      expect(yield* h.store.rebuild()).toEqual(parked);
      yield* h.drain();
      expect(h.interrupted).toHaveLength(1);
      yield* h.command({
        type: "resolve-decision",
        taskId: "waiting",
        decisionId: parked.tasks[0]!.decisions![0]!.id,
        answer: "B",
      });
      const answered = yield* h.store.read();
      expect(answered.tasks[0]!.status).toBe("queued");
      expect(answered.tasks[1]!.attempts[0]!.state).toBe("running");
      expect(yield* h.store.rebuild()).toEqual(answered);
    }).pipe(Effect.provide(services)),
);

it.effect(
  "keeps explicitly requested lead permissions through failed launch, rebuild and reactivation",
  () =>
    Effect.gen(function* () {
      const h = yield* harness;
      const created = yield* h.command({
        type: "create-lead",
        leadId: "full-access-lead",
        projectId: a,
        charter: "Own this project",
        model,
        maxWorkers: 1,
        runtimeMode: "full-access",
      });
      const lead = created.leads!.find((entry) => entry.id === "full-access-lead")!;
      expect(lead.runtimeMode).toBe("full-access");
      h.failLaunch.add(lead.threadId);
      yield* h.drain();
      expect(h.launchModes).toEqual(["full-access"]);
      yield* h.store.rebuild();
      h.failLaunch.clear();
      yield* h.command({
        type: "lead-status",
        leadId: lead.id,
        status: "active",
        runtimeMode: "full-access",
      });
      yield* h.drain();
      expect(h.launchModes).toEqual(["full-access", "full-access"]);
    }).pipe(Effect.provide(services)),
);

it.effect("an explicit lead downgrade overrides a full-access worker default", () =>
  Effect.gen(function* () {
    const h = yield* harness;
    const original = (yield* h.store.read()).role!.brief;
    yield* h.command({
      type: "brief",
      brief: { ...original, workerRuntimeMode: "full-access" },
    });
    yield* h.command({
      type: "create-lead",
      leadId: "approval-lead",
      projectId: a,
      charter: "Own this project",
      model,
      maxWorkers: 1,
      runtimeMode: "approval-required",
    });
    yield* h.drain();
    expect(h.launchModes).toEqual(["approval-required"]);
  }).pipe(Effect.provide(services)),
);

it.effect("an explicit mode is applied when an existing lead is reactivated", () =>
  Effect.gen(function* () {
    const h = yield* harness;
    const lead = yield* h.lead("existing", a);
    yield* h.drain();
    yield* h.command({ type: "lead-status", leadId: lead.id, status: "dormant" });
    yield* h.drain();
    expect(h.interrupted).toEqual([lead.threadId]);
    yield* h.command({
      type: "lead-status",
      leadId: lead.id,
      status: "active",
      runtimeMode: "approval-required",
    });
    yield* h.drain();
    expect(h.permissionModes).toEqual(["approval-required"]);
    expect(h.launched).toEqual([lead.threadId]);
  }).pipe(Effect.provide(services)),
);

it.effect(
  "reactivation waits for the dormant lead writer to stop before changing permissions",
  () =>
    Effect.gen(function* () {
      const h = yield* harness;
      const lead = yield* h.lead("stopping", a);
      yield* h.drain();
      h.deferInterrupt();
      yield* h.command({ type: "lead-status", leadId: lead.id, status: "dormant" });
      yield* h.drain();
      expect(h.interrupted).toEqual([lead.threadId]);
      yield* h.command({
        type: "lead-status",
        leadId: lead.id,
        status: "active",
        runtimeMode: "full-access",
      });
      yield* h.drain();
      expect(h.permissionModes).toEqual([]);
      expect((yield* h.store.effects()).some((effect) => effect.kind === "lead-status")).toBe(true);
      h.projections.set(lead.threadId, projection(lead.threadId, a));
      yield* h.drain();
      expect(h.permissionModes).toEqual(["full-access"]);
      expect((yield* h.store.effects()).filter((effect) => effect.kind === "lead-status")).toEqual(
        [],
      );
    }).pipe(Effect.provide(services)),
);

it.effect(
  "starts workers with the permissions approved at assignment, even if the brief changes before delivery",
  () =>
    Effect.gen(function* () {
      const h = yield* harness;
      const original = (yield* h.store.read()).role!.brief;
      yield* h.command({ type: "brief", brief: { ...original, workerRuntimeMode: "full-access" } });
      yield* h.command({
        type: "create",
        taskId: "permissions",
        projectId: a,
        title: "Scoped work",
        outcome: "Result",
        criteria: "Evidence",
        verifyCommand: "",
        priority: 1,
        dependencies: [],
        workspaceStrategy: { type: "root" },
      });
      yield* h.command({ type: "assign", taskId: "permissions" });
      yield* h.command({
        type: "brief",
        brief: { ...original, workerRuntimeMode: "approval-required" },
      });
      yield* h.drain();
      expect(h.launchModes).toEqual(["full-access"]);
      expect((yield* h.store.read()).tasks[0]!.attempts[0]!.runtimeMode).toBe("full-access");
    }).pipe(Effect.provide(services)),
);

it.effect(
  "applies explicitly saved coordinator permissions durably and recovers delivery failure without lying about runtime",
  () =>
    Effect.gen(function* () {
      const h = yield* harness;
      const brief = {
        ...(yield* h.store.read()).role!.brief,
        coordinatorRuntimeMode: "full-access" as const,
      };
      h.failPermissions();
      yield* h.command({ type: "brief", brief, applyCoordinatorPermissions: true });
      yield* h.drain();
      expect(h.projections.get(boss)!.thread.runtimeMode).toBe("approval-required");
      expect(
        (yield* h.store.read()).messages.some((message) =>
          message.text.includes("Work delivery needs attention"),
        ),
      ).toBe(true);
      yield* h.command({ type: "brief", brief, applyCoordinatorPermissions: true });
      yield* h.drain();
      expect(h.projections.get(boss)!.thread.runtimeMode).toBe("full-access");
      expect(h.permissionModes).toEqual(["full-access"]);
    }).pipe(Effect.provide(services)),
);
it.effect(
  "priority-only saves retain a manual permission downgrade; explicit same-value full auto reapplies it",
  () =>
    Effect.gen(function* () {
      const h = yield* harness;
      const savedBrief = {
        ...(yield* h.store.read()).role!.brief,
        coordinatorRuntimeMode: "full-access" as const,
        workerRuntimeMode: "full-access" as const,
      };
      yield* h.command({ type: "brief", brief: savedBrief, applyCoordinatorPermissions: true });
      yield* h.drain();
      expect(h.permissionModes).toEqual(["full-access"]);
      expect(h.sent).toEqual([boss]);
      // The completed turn and composer downgrade arrive independently of the saved brief.
      const previous = h.projections.get(boss)!;
      h.projections.set(boss, {
        ...previous,
        thread: { ...previous.thread, runtimeMode: "approval-required" },
        runs: [],
      });
      const editedBrief = { ...savedBrief, priorities: "Updated priorities" };
      yield* h.command({ type: "brief", brief: editedBrief, applyCoordinatorPermissions: false });
      yield* h.drain();
      expect((yield* h.store.read()).role!.brief).toEqual(editedBrief);
      expect(h.projections.get(boss)!.thread.runtimeMode).toBe("approval-required");
      expect(h.permissionModes).toEqual(["full-access"]);
      expect(h.sent).toEqual([boss]);
      yield* h.command({ type: "brief", brief: editedBrief, applyCoordinatorPermissions: true });
      yield* h.drain();
      expect(h.projections.get(boss)!.thread.runtimeMode).toBe("full-access");
      expect(h.permissionModes).toEqual(["full-access", "full-access"]);
      expect(h.sent).toEqual([boss, boss]);
    }).pipe(Effect.provide(services)),
);

it.effect(
  "deliberately enabling scoped full auto starts one coordinator turn, after permissions are applied",
  () =>
    Effect.gen(function* () {
      const h = yield* harness;
      const brief = {
        ...(yield* h.store.read()).role!.brief,
        coordinatorRuntimeMode: "full-access" as const,
        workerRuntimeMode: "full-access" as const,
      };
      yield* h.command({ type: "brief", brief, applyCoordinatorPermissions: true });
      yield* h.drain();
      expect(h.projections.get(boss)!.thread.runtimeMode).toBe("full-access");
      expect(h.sent).toEqual([boss]);
      yield* h.drain();
      expect(h.sent).toEqual([boss]);
    }).pipe(Effect.provide(services)),
);
it.effect(
  "empty scope and paused work do not start a coordinator just because permissions were saved",
  () =>
    Effect.gen(function* () {
      const h = yield* harness;
      const brief = {
        ...(yield* h.store.read()).role!.brief,
        coordinatorRuntimeMode: "full-access" as const,
        workerRuntimeMode: "full-access" as const,
      };
      yield* h.command({
        type: "brief",
        brief: { ...brief, projectIds: [] },
        applyCoordinatorPermissions: true,
      });
      yield* h.drain();
      expect(h.sent).toEqual([]);
      yield* h.command({ type: "pause", paused: true });
      yield* h.command({ type: "brief", brief, applyCoordinatorPermissions: true });
      yield* h.drain();
      expect(h.sent).toEqual([]);
    }).pipe(Effect.provide(services)),
);
