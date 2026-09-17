import { expect, it } from "@effect/vitest";
import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type PitbossSnapshot,
} from "@t3tools/contracts";
import { conversationApprovalCommand } from "./ConversationApproval.ts";
import { decide, emptyWork, verificationRecipeDigest } from "./Work.ts";

const boss = ThreadId.make("boss");
const projectId = ProjectId.make("project");

function verificationDecision(): PitbossSnapshot {
  let state = decide(
    emptyWork,
    {
      commandId: CommandId.make("elect"),
      expectedRevision: 0,
      action: {
        type: "elect",
        threadId: boss,
        projectId,
        brief: {
          priorities: "Ship useful work",
          quality: "Verify behavior",
          projectIds: [projectId],
          maxWorkers: 1,
          maxAttempts: 2,
          workerModel: { instanceId: ProviderInstanceId.make("codex"), model: "fixture" },
        },
      },
    },
    { type: "user" },
    "2026-09-17T00:00:00Z",
  );
  state = decide(
    state,
    {
      commandId: CommandId.make("create"),
      expectedRevision: state.revision,
      authorityGeneration: state.role!.generation,
      action: {
        type: "create",
        taskId: "verification-task",
        projectId,
        title: "Verification task",
        outcome: "Prove the candidate",
        criteria: "Focused checks pass",
        verifyCommand: "vp test run focused.test.ts",
        priority: 1,
        dependencies: [],
        workspaceStrategy: { type: "root" },
      },
    },
    { type: "agent", threadId: boss },
    "2026-09-17T00:01:00Z",
  );
  const recipe = {
    projectId,
    profileId: "focused",
    version: 3,
    name: "Focused checks",
    doctor: "command -v vp",
    verify: "vp test run focused.test.ts",
    cleanup: "",
    timeoutSeconds: 60,
    artifacts: [],
  };
  state = decide(
    state,
    {
      commandId: CommandId.make("proposal"),
      expectedRevision: state.revision,
      authorityGeneration: state.role!.generation,
      action: { type: "propose-verification", taskId: "verification-task", recipe },
    },
    { type: "agent", threadId: boss },
    "2026-09-17T00:02:00Z",
  );
  return decide(
    state,
    {
      commandId: CommandId.make("decision"),
      expectedRevision: state.revision,
      authorityGeneration: state.role!.generation,
      action: {
        type: "request-decision",
        taskId: "verification-task",
        question: "Approve these exact verification checks?",
        options: ["Revise checks"],
        recommendation: "Approve after reviewing the commands",
      },
    },
    { type: "agent", threadId: boss },
    "2026-09-17T00:03:00Z",
  );
}

it("binds an explicit conversation approval to the pending verification proposal", () => {
  const state = verificationDecision();
  const task = state.tasks[0]!;
  const messageId = MessageId.make("user-message-1");

  expect(
    conversationApprovalCommand(state, {
      threadId: boss,
      messageId,
      text: "Approve verification for task verification-task.",
      createdBy: "user",
      creationSource: "web",
    }),
  ).toEqual({
    sourceMessageId: messageId,
    command: {
      commandId: CommandId.make("conversation-approval:user-message-1"),
      expectedRevision: state.revision,
      authorityGeneration: state.role!.generation,
      action: {
        type: "approve-verification",
        taskId: task.id,
        decisionId: task.decisions![0]!.id,
        proposalVersion: task.proposedVerificationRecipe!.version,
        proposalDigest: verificationRecipeDigest(task.proposedVerificationRecipe!),
      },
    },
  });
});

