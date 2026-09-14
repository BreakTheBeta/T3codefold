import { expect, it } from "@effect/vitest";
import {
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  verificationRecipeForTask,
  type PitbossAction,
  type PitbossSnapshot,
} from "@t3tools/contracts";
import { decide, emptyWork, workContext } from "./Work.ts";
import { replayJournal } from "./WorkJournal.ts";

function fixture() {
  let state: PitbossSnapshot = emptyWork;
  const history: string[] = [];
  const projectId = ProjectId.make("project");
  const boss = { type: "agent" as const, threadId: ThreadId.make("boss") };
  const act = (action: PitbossAction, actor: Parameters<typeof decide>[2] = { type: "user" }) => {
    const input = {
      commandId: CommandId.make(`command-${state.revision}`),
      expectedRevision: state.revision,
      authorityGeneration: state.role?.generation,
      action,
    };
    const now = "2026-09-14T00:00:00Z";
    state = decide(state, input, actor, now);
    history.push(JSON.stringify({ type: "command", version: 2, input, actor, now }));
  };
  act({
    type: "elect",
    projectId,
    threadId: boss.threadId,
    brief: {
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
    recipe,
    boss,
    history,
    get state() {
      return state;
    },
  };
}
it("a manager can propose concrete setup but conversation and proposals never become approved configuration", () => {
  const f = fixture();
  f.act({ type: "propose-verification", taskId: "task", recipe: f.recipe }, f.boss);
  expect(f.state.tasks[0]!.proposedVerificationRecipe).toEqual(f.recipe);
  expect(verificationRecipeForTask(f.state, f.state.tasks[0]!)).toBeUndefined();
  expect(() =>
    f.act({ type: "verification-recipe", recipe: f.recipe, selectForTaskId: "task" }, f.boss),
  ).toThrow(/Only the user/);
  expect(workContext(f.state, f.boss.threadId)).toContain(
    "full discretion or continue in chat does not save it",
  );
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
