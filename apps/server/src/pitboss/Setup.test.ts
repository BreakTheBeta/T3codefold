import { expect, it } from "@effect/vitest";
import {
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  verificationProposalApprovalAction,
  verificationRecipeForTask,
  type PitbossAction,
  type PitbossSnapshot,
} from "@t3tools/contracts";
import {
  decide,
  emptyWork,
  observeAttempt,
  verificationRecipeDigest,
  workContext,
} from "./Work.ts";
import { replayJournal } from "./WorkJournal.ts";

function fixture(verificationMode?: "automatic" | "user-approved") {
  let state: PitbossSnapshot = emptyWork;
  let commandSequence = 0;
  const history: string[] = [];
  const projectId = ProjectId.make("project");
  const boss = { type: "agent" as const, threadId: ThreadId.make("boss") };
  const act = (action: PitbossAction, actor: Parameters<typeof decide>[2] = { type: "user" }) => {
    const input = {
      commandId: CommandId.make(`command-${commandSequence++}`),
      expectedRevision: state.revision,
      authorityGeneration: state.role?.generation,
      action,
    };
    const now = "2026-09-14T00:00:00Z";
    state = decide(state, input, actor, now);
    history.push(JSON.stringify({ type: "command", version: 2, input, actor, now }));
  };
  const stopAttempt = (taskId: string, attemptId: string) => {
    state = observeAttempt(
      state,
      taskId,
      attemptId,
      "stopped",
      "Retained candidate",
      "/retained/task",
    );
    history.push(
      JSON.stringify({
        type: "attempt",
        taskId,
        attemptId,
        status: "stopped",
        detail: "Retained candidate",
        workspacePath: "/retained/task",
      }),
    );
  };
  act({
    type: "elect",
    projectId,
    threadId: boss.threadId,
    brief: {
      ...(verificationMode ? { verificationMode } : {}),
      ...(verificationMode === "automatic" ? { workerRuntimeMode: "full-access" as const } : {}),
      priorities: "Build",
      quality: "Evidence",
      projectIds: [projectId],
      maxWorkers: 2,
      maxAttempts: 2,
      workerModel: { instanceId: ProviderInstanceId.make("codex"), model: "fixture" },
    },
  });
  act({
    type: "create",
    projectId,
    taskId: "task",
    title: "Useful work",
    outcome: "Works",
    criteria: "Prove behavior",
    verifyCommand: "node --test",
    priority: 1,
    dependencies: [],
    workspaceStrategy: { type: "root" },
  });
  const recipe = {
    projectId,
    profileId: "behavior",
    version: 1,
    name: "Behavior checks",
    doctor: "node --version",
    verify: "node --test",
    cleanup: "",
    timeoutSeconds: 60,
    artifacts: [],
  };
  return {
    act,
    stopAttempt,
    recipe,
    boss,
    history,
    get state() {
      return state;
    },
  };
}
it("a manager can propose concrete setup but a proposal alone never becomes approved configuration", () => {
  const f = fixture();
  f.act({ type: "propose-verification", taskId: "task", recipe: f.recipe }, f.boss);
  expect(f.state.tasks[0]!.proposedVerificationRecipe).toEqual(f.recipe);
  expect(verificationRecipeForTask(f.state, f.state.tasks[0]!)).toBeUndefined();
  expect(() =>
    f.act({ type: "verification-recipe", recipe: f.recipe, selectForTaskId: "missing" }, f.boss),
  ).toThrow(/Select verification only for a local task in this project/);
  expect(replayJournal(f.history)).toEqual(f.state);
  f.act({ type: "verification-recipe", recipe: f.recipe, selectForTaskId: "task" });
  expect(f.state.tasks[0]!.verificationProfileId).toBe("behavior");
  expect(f.state.tasks[0]!.proposedVerificationRecipe).toBeUndefined();
  expect(verificationRecipeForTask(f.state, f.state.tasks[0]!)).toEqual(f.recipe);
  f.act({ type: "assign", taskId: "task" }, f.boss);
  expect(f.state.tasks[0]!.attempts[0]!.runtimeMode).toBe("approval-required");
  expect(replayJournal(f.history)).toEqual(f.state);
});
it("saving and selecting setup retains the pending user decision and its answer history", () => {
  const f = fixture();
  f.act(
    {
      type: "request-decision",
      taskId: "task",
      question: "Which product direction?",
      options: ["A", "B"],
      recommendation: "A",
    },
    f.boss,
  );
  f.act({ type: "propose-verification", taskId: "task", recipe: f.recipe }, f.boss);
  const decisions = f.state.tasks[0]!.decisions;
  f.act({ type: "verification-recipe", recipe: f.recipe, selectForTaskId: "task" });
  expect(f.state.tasks[0]!.decisions).toEqual(decisions);
  expect(() => f.act({ type: "assign", taskId: "task" }, f.boss)).toThrow(
    /waiting for a user decision/,
  );
  f.act({ type: "resolve-decision", taskId: "task", decisionId: decisions![0]!.id, answer: "B" });
  f.act({ type: "assign", taskId: "task" }, f.boss);
  expect(f.state.tasks[0]!.decisions![0]!.answer).toBe("B");
  expect(replayJournal(f.history)).toEqual(f.state);
});
it("atomically approves the exact proposed setup and linked decision without changing retained work", () => {
  const f = fixture();
  f.act({ type: "assign", taskId: "task" });
  const attempt = f.state.tasks[0]!.attempts[0]!;
  f.act(
    {
      type: "submit",
      taskId: "task",
      attemptId: attempt.id,
      candidate: `commit:${"a".repeat(40)}`,
      criteriaVersion: 1,
      verdict: "pass",
      summary: "Candidate is retained for captured verification",
      command: "node --test",
      artifactUrls: [],
    },
    { type: "agent", threadId: attempt.threadId },
  );
  f.act(
    {
      type: "request-decision",
      taskId: "task",
      question: "Approve the repaired verification setup?",
      options: ["Approve", "Reject"],
      recommendation: "Approve",
    },
    { type: "agent", threadId: attempt.threadId },
  );
  const decision = f.state.tasks[0]!.decisions![0]!;
  f.stopAttempt("task", attempt.id);
  f.act({ type: "propose-verification", taskId: "task", recipe: f.recipe }, f.boss);
  const before = f.state.tasks[0]!;
  f.act({
    type: "approve-verification",
    taskId: "task",
    decisionId: decision.id,
    proposalVersion: f.recipe.version,
    proposalDigest: verificationRecipeDigest(f.recipe),
  });
  const approved = f.state.tasks[0]!;
  expect(verificationRecipeForTask(f.state, approved)).toEqual(f.recipe);
  expect(approved.proposedVerificationRecipe).toBeUndefined();
  expect(approved.decisions![0]!.answer).toBe("Approved verification setup");
  expect(approved.approvedVerificationProposal).toEqual({
    decisionId: decision.id,
    profileId: "behavior",
    version: 1,
    digest: verificationRecipeDigest(f.recipe),
  });
  expect(approved.status).toBe(before.status);
  expect(approved.attempts).toEqual(before.attempts);
  expect(approved.evidence).toEqual(before.evidence);
  expect(approved.evidence).toHaveLength(1);
  expect(replayJournal(f.history)).toEqual(f.state);
});