it("binds a mobile voice transcript recovery choice to the exact pending decision", () => {
  let state = verificationDecision();
  const verificationTask = state.tasks[0]!;
  state = decide(
    state,
    {
      commandId: CommandId.make("decline-verification"),
      expectedRevision: state.revision,
      action: {
        type: "resolve-decision",
        taskId: verificationTask.id,
        decisionId: verificationTask.decisions![0]!.id,
        answer: "Revise checks",
      },
    },
    { type: "user" },
    "2026-09-17T00:04:00Z",
  );
  state = decide(
    state,
    {
      commandId: CommandId.make("recovery-decision"),
      expectedRevision: state.revision,
      authorityGeneration: state.role!.generation,
      action: {
        type: "request-decision",
        taskId: verificationTask.id,
        question: "How should the retained result recover?",
        options: ["Revise result", "Cancel task"],
        recommendation: "Revise result",
      },
    },
    { type: "agent", threadId: boss },
    "2026-09-17T00:05:00Z",
  );
  const pending = state.tasks[0]!.decisions![1]!;
  const messageId = MessageId.make("voice-message-1");

  expect(
    conversationApprovalCommand(state, {
      threadId: boss,
      messageId,
      text: "Choose revise result for task verification-task.",
      createdBy: "user",
      creationSource: "mobile",
    }),
  ).toEqual({
    sourceMessageId: messageId,
    command: {
      commandId: CommandId.make("conversation-approval:voice-message-1"),
      expectedRevision: state.revision,
      authorityGeneration: state.role!.generation,
      action: {
        type: "resolve-decision",
        taskId: "verification-task",
        decisionId: pending.id,
        answer: "Revise result",
      },
    },
  });
});

it.each([
  ["bare approval", "Approve", "user", "web", boss],
  [
    "approval buried in unrelated text",
    "Tell me whether I should approve verification for task verification-task",
    "user",
    "web",
    boss,
  ],
  [
    "worker-authored message",
    "Approve verification for task verification-task",
    "agent",
    "provider",
    boss,
  ],
  ["MCP-authored message", "Approve verification for task verification-task", "agent", "mcp", boss],
  [
    "different conversation",
    "Approve verification for task verification-task",
    "user",
    "web",
    ThreadId.make("worker"),
  ],
] as const)("ignores %s", (_name, text, createdBy, creationSource, threadId) => {
  expect(
    conversationApprovalCommand(verificationDecision(), {
      threadId,
      messageId: MessageId.make("untrusted-message"),
      text,
      createdBy,
      creationSource,
    }),
  ).toBeUndefined();
});

it("fails closed if a snapshot contains an ambiguous pending choice", () => {
  const prepared = verificationDecision();
  const task = prepared.tasks[0]!;
  const decision = task.decisions![0]!;
  const state = {
    ...prepared,
    tasks: [{ ...task, decisions: [decision, { ...decision }] }],
  };

  expect(
    conversationApprovalCommand(state, {
      threadId: boss,
      messageId: MessageId.make("ambiguous-message"),
      text: "Choose revise checks for task verification-task",
      createdBy: "user",
      creationSource: "web",
    }),
  ).toBeUndefined();
});

it("rejects a conversation approval bound before the proposal changes", () => {
  const reviewed = verificationDecision();
  const approval = conversationApprovalCommand(reviewed, {
    threadId: boss,
    messageId: MessageId.make("stale-message"),
    text: "Approve verification for task verification-task",
    createdBy: "user",
    creationSource: "web",
  })!;
  const current = decide(
    reviewed,
    {
      commandId: CommandId.make("replacement-proposal"),
      expectedRevision: reviewed.revision,
      authorityGeneration: reviewed.role!.generation,
      action: {
        type: "propose-verification",
        taskId: "verification-task",
        recipe: {
          ...reviewed.tasks[0]!.proposedVerificationRecipe!,
          version: 4,
          verify: "vp test run replacement.test.ts",
        },
      },
    },
    { type: "agent", threadId: boss },
    "2026-09-17T00:06:00Z",
  );

  expect(() =>
    decide(
      current,
      approval.command,
      { type: "user", sourceMessageId: approval.sourceMessageId },
      "2026-09-17T00:07:00Z",
    ),
  ).toThrow(/Work changed/);
});
