import { describe, expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  CommandId,
  pitbossTaskNextAction,
  ProviderInstanceId,
  ProjectId,
  ThreadId,
  type PitbossBrief,
  type PitbossAction,
} from "@t3tools/contracts";
import { decide, emptyWork, observeAttempt, readyTasks, managerView, workContext } from "./Work.ts";

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
  expect(workContext(state, attempt.threadId)).toContain("pass it explicitly with --repo");
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
  ).toThrow(/GLaDOS/);
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

it("derives recovery and explicit acceptance from coordinator review verdicts", () => {
  let state = elect();
  const run = (action: Parameters<typeof decide>[1]["action"]) => {
    state = decide(
      state,
      {
        commandId: CommandId.make(`review-next-${state.revision}`),
        expectedRevision: state.revision,
        action,
      },
      { type: "user" },
      "2026-09-10T00:00:00.000Z",
    );
  };
  run({
    type: "create",
    taskId: "review-next",
    projectId,
    title: "Review next action",
    outcome: "Expose the review verdict obligation",
    criteria: "Coordinator review is explicit",
    verifyCommand: "",
    priority: 10,
    dependencies: [],
    workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
  });
  run({ type: "assign", taskId: "review-next" });
  const attempt = state.tasks[0]!.attempts[0]!;
  state = observeAttempt(state, "review-next", attempt.id, "stopped", "Worker stopped");
  const review = (verdict: "pass" | "fail" | "inconclusive", suffix: string) =>
    run({
      type: "review",
      taskId: "review-next",
      attemptId: attempt.id,
      criteriaVersion: state.tasks[0]!.criteriaVersion,
      candidate: `commit:${suffix.repeat(40)}`,
      verdict,
      summary: `${verdict} coordinator review`,
      command: "vp test run focused.test.ts",
      artifactUrls: [],
    });
  review("fail", "a");
  expect(pitbossTaskNextAction(state, state.tasks[0]!)).toBe("recover");
  review("inconclusive", "b");
  expect(pitbossTaskNextAction(state, state.tasks[0]!)).toBe("recover");
  review("pass", "c");
  expect(pitbossTaskNextAction(state, state.tasks[0]!)).toBe("accept");
});

it.each(["fail", "inconclusive"] as const)(
  "makes explicit rework assignable after a %s review without discarding evidence",
  (verdict) => {
    let state = elect();
    const run = (action: Parameters<typeof decide>[1]["action"]) => {
      state = decide(
        state,
        {
          commandId: CommandId.make(`explicit-rework-${state.revision}`),
          expectedRevision: state.revision,
          action,
        },
        { type: "user" },
        `2026-09-10T00:00:${String(state.revision).padStart(2, "0")}.000Z`,
      );
    };
    run({
      type: "create",
      taskId: "explicit-rework",
      projectId,
      title: "Explicit rework",
      outcome: "Repair the retained candidate",
      criteria: "Replacement evidence passes",
      verifyCommand: "vp test run focused.test.ts",
      priority: 10,
      dependencies: [],
      workspaceStrategy: {
        type: "existing_worktree",
        worktreePath: "/tmp/explicit-rework",
      },
    });
    run({ type: "assign", taskId: "explicit-rework" });
    const first = state.tasks[0]!.attempts[0]!;
    state = observeAttempt(
      state,
      "explicit-rework",
      first.id,
      "stopped",
      "Candidate retained",
      "/tmp/explicit-rework",
    );
    run({
      type: "review",
      taskId: "explicit-rework",
      attemptId: first.id,
      criteriaVersion: state.tasks[0]!.criteriaVersion,
      candidate: `commit:${"a".repeat(40)}`,
      verdict,
      summary: `${verdict} retained candidate`,
      command: "vp test run focused.test.ts",
      artifactUrls: [],
    });
    expect(pitbossTaskNextAction(state, state.tasks[0]!)).toBe("recover");
    expect(readyTasks(state)).toEqual([]);
    run({ type: "rework", taskId: "explicit-rework", note: "Repair retained candidate" });
    expect(pitbossTaskNextAction(state, state.tasks[0]!)).toBe("recover");
    run({ type: "reopen", taskId: "explicit-rework" });
    expect(pitbossTaskNextAction(state, state.tasks[0]!)).toBe("assign");
    expect(readyTasks(state).map((task) => task.id)).toEqual(["explicit-rework"]);
    const retainedEvidence = state.tasks[0]!.evidence;
    run({ type: "assign", taskId: "explicit-rework", resumeAttemptId: first.id });
    expect(state.tasks[0]!.reworkRequestedAt).toBeUndefined();
    expect(state.tasks[0]!.evidence).toEqual(retainedEvidence);
    expect(state.tasks[0]!.attempts.at(-1)?.workspacePath).toBe("/tmp/explicit-rework");
    expect(readyTasks(state)).toEqual([]);
  },
);

