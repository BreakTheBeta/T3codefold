import { useState } from "react";
import {
  verificationProposalApprovalAction,
  type PitbossAction,
  type PitbossTask,
} from "@t3tools/contracts";
import { Button } from "../ui/button";

export function TaskDecisionCard({
  task,
  busy,
  command,
  draft,
  onDraftChange,
}: {
  task: PitbossTask;
  draft?: string;
  onDraftChange?: (value: string) => void;
  busy: boolean;
  command: (action: PitbossAction) => Promise<boolean>;
}) {
  const [localAnswer, setLocalAnswer] = useState("");
  const answer = draft ?? localAnswer;
  const setAnswer = onDraftChange ?? setLocalAnswer;
  const pending =
    task.status === "cancelled"
      ? undefined
      : task.decisions?.find((decision) => decision.answer === undefined);
  if (!pending) return null;
  const proposalApproval = verificationProposalApprovalAction(task);
  const approvesProposal = proposalApproval?.decisionId === pending.id;
  const submit = (value: string) => {
    if (value.trim())
      void command({
        type: "resolve-decision",
        taskId: task.id,
        decisionId: pending.id,
        answer: value.trim(),
      }).then((saved) => {
        if (saved) setAnswer("");
      });
  };
  return (
    <section
      aria-label="Your decision"
      className="my-4 space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4"
    >
      <h4 className="font-semibold">Your decision</h4>
      <p>{pending.question}</p>
      <p className="text-sm">
        <strong>Recommendation: </strong>
        {pending.recommendation || "No recommendation yet."}
      </p>
      <p className="text-sm text-muted-foreground">
        This decision pauses this task. Independent work can continue. You can leave this decision
        for later.
      </p>
      <div className="flex flex-wrap gap-2">
        {proposalApproval && approvesProposal && (
          <Button
            size="sm"
            disabled={busy || !!task.homeEnvironmentId}
            onClick={() => void command(proposalApproval)}
          >
            Approve and save evidence profile
          </Button>
        )}
        {pending.options.map((option) => (
          <Button
            key={option}
            size="sm"
            variant="outline"
            disabled={busy || !!task.homeEnvironmentId}
            onClick={() => submit(option)}
          >
            {option}
          </Button>
        ))}
      </div>
      {proposalApproval && approvesProposal && (
        <p className="text-xs text-muted-foreground">
          Only “Approve and save evidence profile” saves the exact proposed checks. Other choices
          and written replies answer the decision without changing proof requirements.
        </p>
      )}
      <label className="block text-sm">
        Your direction
        <textarea
          className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background p-2"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="Or give your own direction"
        />
      </label>
      <Button
        size="sm"
        disabled={busy || !answer.trim() || !!task.homeEnvironmentId}
        onClick={() => submit(answer)}
      >
        Send decision
      </Button>
    </section>
  );
}
