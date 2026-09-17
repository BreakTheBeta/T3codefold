import { expect, it } from "@effect/vitest";
import { ProjectId } from "./baseSchemas.ts";
import {
  verificationProposalApprovalAction,
  verificationProposalSaveAction,
  type PitbossTask,
} from "./pitboss.ts";

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