it("does not await verification captured for a replaced candidate", () => {
  let state = elect();
  const run = (action: Parameters<typeof decide>[1]["action"]) => {
    state = decide(
      state,
      {
        commandId: CommandId.make(`stale-verification-${state.revision}`),
        expectedRevision: state.revision,
        action,
      },
      { type: "user" },
      "2026-09-10T00:00:00.000Z",
    );
  };
  run({
    type: "create",
    taskId: "stale-verification",
    projectId,
    title: "Stale verification",
    outcome: "Verify the current candidate",
    criteria: "Verification matches its subject",
    verifyCommand: "vp test run focused.test.ts",
    priority: 10,
    dependencies: [],
    workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
  });
  run({
    type: "verification-recipe",
    selectForTaskId: "stale-verification",
    recipe: {
      profileId: "focused",
      mode: "commit",
      projectId,
      version: 1,
      name: "Focused checks",
      doctor: "command -v vp",
      verify: "vp test run focused.test.ts",
      cleanup: "",
      timeoutSeconds: 60,
      artifacts: [],
    },
  });
  run({ type: "assign", taskId: "stale-verification" });
  const task = state.tasks[0]!;
  const attempt = task.attempts[0]!;
  run({
    type: "submit",
    taskId: task.id,
    attemptId: attempt.id,
    criteriaVersion: task.criteriaVersion,
    candidate: `commit:${"a".repeat(40)}`,
    verdict: "pass",
    summary: "Candidate A",
    command: "vp test run focused.test.ts",
    artifactUrls: [],
  });
  state = observeAttempt(state, task.id, attempt.id, "stopped", "Worker stopped");
  run({ type: "verify", taskId: task.id, evidenceId: state.tasks[0]!.evidence.at(-1)!.id });
  state = {
    ...state,
    tasks: state.tasks.map((entry) =>
      entry.id !== task.id
        ? entry
        : {
            ...entry,
            evidence: [
              ...entry.evidence,
              {
                ...entry.evidence.at(-1)!,
                id: "replacement-review",
                candidate: `commit:${"b".repeat(40)}`,
                provenance: "coordinator_review" as const,
                summary: "Candidate B replaced candidate A during recovery",
              },
            ],
          },
    ),
  };
  expect(state.tasks[0]!.verification).toMatchObject({
    state: "pending",
    candidate: `commit:${"a".repeat(40)}`,
  });
  expect(pitbossTaskNextAction(state, state.tasks[0]!)).toBe("verify");
  state = {
    ...state,
    verificationRecipes: state.verificationRecipes!.map((recipe) => ({ ...recipe, version: 2 })),
    tasks: state.tasks.map((entry) => ({ ...entry, evidence: [entry.evidence[0]!] })),
  };
  expect(pitbossTaskNextAction(state, state.tasks[0]!)).toBe("verify");
  state = {
    ...state,
    tasks: state.tasks.map((entry) => ({
      ...entry,
      criteriaVersion: entry.criteriaVersion + 1,
      evidence: [
        { ...entry.evidence[0]!, criteriaVersion: entry.evidence[0]!.criteriaVersion + 1 },
      ],
    })),
  };
  expect(pitbossTaskNextAction(state, state.tasks[0]!)).toBe("verify");
});

