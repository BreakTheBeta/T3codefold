import type {
  PullRequestCheckStatus,
  PullRequestChecksState,
  PullRequestReviewDecision,
  PullRequestReviewVerdict,
  PullRequestState,
} from "@t3tools/contracts";

import type { StatusTone } from "../../components/StatusPill";

export function pullRequestStateTone(state: PullRequestState, isDraft: boolean): StatusTone {
  if (state === "open" && isDraft) {
    return { label: "Draft", pillClassName: "bg-subtle", textClassName: "text-foreground-muted" };
  }
  if (state === "open") {
    return {
      label: "Open",
      pillClassName: "bg-subtle",
      textClassName: "text-adaptive-emerald-700-300",
    };
  }
  if (state === "merged") {
    return {
      label: "Merged",
      pillClassName: "bg-subtle",
      textClassName: "text-adaptive-violet-600-400",
    };
  }
  return {
    label: "Closed",
    pillClassName: "bg-subtle",
    textClassName: "text-adaptive-rose-700-300",
  };
}

export function checksSummary(
  state: PullRequestChecksState | null | undefined,
): { readonly label: string; readonly textClassName: string } | null {
  if (state === "passing")
    return { label: "Checks pass", textClassName: "text-adaptive-emerald-700-300" };
  if (state === "failing")
    return { label: "Checks fail", textClassName: "text-adaptive-rose-700-300" };
  if (state === "pending")
    return { label: "Checks running", textClassName: "text-adaptive-amber-700-300" };
  return null;
}

export function checkStatusPresentation(status: PullRequestCheckStatus): {
  readonly icon:
    | "checkmark.circle"
    | "xmark.circle.fill"
    | "exclamationmark.circle"
    | "info.circle";
  readonly textClassName: string;
} {
  if (status === "success")
    return { icon: "checkmark.circle", textClassName: "text-adaptive-emerald-700-300" };
  if (status === "failure" || status === "cancelled") {
    return { icon: "xmark.circle.fill", textClassName: "text-adaptive-rose-700-300" };
  }
  if (status === "pending" || status === "action-required") {
    return { icon: "exclamationmark.circle", textClassName: "text-adaptive-amber-700-300" };
  }
  return { icon: "info.circle", textClassName: "text-foreground-muted" };
}

export function reviewDecisionLabel(
  decision: PullRequestReviewDecision | null | undefined,
): { readonly label: string; readonly textClassName: string } | null {
  if (decision === "approved")
    return { label: "Approved", textClassName: "text-adaptive-emerald-700-300" };
  if (decision === "changes-requested") {
    return { label: "Changes requested", textClassName: "text-adaptive-rose-700-300" };
  }
  if (decision === "review-required") {
    return { label: "Review required", textClassName: "text-adaptive-amber-700-300" };
  }
  return null;
}

export const REVIEW_VERDICT_LABELS: Record<PullRequestReviewVerdict, string> = {
  comment: "Comment",
  approve: "Approve",
  "request-changes": "Request changes",
};
