import { expect, it } from "@effect/vitest";
import {
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type PitbossAction,
  type PitbossSnapshot,
} from "@t3tools/contracts";
import { decide, emptyWork, observeAttempt, readyTasks, workContext } from "./Work.ts";
import { replayJournal } from "./WorkJournal.ts";

it("parks one worker durably, leaves unrelated work ready, and only an authorized answer releases the gate", () => {
  let state: PitbossSnapshot = emptyWork;
  const history: string[] = [];
  const now = "2026-09-14T00:00:00Z";
  const command = (
    action: PitbossAction,
    actor: Parameters<typeof decide>[2] = { type: "user" },
  ) => {
    const input = {
      commandId: CommandId.make(`cmd-${state.revision}`),
      expectedRevision: state.revision,
      authorityGeneration: state.role?.generation,
      action,
    };
    state = decide(state, input, actor, now);
    history.push(JSON.stringify({ type: "command", version: 2, input, actor, now }));
  };
  const projectId = ProjectId.make("project");
  command({
    type: "elect",
    threadId: ThreadId.make("boss"),
    projectId,
    brief: {
      priorities: "Manage all work",
      quality: "Evidence",
      projectIds: [projectId],
      maxWorkers: 2,
      maxAttempts: 3,
      workerModel: { instanceId: ProviderInstanceId.make("codex"), model: "luna" },
    },
  });
  for (const id of ["waiting", "independent", "dependent"])
    command({
      type: "create",
      taskId: id,
      projectId,
      title: id,
      outcome: id,
      criteria: "Prove it",
      verifyCommand: "",
      priority: 1,
      dependencies: id === "dependent" ? ["waiting"] : [],
      workspaceStrategy: { type: "root" },
    });
  command({ type: "assign", taskId: "waiting" });
  const worker = state.tasks[0]!.attempts[0]!;
  command(
    {
      type: "request-decision",
      taskId: "waiting",
      question: "Which sound direction?",
      options: ["Warm", "Bright"],
      recommendation: "Warm fits the brief",
    },
    { type: "agent", threadId: worker.threadId },
  );
  expect(state.role?.paused).toBe(false);
  expect(state.tasks[0]!.attempts[0]!.state).toBe("stop_requested");
  expect(readyTasks(state).map((task) => task.id)).toEqual(["independent"]);
  const decision = state.tasks[0]!.decisions![0]!;
  expect(() => command({ type: "reopen", taskId: "waiting" })).toThrow(
    /waiting for a user decision/,
  );
  command({ type: "acknowledge", messageId: decision.id });
  expect(state.tasks[0]!.decisions![0]!.answer).toBeUndefined();
  expect(() =>
    command(
      { type: "resolve-decision", taskId: "waiting", decisionId: decision.id, answer: "Warm" },
      { type: "agent", threadId: ThreadId.make("stranger") },
    ),
  ).toThrow(/Only the current GLaDOS or user can manage work/);
  command({ type: "assign", taskId: "independent" });
  expect(state.tasks[1]!.status).toBe("active");
  expect(replayJournal(history)).toEqual(state);
  state = observeAttempt(state, "waiting", worker.id, "stopped", "Parked", "/retained/waiting");
  command({ type: "cancel", taskId: "waiting", note: "Defer this outcome" });
  command({ type: "reopen", taskId: "waiting" });
  expect(state.tasks[0]!.status).toBe("blocked");
  expect(state.tasks[0]!.decisions![0]!.answer).toBeUndefined();
  command({ type: "resolve-decision", taskId: "waiting", decisionId: decision.id, answer: "Warm" });
  expect(state.tasks[0]!.attempts[0]!.workspacePath).toBe("/retained/waiting");
  expect(readyTasks(state).map((task) => task.id)).toEqual(["waiting"]);
  expect(state.tasks[1]!.status).toBe("active");
  expect(workContext(state, worker.threadId)).toContain('"answer":"Warm"');
  expect(state.messages.at(-1)?.kind).toBe("progress");
  expect(() =>
    command({
      type: "resolve-decision",
      taskId: "waiting",
      decisionId: decision.id,
      answer: "Bright",
    }),
  ).toThrow(/already been resolved/);
});