it.each([false, true])(
  "preserves a stopped candidate with explicit resume=%s and rejects a second writer before the stop",
  (explicitResume) => {
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
      workspaceStrategy: { type: "worktree", baseRef: "HEAD", branch: "fix/retained" },
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
    const retained = state;
    state = {
      ...state,
      tasks: [
        ...state.tasks,
        {
          ...state.tasks[0]!,
          id: "another-owner",
          status: "active",
          attempts: [
            {
              ...first,
              id: "other-attempt",
              threadId: ThreadId.make("other-worker"),
              state: "running",
              workspacePath: "/tmp/retained-candidate",
            },
          ],
        },
      ],
    };
    // Raise only capacity in the test so the workspace ownership check is reached.
    state = { ...state, role: { ...state.role!, brief: { ...state.role!.brief, maxWorkers: 2 } } };
    expect(() =>
      run({
        type: "assign",
        taskId: "takeover",
        ...(explicitResume ? { resumeAttemptId: first.id } : {}),
      }),
    ).toThrow(/owns that workspace/);
    state = retained;
    run({
      type: "assign",
      taskId: "takeover",
      ...(explicitResume ? { resumeAttemptId: first.id } : {}),
      model: { instanceId: ProviderInstanceId.make("codex"), model: "stronger-test-model" },
    });
    expect(state.tasks[0]?.workspaceStrategy).toEqual({
      type: "existing_worktree",
      worktreePath: "/tmp/retained-candidate",
    });
    expect(state.tasks[0]?.attempts.at(-1)?.model.model).toBe("stronger-test-model");
    expect(state.tasks[0]?.attempts[0]?.state).toBe("stopped");
    expect(state.tasks[0]?.attempts.at(-1)?.workspacePath).toBe("/tmp/retained-candidate");
    expect(() => run({ type: "assign", taskId: "takeover" })).toThrow(/not ready/);
  },
);

it("forwards shared control to its fixed home and fences the previous coordinator", () => {
  const elected = elect();
  const created = decide(
    elected,
    {
      commandId: CommandId.make("shared-create"),
      expectedRevision: elected.revision,
      action: {
        type: "create",
        taskId: "shared",
        projectId,
        title: "Shared work",
        outcome: "One executor",
        criteria: "One executor",
        verifyCommand: "test executor",
        priority: 1,
        dependencies: [],
        workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
      },
    },
    { type: "user" },
    "2026-09-10T00:00:00Z",
  );
  const home = EnvironmentId.make("home");
  const coordinator = EnvironmentId.make("coordinator");
  const shared = {
    ...created,
    sourceAuthorities: [
      {
        scope: "shared",
        self: coordinator,
        coordinator,
        homeEnvironmentId: home,
        peerId: "home",
        proposalId: "approved",
      },
    ],
    tasks: created.tasks.map((task) => ({
      ...task,
      homeEnvironmentId: home,
      source: {
        kind: "vikunja" as const,
        scope: "shared",
        tenantId: "tenant",
        itemId: "item",
        key: "#1",
        url: "http://tracker/tasks/1",
        status: "Open",
        priority: "1",
        observedAt: "2026-09-10T00:00:00Z",
      },
    })),
  };
  const command = {
    commandId: CommandId.make("remote-assign"),
    expectedRevision: shared.revision,
    authorityGeneration: elected.role?.generation,
    action: { type: "assign" as const, taskId: "shared" },
  };
  const excluded = {
    ...shared,
    role: { ...shared.role!, brief: { ...shared.role!.brief, managedPeerIds: [] } },
  };
  expect(managerView(excluded).tasks).toEqual([]);
  expect(managerView(excluded).sourceAuthorities).toEqual([]);
  expect(() =>
    decide(excluded, command, { type: "agent", threadId }, "2026-09-10T00:00:00Z"),
  ).toThrow(/outside the GLaDOS brief/);
  expect(() =>
    decide(
      excluded,
      { ...command, action: { type: "send-peer", peerId: "home", text: "Start work" } },
      { type: "agent", threadId },
      "2026-09-10T00:00:00Z",
    ),
  ).toThrow(/outside the current brief/);
  const queued = decide(shared, command, { type: "agent", threadId }, "2026-09-10T00:00:00Z");
  expect(queued.tasks[0]?.attempts).toHaveLength(0);
  expect(queued.tasks[0]?.pendingOperationId).toBe("remote-assign");
  expect(readyTasks(queued)).toHaveLength(0);
  expect(queued.messages.at(-1)?.text).toContain("Queued");
  const atHome = {
    ...shared,
    sourceAuthorities: shared.sourceAuthorities.map((authority) => ({ ...authority, self: home })),
  };
  const accepted = decide(
    atHome,
    command,
    { type: "peer", environmentId: coordinator, scope: "shared", proposalId: "approved" },
    "2026-09-10T00:00:00Z",
  );
  expect(accepted.tasks[0]?.attempts).toHaveLength(1);
  expect(() =>
    decide(
      atHome,
      command,
      { type: "peer", environmentId: coordinator, scope: "shared", proposalId: "old" },
      "2026-09-10T00:00:00Z",
    ),
  ).toThrow(/authority/);
  expect(() =>
    decide(atHome, command, { type: "agent", threadId }, "2026-09-10T00:00:00Z"),
  ).toThrow(/coordinator/);
});