it("rejects stale, wrong-task and agent proposal approvals and treats an exact duplicate as a no-op", () => {
  const f = fixture();
  f.act(
    {
      type: "request-decision",
      taskId: "task",
      question: "Approve setup?",
      options: ["Approve", "Reject"],
      recommendation: "Approve",
    },
    f.boss,
  );
  const decision = f.state.tasks[0]!.decisions![0]!;
  f.act({ type: "propose-verification", taskId: "task", recipe: f.recipe }, f.boss);
  const approval = {
    type: "approve-verification" as const,
    taskId: "task",
    decisionId: decision.id,
    proposalVersion: f.recipe.version,
    proposalDigest: verificationRecipeDigest(f.recipe),
  };
  expect(() => f.act({ ...approval, proposalDigest: "stale" })).toThrow(/proposal changed/);
  expect(() => f.act({ ...approval, taskId: "missing" })).toThrow(/Task not found/);
  f.act(approval);
  const approved = f.state;
  f.act(approval);
  expect(f.state).toBe(approved);
  const successor = { ...f.recipe, version: 2, verify: "node --test repaired.test.ts" };
  f.act({ type: "propose-verification", taskId: "task", recipe: successor }, f.boss);
  const withSuccessor = f.state;
  f.act(approval);
  expect(f.state).toBe(withSuccessor);
  expect(verificationRecipeForTask(f.state, f.state.tasks[0]!)?.version).toBe(1);
  expect(f.state.tasks[0]!.proposedVerificationRecipe).toEqual(successor);
  expect(replayJournal(f.history)).toEqual(f.state);
});

