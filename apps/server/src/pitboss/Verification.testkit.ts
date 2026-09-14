import {
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type PitbossAction,
  type PitbossSnapshot,
} from "@t3tools/contracts";
import { decide, emptyWork, observeAttempt } from "./Work.ts";
import { recordVerification } from "./Verification.ts";
const projectId = ProjectId.make("project"),
  boss = ThreadId.make("boss");
const sha = "a".repeat(40),
  now = "2026-09-13T00:00:00.000Z";
export function fixture() {
  let state: PitbossSnapshot = emptyWork;
  const history: string[] = [];
  const act = (action: PitbossAction, actor: Parameters<typeof decide>[2] = { type: "user" }) => {
    const input = {
      commandId: CommandId.make(`c${state.revision}`),
      expectedRevision: state.revision,
      authorityGeneration: state.role?.generation,
      action,
    };
    state = decide(state, input, actor, now);
    history.push(JSON.stringify({ type: "command", version: 2, input, actor, now }));
  };
  act({
    type: "elect",
    projectId,
    threadId: boss,
    brief: {
      priorities: "One outcome",
      quality: "Verify",
      projectIds: [projectId],
      maxWorkers: 2,
      maxAttempts: 3,
      workerModel: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.6-luna" },
    },
  });
  act({
    type: "create",
    projectId,
    taskId: "task",
    title: "Combined app",
    outcome: "Works together",
    criteria: "Add and reload",
    verifyCommand: "node --test",
    priority: 1,
    dependencies: [],
    workspaceStrategy: { type: "root" },
  });
  act({ type: "assign", taskId: "task" });
  const attempt = state.tasks[0]!.attempts[0]!;
  state = observeAttempt(state, "task", attempt.id, "stopped", "Stopped");
  history.push(
    JSON.stringify({
      type: "attempt",
      taskId: "task",
      attemptId: attempt.id,
      status: "stopped",
      detail: "Stopped",
    }),
  );
  act({
    type: "review",
    taskId: "task",
    attemptId: attempt.id,
    candidate: `commit:${sha}`,
    criteriaVersion: 1,
    verdict: "pass",
    summary: "Lead inspected integrated candidate",
    command: "node --test",
    artifactUrls: [],
  });
  const recipe = {
    projectId,
    version: 1,
    name: "App checks",
    doctor: "node --version",
    verify: "node --test",
    cleanup: "",
    timeoutSeconds: 30,
    artifacts: [],
  };
  act({ type: "verification-recipe", recipe });
  const complete = (verdict: "pass" | "fail" | "inconclusive" = "pass") => {
    const run = {
      ...state.tasks[0]!.verification!,
      state: "completed" as const,
      receipt: { verdict, summary: "Observed result", checks: [], artifacts: [], finishedAt: now },
    };
    state = recordVerification(state, "task", run);
    history.push(JSON.stringify({ type: "verification", taskId: "task", run }));
  };
  return {
    act,
    complete,
    recipe,
    history,
    get state() {
      return state;
    },
  };
}
