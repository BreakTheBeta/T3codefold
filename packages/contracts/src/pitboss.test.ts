import { expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { ProjectId, ThreadId } from "./baseSchemas.ts";
import {
  isUserWorkMessage,
  pitbossMessageHeadline,
  verificationProposalApprovalAction,
  verificationProposalSaveAction,
  PitbossCommand,
  type PitbossMessage,
  type PitbossTask,
} from "./pitboss.ts";
const decodePitbossCommand = Schema.decodeUnknownSync(PitbossCommand);

it("decodes the explicit board archive operation", () => {
  expect(
    decodePitbossCommand({
      commandId: "clear-board",
      expectedRevision: 12,
      authorityGeneration: 7,
      action: { type: "clear-board" },
    }).action,
  ).toEqual({ type: "clear-board" });
});

const recipe = {
  projectId: ProjectId.make("project"),
  profileId: "behavior",
  version: 2,
  name: "Behavior",
  doctor: "command -v vp",
  verify: "vp test run behavior.test.ts",
  cleanup: "",
  timeoutSeconds: 60,
  artifacts: [],
};

function proposalTask(patch: Partial<PitbossTask> = {}) {
  return {
    id: "task",
    proposedVerificationRecipe: recipe,
    ...patch,
  };
}

it("keeps legacy proposals manually reviewable and saveable without inferring approval", () => {
  const task = proposalTask();
  expect(verificationProposalApprovalAction(task)).toBeUndefined();
  expect(verificationProposalSaveAction(task)).toEqual({
    type: "verification-recipe",
    recipe,
    selectForTaskId: "task",
  });
});

it("uses atomic approval only for the exact linked pending proposal decision", () => {
  const task = proposalTask({
    proposedVerificationDigest: "digest",
    proposedVerificationDecisionId: "decision",
    decisions: [
      {
        id: "decision",
        question: "Approve these exact checks?",
        options: ["Approve", "Reject"],
        recommendation: "Approve",
        requestedAt: "2026-09-16T00:00:00Z",
      },
    ],
  });
  const approval = {
    type: "approve-verification",
    taskId: "task",
    decisionId: "decision",
    proposalVersion: 2,
    proposalDigest: "digest",
  };
  expect(verificationProposalApprovalAction(task)).toEqual(approval);
  expect(verificationProposalSaveAction(task)).toEqual(approval);
  expect(
    verificationProposalApprovalAction({
      ...task,
      decisions: [{ ...task.decisions![0]!, answer: "Approve" }],
    }),
  ).toBeUndefined();
  expect(
    verificationProposalSaveAction({
      ...task,
      decisions: [{ ...task.decisions![0]!, answer: "Reject" }],
    }),
  ).toBeUndefined();
});

it("keeps agent-originated decisions user-visible without exposing ordinary worker questions", () => {
  const message = (patch: Partial<PitbossMessage>): PitbossMessage => ({
    id: "message",
    taskId: "task",
    threadId: null,
    kind: "question",
    text: "Needs attention",
    createdAt: "2026-09-17T00:00:00Z",
    acknowledged: false,
    ...patch,
  });
  expect(isUserWorkMessage(message({ threadId: ThreadId.make("glados"), kind: "decision" }))).toBe(
    true,
  );
  expect(isUserWorkMessage(message({ threadId: ThreadId.make("worker"), kind: "question" }))).toBe(
    false,
  );
  expect(isUserWorkMessage(message({ kind: "question" }))).toBe(true);
});

it("reads a message as a headline without dragging its agent detail along", () => {
  const message = (patch: Partial<PitbossMessage>): PitbossMessage => ({
    id: "message",
    taskId: "task",
    threadId: null,
    kind: "progress",
    text: "Needs attention",
    createdAt: "2026-09-17T00:00:00Z",
    acknowledged: false,
    ...patch,
  });
  // A server-authored headline wins over the directive the coordinator reads.
  expect(
    pitbossMessageHeadline(
      message({
        headline: "Review passed — ready to accept",
        text: "Acceptance needed · task t1 · attempt a1. Changed: the review passed. Next: accept it.",
      }),
    ),
  ).toBe("Review passed — ready to accept");
  // Agent-authored text has no headline, so its opening sentence becomes one.
  expect(
    pitbossMessageHeadline(
      message({
        text: "The toggle now persists across reloads. I ran the regression suite and two cases still fail.",
      }),
    ),
  ).toBe("The toggle now persists across reloads.");
  // An unpunctuated wall is cut to length rather than rendered whole.
  const wall = pitbossMessageHeadline(message({ text: "x".repeat(400) }));
  expect(wall).toBe(`${"x".repeat(120)}…`);
  // Only the first line survives, so a multi-line report cannot smuggle a paragraph into the board.
  expect(pitbossMessageHeadline(message({ text: "Landed the fix\nEvidence: commit:abc" }))).toBe(
    "Landed the fix",
  );
});