it("rejects an unlinked or already rejected proposal decision", () => {
  const f = fixture();
  f.act(
    {
      type: "request-decision",
      taskId: "task",
      question: "Approve setup?",
      options: ["Approve", "Reject"],
      recommendation: "Approve",
    },
    f.boss,
  );
  const linked = f.state.tasks[0]!.decisions![0]!;
  f.act({ type: "propose-verification", taskId: "task", recipe: f.recipe }, f.boss);
  const approval = {
    type: "approve-verification" as const,
    taskId: "task",
    proposalVersion: f.recipe.version,
    proposalDigest: verificationRecipeDigest(f.recipe),
  };
  expect(() => f.act({ ...approval, decisionId: "unrelated-decision" })).toThrow(/not linked/);
  f.act({
    type: "resolve-decision",
    taskId: "task",
    decisionId: linked.id,
    answer: "Reject",
  });
  expect(() => f.act({ ...approval, decisionId: linked.id })).toThrow(/already resolved/);
});
it("requires a fresh linked decision after a pending proposal changes", () => {
  const f = fixture();
  f.act(
    {
      type: "request-decision",
      taskId: "task",
      question: "Approve setup?",
      options: ["Approve", "Reject"],
      recommendation: "Approve",
    },
    f.boss,
  );
  f.act({ type: "propose-verification", taskId: "task", recipe: f.recipe }, f.boss);
  expect(f.state.tasks[0]?.proposedVerificationDecisionId).toBeDefined();
  f.act(
    {
      type: "propose-verification",
      taskId: "task",
      recipe: { ...f.recipe, version: 2, verify: "node --test replacement.test.ts" },
    },
    f.boss,
  );
  expect(f.state.tasks[0]?.proposedVerificationDecisionId).toBeUndefined();
  expect(verificationProposalApprovalAction(f.state.tasks[0]!)).toBeUndefined();
});
it("refuses to change a running worker's proof contract through setup approval", () => {
  const f = fixture();
  f.act({ type: "assign", taskId: "task" });
  expect(() =>
    f.act({ type: "verification-recipe", recipe: f.recipe, selectForTaskId: "task" }),
  ).toThrow(/Stop the task/);
  expect(f.state.verificationRecipes).toBeUndefined();
});
it("rejects setup proposed by an unrelated agent or for another project", () => {
  const f = fixture();
  expect(() =>
    f.act(
      { type: "propose-verification", taskId: "task", recipe: f.recipe },
      { type: "agent", threadId: ThreadId.make("outsider") },
    ),
  ).toThrow(/current GLaDOS/);
  expect(() =>
    f.act(
      {
        type: "propose-verification",
        taskId: "task",
        recipe: { ...f.recipe, projectId: ProjectId.make("other") },
      },
      f.boss,
    ),
  ).toThrow(/own project/);
});

it("saving setup does not revise unrelated tasks in the same project", () => {
  const f = fixture();
  f.act({
    type: "create",
    taskId: "other",
    projectId: f.recipe.projectId,
    title: "Other work",
    outcome: "Independent",
    criteria: "Evidence",
    verifyCommand: "",
    priority: 2,
    dependencies: [],
    workspaceStrategy: { type: "root" },
  });
  const other = f.state.tasks[1];
  f.act({ type: "verification-recipe", recipe: f.recipe, selectForTaskId: "task" });
  expect(f.state.tasks[1]).toBe(other);
});

it("automatic setup saves and selects a real recipe before assignment and survives replay", () => {
  const f = fixture("automatic");
  f.act({ type: "propose-verification", taskId: "task", recipe: f.recipe }, f.boss);
  expect(f.state.tasks[0]!.proposedVerificationRecipe).toBeUndefined();
  expect(verificationRecipeForTask(f.state, f.state.tasks[0]!)).toEqual(f.recipe);
  f.act({ type: "assign", taskId: "task" }, f.boss);
  expect(f.state.tasks[0]!.attempts).toHaveLength(1);
  expect(f.state.tasks[0]!.attempts[0]!.runtimeMode).toBe("full-access");
  expect(workContext(f.state, f.boss.threadId)).toContain(
    "Automatic verification setup is enabled",
  );
  expect(replayJournal(f.history)).toEqual(f.state);
});

