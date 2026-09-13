import * as DateTime from "effect/DateTime";
import type {
  PitbossSnapshot,
  PitbossVerification,
  PitbossVerificationReceipt,
} from "@t3tools/contracts";

/** Private runtime transition; agents cannot manufacture captured evidence through work_command. */
export function recordVerification(
  state: PitbossSnapshot,
  taskId: string,
  run: PitbossVerification,
): PitbossSnapshot {
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task || task.verification?.id !== run.id || task.verification.state === "completed")
    return state;
  const receipt = run.receipt;
  const message = receipt
    ? {
        id: `verification:${run.id}`,
        taskId,
        threadId: null,
        kind: "result" as const,
        text: `${task.title}: ${receipt.summary} Candidate ${run.candidate}; recipe ${run.recipe.name} v${run.recipe.version}. Review the captured receipt and remaining coverage before acceptance.`,
        createdAt: receipt.finishedAt,
        acknowledged: false,
      }
    : undefined;
  return {
    ...state,
    revision: state.revision + 1,
    messages: message ? [...state.messages, message] : state.messages,
    tasks: state.tasks.map((entry) =>
      entry.id !== taskId
        ? entry
        : {
            ...entry,
            revision: entry.revision + 1,
            verification: run,
            note: receipt?.summary ?? "Running captured verification.",
            evidence: receipt
              ? [
                  ...entry.evidence,
                  {
                    id: `verification:${run.id}`,
                    attemptId: run.attemptId,
                    candidate: run.candidate,
                    criteriaVersion: run.criteriaVersion,
                    verdict: receipt.verdict,
                    summary: receipt.summary,
                    command: run.recipe.verify,
                    artifactUrls: [],
                    capture: {
                      recipeVersion: run.recipe.version,
                      recipeName: run.recipe.name,
                      receipt,
                    },
                    provenance: "captured_check" as const,
                    createdAt: receipt.finishedAt,
                  },
                ]
              : entry.evidence,
          },
    ),
  };
}
export function interruptedReceipt(summary: string): PitbossVerificationReceipt {
  return {
    verdict: "inconclusive",
    summary,
    checks: [],
    artifacts: [],
    finishedAt: DateTime.formatIso(DateTime.nowUnsafe()),
  };
}
