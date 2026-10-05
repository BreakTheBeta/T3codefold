import { assert, describe, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type OrchestrationV2AppThread,
  type OrchestrationV2Run,
  type OrchestrationV2ServerCommand,
  type ThreadTitleState,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { emptyProjection } from "./ProjectionStore.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";
import * as ThreadTitleRefinement from "./ThreadTitleRefinement.ts";

const now = DateTime.makeUnsafe("2026-10-01T00:00:00.000Z");
const threadId = ThreadId.make("thread:title-refinement");
const instanceId = ProviderInstanceId.make("codex");
const provisionalVersion = CommandId.make("command:title:initial:title-complete");

const provisionalTitleState: ThreadTitleState = {
  source: "generated",
  version: provisionalVersion,
  needsRefinement: true,
};

const provisionalThread: OrchestrationV2AppThread = {
  id: threadId,
  projectId: ProjectId.make("project:title-refinement"),
  title: "Provisional title",
  titleState: provisionalTitleState,
  providerInstanceId: instanceId,
  modelSelection: { instanceId, model: "test" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  activeProviderThreadId: null,
  lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
  forkedFrom: null,
  createdBy: "user",
  creationSource: "web",
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  lastVisitedAt: null,
  deletedAt: null,
};

const run = (ordinal: number, status: OrchestrationV2Run["status"]): OrchestrationV2Run => ({
  id: RunId.make(`run:title-refinement:${ordinal}`),
  threadId,
  ordinal,
  providerInstanceId: instanceId,
  modelSelection: provisionalThread.modelSelection,
  providerThreadId: null,
  userMessageId: MessageId.make(`message:title-refinement:${ordinal}`),
  rootNodeId: null,
  activeAttemptId: null,
  status,
  requestedAt: now,
  startedAt: now,
  completedAt: status === "completed" ? now : null,
  checkpointId: null,
  contextHandoffId: null,
});

describe("refinementCommand", () => {
  it("regenerates a provisional title at its version once the latest run completed", () => {
    assert.deepEqual(
      ThreadTitleRefinement.refinementCommand({
        thread: provisionalThread,
        runs: [run(2, "completed"), run(1, "failed")],
      }),
      {
        type: "thread.metadata.update",
        commandId: CommandId.make(`title-refine:${threadId}:${provisionalVersion}`),
        threadId,
        expectedTitleVersion: provisionalVersion,
        regenerateTitle: true,
      },
    );
  });

  const skipped: ReadonlyArray<
    readonly [string, OrchestrationV2AppThread, ReadonlyArray<OrchestrationV2Run>]
  > = [
    ["no run has completed yet", provisionalThread, []],
    ["the latest run is still going", provisionalThread, [run(1, "completed"), run(2, "running")]],
    [
      "the user owns the title",
      { ...provisionalThread, titleState: { ...provisionalTitleState, source: "manual" } },
      [run(1, "completed")],
    ],
    [
      "the title is final",
      {
        ...provisionalThread,
        titleState: { ...provisionalTitleState, needsRefinement: false },
      },
      [run(1, "completed")],
    ],
    [
      "a regeneration is in flight",
      {
        ...provisionalThread,
        titleRegeneration: { requestId: CommandId.make("command:title:busy"), startedAt: now },
      },
      [run(1, "completed")],
    ],
    ["the thread is archived", { ...provisionalThread, archivedAt: now }, [run(1, "completed")]],
  ];
  it.each(skipped)("does nothing when %s", (_reason, thread, runs) => {
    assert.isNull(ThreadTitleRefinement.refinementCommand({ thread, runs }));
  });
});

describe("ThreadTitleRefinement.start", () => {
  it.effect("dispatches the refinement after a run completes", () =>
    Effect.gen(function* () {
      const dispatched = yield* Deferred.make<OrchestrationV2ServerCommand>();
      const threads = Layer.mock(ThreadManagement.ThreadManagementService)({
        getThreadRecords: () =>
          Effect.succeed({
            ...emptyProjection({
              type: "thread.created",
              id: EventId.make("event:title-refinement:created"),
              threadId,
              occurredAt: now,
              payload: provisionalThread,
            }),
            runs: [run(1, "completed")],
          }),
        streamDomainEvents: Stream.make({
          id: EventId.make("event:title-refinement:run"),
          threadId,
          runId: RunId.make("run:title-refinement:1"),
          providerInstanceId: instanceId,
          occurredAt: now,
          type: "run.updated" as const,
          payload: run(1, "completed"),
        }),
        getShellSnapshot: () => Effect.never,
        dispatch: (command) =>
          Deferred.succeed(dispatched, command).pipe(Effect.as({ sequence: 1, storedEvents: [] })),
      });

      const command = yield* Effect.scoped(
        ThreadTitleRefinement.start.pipe(
          Effect.andThen(Deferred.await(dispatched)),
          Effect.provide(threads),
        ),
      );

      assert.deepEqual(command, {
        type: "thread.metadata.update",
        commandId: CommandId.make(`title-refine:${threadId}:${provisionalVersion}`),
        threadId,
        expectedTitleVersion: provisionalVersion,
        regenerateTitle: true,
      });
    }),
  );
});
