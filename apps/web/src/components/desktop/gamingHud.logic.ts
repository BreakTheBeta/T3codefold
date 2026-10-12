import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { resolveSidebarThreadStatus } from "../Sidebar.logic";

type HudThread = Pick<
  EnvironmentThreadShell,
  | "title"
  | "archivedAt"
  | "deletedAt"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "runtime"
  | "lastVisitedAt"
> & {
  latestRun: Pick<
    NonNullable<EnvironmentThreadShell["latestRun"]>,
    "status" | "completedAt"
  > | null;
  lineage: Pick<EnvironmentThreadShell["lineage"], "relationshipToParent">;
};

export function summarizeGamingHudThreads(threads: readonly HudThread[]) {
  let running = 0;
  let waiting = 0;
  const attention: { title: string; reason: string }[] = [];
  for (const thread of threads) {
    if (thread.archivedAt || thread.deletedAt) continue;
    const status = resolveSidebarThreadStatus(thread);
    if (status === "working") running++;
    if (status === "waiting") waiting++;
    let reason: string | null = null;
    if (status === "approval") reason = "Approval needed";
    else if (status === "input") reason = "Input needed";
    else if (status === "failed" || status === "limited")
      reason = status === "limited" ? "Usage limit" : "Failed";
    else if (status === "ready" && thread.latestRun?.status === "failed") reason = "Failed";
    else if (
      status === "ready" &&
      thread.lineage.relationshipToParent !== "subagent" &&
      thread.latestRun?.completedAt &&
      thread.lastVisitedAt &&
      Date.parse(thread.latestRun.completedAt) > Date.parse(thread.lastVisitedAt)
    )
      reason = "Finished";
    if (reason) attention.push({ title: thread.title, reason });
  }
  // Human blockers come before completed work; cap the payload, not the count.
  attention.sort((a, b) => Number(a.reason === "Finished") - Number(b.reason === "Finished"));
  return { running, waiting, attentionCount: attention.length, attention: attention.slice(0, 3) };
}