it("automatic setup still validates paths and required artifact inputs", () => {
  const f = fixture("automatic");
  for (const recipe of [
    { ...f.recipe, artifacts: ["../secrets"] },
    { ...f.recipe, mode: "artifact" as const },
  ])
    expect(() => f.act({ type: "propose-verification", taskId: "task", recipe }, f.boss)).toThrow();
  expect(f.state.verificationRecipes).toBeUndefined();
});

it("automatic setup cannot revise attempted proof, including through another task", () => {
  const f = fixture("automatic");
  f.act({ type: "propose-verification", taskId: "task", recipe: f.recipe }, f.boss);
  f.act({ type: "assign", taskId: "task" }, f.boss);
  f.act({
    type: "create",
    taskId: "other",
    projectId: f.recipe.projectId,
    title: "Other",
    outcome: "Works",
    criteria: "Prove behavior",
    verifyCommand: "",
    priority: 2,
    dependencies: [],
    workspaceStrategy: { type: "root" },
  });
  expect(() =>
    f.act(
      {
        type: "propose-verification",
        taskId: "other",
        recipe: { ...f.recipe, version: 2, verify: "true" },
      },
      f.boss,
    ),
  ).toThrow(/after work has been attempted/);
  f.act(
    { type: "propose-verification", taskId: "task", recipe: { ...f.recipe, version: 2 } },
    f.boss,
  );
  expect(f.state.tasks[0]!.proposedVerificationRecipe?.version).toBe(2);
  expect(verificationRecipeForTask(f.state, f.state.tasks[0]!)?.version).toBe(1);
  f.act(
    { type: "propose-verification", taskId: "other", recipe: { ...f.recipe, profileId: "other" } },
    f.boss,
  );
  expect(f.state.tasks[1]!.verificationProfileId).toBe("other");
});

it("automatic setup cannot widen its own permissions and records the answer it was given", () => {
  const f = fixture("automatic");
  f.act({ type: "brief", brief: { ...f.state.role!.brief, maxWorkers: 10 } }, f.boss);
  expect(f.state.role!.brief.maxWorkers).toBe(10);
  expect(() =>
    f.act(
      {
        type: "brief",
        brief: { ...f.state.role!.brief, coordinatorRuntimeMode: "full-access" },
        applyCoordinatorPermissions: true,
      },
      f.boss,
    ),
  ).toThrow(/Only the user can elect GLaDOS or apply coordinator permissions/);
  f.act(
    {
      type: "request-decision",
      taskId: "task",
      question: "Choose a direction",
      options: ["A", "B"],
      recommendation: "A",
    },
    f.boss,
  );
  f.act({ type: "propose-verification", taskId: "task", recipe: f.recipe }, f.boss);
  expect(() => f.act({ type: "assign", taskId: "task" }, f.boss)).toThrow(
    /waiting for a user decision/,
  );
  f.act(
    {
      type: "resolve-decision",
      taskId: "task",
      decisionId: f.state.tasks[0]!.decisions![0]!.id,
      answer: "A",
    },
    f.boss,
  );
  expect(f.state.tasks[0]!.decisions![0]!.answer).toBe("A");
});

it("automatic setup preserves another attempted task's pending recipe proposal", () => {
  const f = fixture("automatic");
  f.act({ type: "propose-verification", taskId: "task", recipe: f.recipe }, f.boss);
  f.act({ type: "assign", taskId: "task" }, f.boss);
  const proposed = { ...f.recipe, profileId: "replacement" };
  f.act({ type: "propose-verification", taskId: "task", recipe: proposed }, f.boss);
  f.act({
    type: "create",
    taskId: "other",
    projectId: f.recipe.projectId,
    title: "Other",
    outcome: "Works",
    criteria: "Prove behavior",
    verifyCommand: "",
    priority: 2,
    dependencies: [],
    workspaceStrategy: { type: "root" },
  });
  expect(() =>
    f.act({ type: "propose-verification", taskId: "other", recipe: proposed }, f.boss),
  ).toThrow(/after work has been attempted/);
  expect(f.state.tasks[0]!.proposedVerificationRecipe).toEqual(proposed);
  expect(verificationRecipeForTask(f.state, f.state.tasks[0]!)).toEqual(f.recipe);
});