it("lets GLaDOS choose a configured worker and thinking level without automatic retry escalation", () => {
  let state = elect();
  const fallback = {
    instanceId: ProviderInstanceId.make("claude-work"),
    model: "stronger-model",
    options: [{ id: "effort", value: "high" }],
  };
  const run = (action: Parameters<typeof decide>[1]["action"]) => {
    state = decide(
      state,
      {
        commandId: CommandId.make(`fallback-${state.revision}`),
        expectedRevision: state.revision,
        action,
      },
      { type: "user" },
      "2026-09-11T00:00:00Z",
    );
  };
  run({ type: "brief", brief: { ...brief, alternateWorkerModel: fallback } });
  run({
    type: "create",
    taskId: "retry",
    projectId,
    title: "Retry",
    outcome: "Verified behavior",
    criteria: "Check passes",
    verifyCommand: "test",
    priority: 1,
    dependencies: [],
    workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
  });
  expect(() =>
    decide(
      state,
      {
        commandId: CommandId.make("unapproved-model"),
        expectedRevision: state.revision,
        authorityGeneration: state.role!.generation,
        action: {
          type: "assign",
          taskId: "retry",
          model: { instanceId: ProviderInstanceId.make("other-provider"), model: "not-selected" },
        },
      },
      { type: "agent", threadId },
      "2026-09-11T00:00:00Z",
    ),
  ).toThrow(/outside the task home's brief/);
  run({ type: "assign", taskId: "retry" });
  expect(state.tasks[0]!.attempts[0]!.model).toEqual(brief.workerModel);
  for (let attempt = 0; attempt < 2; attempt++) {
    const previous = state.tasks[0]!.attempts.at(-1)!;
    run({ type: "rework", taskId: "retry", note: "Verification failed" });
    expect(() => run({ type: "assign", taskId: "retry" })).toThrow();
    state = observeAttempt(state, "retry", previous.id, "stopped", "Stopped for retry");
    run({ type: "reopen", taskId: "retry" });
    state = decide(
      state,
      {
        commandId: CommandId.make(`choice-${state.revision}`),
        expectedRevision: state.revision,
        authorityGeneration: state.role!.generation,
        action: { type: "assign", taskId: "retry", ...(attempt === 1 ? { model: fallback } : {}) },
      },
      { type: "agent", threadId },
      "2026-09-11T00:00:00Z",
    );
    expect(state.tasks[0]!.attempts.at(-1)!.model).toEqual(
      attempt === 1 ? fallback : brief.workerModel,
    );
  }
  const last = state.tasks[0]!.attempts.at(-1)!;
  run({ type: "rework", taskId: "retry", note: "Still failing" });
  state = observeAttempt(state, "retry", last.id, "stopped", "Stopped");
  run({ type: "reopen", taskId: "retry" });
  expect(() => run({ type: "assign", taskId: "retry" })).toThrow(/not ready/);
});

it("snapshots explicit worker permissions while preserving legacy defaults and remote home limits", () => {
  let state = elect();
  const run = (action: PitbossAction, actor: Parameters<typeof decide>[2] = { type: "user" }) => {
    state = decide(
      state,
      {
        commandId: CommandId.make(`runtime-${state.revision}`),
        expectedRevision: state.revision,
        authorityGeneration: state.role?.generation,
        action,
      },
      actor,
      "2026-09-15T00:00:00Z",
    );
  };
  const create = (taskId: string) =>
    run({
      type: "create",
      taskId,
      projectId,
      title: taskId,
      outcome: "Works",
      criteria: "Evidence",
      verifyCommand: "test",
      priority: 1,
      dependencies: [],
      workspaceStrategy: { type: "root" },
    });
  create("explicit");
  run({ type: "assign", taskId: "explicit", runtimeMode: "full-access" });
  expect(state.tasks[0]?.attempts[0]?.runtimeMode).toBe("full-access");
  state = {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === "explicit"
        ? {
            ...task,
            status: "done" as const,
            attempts: task.attempts.map((attempt) => ({ ...attempt, state: "stopped" as const })),
          }
        : task,
    ),
  };
  create("legacy");
  run({ type: "assign", taskId: "legacy" });
  expect(state.tasks[1]?.attempts[0]?.runtimeMode).toBe("approval-required");
  state = {
    ...state,
    role: {
      ...state.role!,
      brief: { ...state.role!.brief, workerRuntimeMode: "full-access" as const },
    },
    tasks: state.tasks.map((task) =>
      task.id === "legacy"
        ? {
            ...task,
            status: "done" as const,
            attempts: task.attempts.map((attempt) => ({ ...attempt, state: "stopped" as const })),
          }
        : task,
    ),
  };
  create("downgraded");
  run({ type: "assign", taskId: "downgraded", runtimeMode: "approval-required" });
  expect(state.tasks[2]?.attempts[0]?.runtimeMode).toBe("approval-required");

  const remote = {
    ...state,
    sourceAuthorities: [
      {
        scope: "shared",
        self: EnvironmentId.make("home"),
        coordinator: EnvironmentId.make("coordinator"),
        homeEnvironmentId: EnvironmentId.make("home"),
        peerId: "coordinator-peer",
        proposalId: "approved",
      },
    ],
    role: {
      ...state.role!,
      brief: { ...state.role!.brief, workerRuntimeMode: "approval-required" as const },
    },
    tasks: state.tasks.map((task) =>
      task.id === "legacy"
        ? {
            ...task,
            source: {
              kind: "vikunja" as const,
              tenantId: "tenant",
              itemId: "item",
              scope: "shared",
              key: "#1",
              url: "http://tracker/tasks/1",
              status: "Open",
              priority: "1",
              observedAt: "2026-09-15T00:00:00Z",
            },
          }
        : task,
    ),
  };
  expect(() =>
    decide(
      remote,
      {
        commandId: CommandId.make("remote-full"),
        expectedRevision: remote.revision,
        action: { type: "assign", taskId: "legacy", runtimeMode: "full-access" },
      },
      {
        type: "peer",
        environmentId: EnvironmentId.make("coordinator"),
        scope: "shared",
        proposalId: "approved",
      },
      "2026-09-15T00:00:00Z",
    ),
  ).toThrow(/task home's worker permissions/);
});

it("admits ten workers while enforcing the saved concurrent worker limit", () => {
  let state = elect();
  const run = (action: Parameters<typeof decide>[1]["action"]) => {
    state = decide(
      state,
      {
        commandId: CommandId.make(`capacity-${state.revision}`),
        expectedRevision: state.revision,
        action,
      },
      { type: "user" },
      "2026-09-11T00:00:00Z",
    );
  };
  run({ type: "brief", brief: { ...brief, maxWorkers: 10 } });
  for (let i = 0; i < 11; i++) {
    run({
      type: "create",
      taskId: `capacity-${i}`,
      projectId,
      title: "Bounded work",
      outcome: "Result",
      criteria: "Check passes",
      verifyCommand: "test",
      priority: 1,
      dependencies: [],
      workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
    });
    if (i < 10) run({ type: "assign", taskId: `capacity-${i}` });
  }
  expect(state.tasks.filter((task) => task.status === "active")).toHaveLength(10);
  expect(() => run({ type: "assign", taskId: "capacity-10" })).toThrow(/capacity/);
});

it("turns one revise-result request into a bounded retained-workspace assignment", () => {
  let state = elect();
  const run = (action: Parameters<typeof decide>[1]["action"]) => {
    state = decide(
      state,
      {
        commandId: CommandId.make(`revise-${state.revision}`),
        expectedRevision: state.revision,
        action,
      },
      { type: "user" },
      "2026-09-17T00:00:00Z",
    );
  };
  run({
    type: "create",
    taskId: "revise-result",
    projectId,
    title: "Improve retained result",
    outcome: "Keep the useful patch",
    criteria: "Focused checks pass",
    verifyCommand: "vp test run focused.test.ts",
    priority: 1,
    dependencies: [],
    workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
  });
  run({ type: "assign", taskId: "revise-result" });
  const first = state.tasks[0]!.attempts[0]!;
  state = observeAttempt(
    state,
    "revise-result",
    first.id,
    "running",
    "Useful partial patch",
    "/tmp/revise-retained",
  );
  run({ type: "revise-result", taskId: "revise-result", note: "Address the review gap" });
  expect(state.tasks[0]).toMatchObject({
    status: "queued",
    acceptedEvidenceId: null,
    reworkRequestedAt: "2026-09-17T00:00:00Z",
    revisionRequest: { note: "Address the review gap" },
  });
  expect(state.tasks[0]!.attempts[0]!.state).toBe("stop_requested");
  expect(readyTasks(state)).toEqual([]);
  state = observeAttempt(state, "revise-result", first.id, "stopped", "Writer drained");
  expect(readyTasks(state).map((task) => task.id)).toEqual(["revise-result"]);
  run({ type: "assign", taskId: "revise-result", resumeAttemptId: first.id });
  expect(state.tasks[0]!.revisionRequest).toBeUndefined();
  expect(state.tasks[0]!.workspaceStrategy).toEqual({
    type: "existing_worktree",
    worktreePath: "/tmp/revise-retained",
  });
  expect(state.tasks[0]!.attempts).toHaveLength(2);
});

it("closes historical work without accepting it and keeps closure visible after restore", () => {
  let state = elect();
  const run = (action: Parameters<typeof decide>[1]["action"]) => {
    state = decide(
      state,
      {
        commandId: CommandId.make(`close-${state.revision}`),
        expectedRevision: state.revision,
        action,
      },
      { type: "user" },
      "2026-09-17T00:00:00Z",
    );
  };
  run({
    type: "create",
    taskId: "historical",
    projectId,
    title: "Superseded approach",
    outcome: "Retain for audit",
    criteria: "Never claim acceptance",
    verifyCommand: "",
    priority: 1,
    dependencies: [],
    workspaceStrategy: { type: "root" },
  });
  run({ type: "close", taskId: "historical", reason: "Superseded by the integrated approach" });
  expect(state.tasks[0]).toMatchObject({
    status: "cancelled",
    acceptedEvidenceId: null,
    closedAt: "2026-09-17T00:00:00Z",
    closedReason: "Superseded by the integrated approach",
  });
  run({ type: "reopen", taskId: "historical" });
  expect(state.tasks[0]).toMatchObject({
    status: "queued",
    acceptedEvidenceId: null,
    closedReason: "Superseded by the integrated approach",
  });
});
