import { describe, expect, it } from "@effect/vitest";
import {
  CommandId,
  ProviderInstanceId,
  ProjectId,
  ThreadId,
  type PitbossBrief,
} from "@t3tools/contracts";
import { decide, emptyWork, observeAttempt } from "./Work.ts";

const projectId = ProjectId.make("project");
const threadId = ThreadId.make("boss");
const brief: PitbossBrief = {
  priorities: "Fix tools",
  quality: "Prove the behavior",
  projectIds: [projectId],
  maxWorkers: 1,
  maxAttempts: 3,
  workerModel: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
};
const elect = () =>
  decide(
    emptyWork,
    {
      commandId: CommandId.make("elect"),
      expectedRevision: 0,
      action: { type: "elect", projectId, threadId, brief },
    },
    { type: "user" },
    "2026-09-10T00:00:00.000Z",
  );
describe("pitboss work", () => {
  it("elects one durable role and rejects a concurrent stale election", () => {
    const state = elect();
    expect(state.role?.threadId).toBe(threadId);
    expect(state.role?.generation).toBe(1);
    expect(() =>
      decide(
        state,
        {
          commandId: CommandId.make("second"),
          expectedRevision: 0,
          action: { type: "elect", projectId, threadId: ThreadId.make("other"), brief },
        },
        { type: "user" },
        "2026-09-10T00:00:01.000Z",
      ),
    ).toThrow(/changed/);
  });
});

it("keeps worker submission distinct from acceptance and rejects worker self-acceptance", () => {
  let state = elect();
  const run = (
    action: Parameters<typeof decide>[1]["action"],
    actor: Parameters<typeof decide>[2] = { type: "user" },
  ) => {
    state = decide(
      state,
      {
        commandId: CommandId.make(`command-${state.revision}`),
        expectedRevision: state.revision,
        authorityGeneration: state.role?.generation,
        action,
      },
      actor,
      "2026-09-10T00:00:00.000Z",
    );
  };
  run({
    type: "create",
    taskId: "task",
    projectId,
    title: "Fix behavior",
    outcome: "Works after reconnect",
    criteria: "A reconnect preserves the pinned boss",
    verifyCommand: "vp test run reconnect.test.ts",
    priority: 10,
    dependencies: [],
    workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
  });
  run({ type: "assign", taskId: "task" });
  const attempt = state.tasks[0]!.attempts[0]!;
  run(
    {
      type: "submit",
      taskId: "task",
      attemptId: attempt.id,
      criteriaVersion: 1,
      candidate: "commit:abc",
      verdict: "pass",
      summary: "Reconnect test passed",
      command: "vp test run reconnect.test.ts",
      artifactUrls: [],
    },
    { type: "agent", threadId: attempt.threadId },
  );
  expect(state.tasks[0]!.status).toBe("verifying");
  expect(state.tasks[0]!.acceptedEvidenceId).toBeNull();
  const evidenceId = state.tasks[0]!.evidence[0]!.id;
  expect(() =>
    run(
      { type: "accept", taskId: "task", evidenceId, note: "Looks good" },
      { type: "agent", threadId: attempt.threadId },
    ),
  ).toThrow(/pitboss/);
  expect(() => run({ type: "accept", taskId: "task", evidenceId, note: "Too early" })).toThrow(
    /writer to stop/,
  );
  state = {
    ...state,
    tasks: state.tasks.map((task) => ({
      ...task,
      attempts: task.attempts.map((attempt) => ({ ...attempt, state: "stopped" })),
    })),
  };
  run({ type: "accept", taskId: "task", evidenceId, note: "Inspected candidate and check result" });
  expect(state.tasks[0]!.status).toBe("done");
});

it("preserves a stopped candidate for takeover and rejects a second writer before the stop", () => {
  let state = elect();
  const run = (action: Parameters<typeof decide>[1]["action"]) => {
    state = decide(
      state,
      {
        commandId: CommandId.make(`takeover-${state.revision}`),
        expectedRevision: state.revision,
        action,
      },
      { type: "user" },
      "2026-09-10T00:00:00Z",
    );
  };
  run({
    type: "create",
    taskId: "takeover",
    projectId,
    title: "Finish partial work",
    outcome: "Keep the patch",
    criteria: "Verify candidate",
    verifyCommand: "test candidate",
    priority: 1,
    dependencies: [],
    workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
  });
  run({ type: "assign", taskId: "takeover" });
  const first = state.tasks[0]!.attempts[0]!;
  state = observeAttempt(
    state,
    "takeover",
    first.id,
    "running",
    "Started",
    "/tmp/retained-candidate",
  );
  run({ type: "rework", taskId: "takeover", note: "Escalate with candidate retained" });
  expect(() => run({ type: "reopen", taskId: "takeover" })).toThrow(/previous writer/);
  state = observeAttempt(state, "takeover", first.id, "stopped", "Confirmed stopped");
  run({ type: "reopen", taskId: "takeover" });
  run({
    type: "assign",
    taskId: "takeover",
    resumeAttemptId: first.id,
    model: { instanceId: ProviderInstanceId.make("codex"), model: "stronger-test-model" },
  });
  expect(state.tasks[0]?.workspaceStrategy).toEqual({
    type: "existing_worktree",
    worktreePath: "/tmp/retained-candidate",
  });
  expect(state.tasks[0]?.attempts.at(-1)?.model.model).toBe("stronger-test-model");
  expect(state.tasks[0]?.attempts[0]?.state).toBe("stopped");
});
