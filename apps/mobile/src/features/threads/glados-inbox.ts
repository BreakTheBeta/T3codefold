import {
  verificationRecipeForTask,
  hasCurrentVerification,
  type PitbossAction,
  type PitbossBrief,
  type PitbossMessage,
  type PitbossSnapshot,
  type PitbossTask,
  type ProjectId,
  type ThreadId,
  type ModelSelection,
} from "@t3tools/contracts";
import { deriveLayout } from "../../lib/layout";

export type GladosInboxTab = "needs-you" | "working" | "delivered";
export type GladosInboxRow =
  | { key: string; task: PitbossTask; message?: never }
  | { key: string; task?: never; message: PitbossMessage };
const needsDecision = (message: PitbossMessage) =>
  message.kind !== "progress" && !message.acknowledged;

/** Each task appears once; attached questions travel with its evidence, not as duplicate conversations. */
export function gladosInboxRows(state: PitbossSnapshot, tab: GladosInboxTab): GladosInboxRow[] {
  const questions = new Set(state.messages.filter(needsDecision).map((message) => message.taskId));
  const tasks = state.tasks
    .filter((task) => {
      const bucket =
        task.status === "done" || task.status === "cancelled"
          ? "delivered"
          : questions.has(task.id)
            ? "needs-you"
            : task.status === "blocked" || task.status === "verifying"
              ? "needs-you"
              : "working";
      return bucket === tab;
    })
    .sort((a, b) => a.priority - b.priority || b.updatedAt.localeCompare(a.updatedAt));
  const ids = new Set(state.tasks.map((task) => task.id));
  const messages = state.messages.filter(
    (message) =>
      !message.acknowledged &&
      (!message.taskId || !ids.has(message.taskId)) &&
      (needsDecision(message) ? tab === "needs-you" : tab === "working"),
  );
  return [
    ...messages.map((message) => ({ key: `message:${message.id}`, message })),
    ...tasks.map((task) => ({ key: `task:${task.id}`, task })),
  ];
}

export function gladosReceiptStatus(task: PitbossTask, state: PitbossSnapshot, now: number) {
  const run = task.verification;
  if (!run) return "Reported evidence";
  if (run.state !== "completed") return `Verification ${run.state}`;
  if (run.receipt?.expiresAt && Date.parse(run.receipt.expiresAt) <= now)
    return "Evidence expired — check again";
  if (run.receipt?.verdict !== "pass")
    return run.receipt?.verdict === "fail" ? "Checks failed" : "Verification inconclusive";
  return hasCurrentVerification(
    task,
    verificationRecipeForTask(state, task),
    task.evidence.at(-1)?.candidate ?? "",
    now,
  )
    ? "Captured checks passed"
    : "Evidence changed — check again";
}

/** A modal measures its own surface: a folded cover screen must never inherit a wide parent pane. */
export function gladosInboxLayout(width: number, height: number) {
  const split = deriveLayout({ width, height }).usesSplitView;
  return { split, listWidth: split ? Math.min(340, Math.max(280, width * 0.38)) : width };
}

/** Moving the role changes its address, not the user's operating agreement. */
export function gladosElection(input: {
  threadId: ThreadId;
  projectId: ProjectId;
  priorities: string;
  modelSelection: ModelSelection;
  brief?: PitbossBrief;
}): PitbossAction {
  return {
    type: "elect",
    threadId: input.threadId,
    projectId: input.projectId,
    brief: input.brief ?? {
      priorities: input.priorities,
      quality: "Prove the requested outcome and preserve unrelated work.",
      projectIds: [input.projectId],
      maxWorkers: 10,
      maxAttempts: 3,
      workerModel: input.modelSelection,
      managedPeerIds: [],
    },
  };
}

export function gladosNewTask(input: {
  id: string;
  projectId: ProjectId;
  title: string;
  criteria: string;
  isolatedCode: boolean;
}): PitbossAction {
  return {
    type: "create",
    taskId: input.id,
    projectId: input.projectId,
    title: input.title.trim(),
    outcome: input.title.trim(),
    criteria: input.criteria.trim(),
    verifyCommand: "",
    priority: 50,
    dependencies: [],
    workspaceStrategy: input.isolatedCode
      ? { type: "worktree", baseRef: "HEAD" }
      : { type: "root" },
  };
}
