import {
  pitbossTaskNextAction,
  pitbossTaskNextActionLabel,
  taskAwaitingApproval,
  workNeedsUserInput,
} from "@t3tools/contracts";
import type { PitbossSnapshot, PitbossTask, PitbossVerificationRecipe } from "@t3tools/contracts";

export const workFilters = ["All", "Needs you", "Working", "Delivered"] as const;
export type WorkFilter = (typeof workFilters)[number];

export const needsAttention = workNeedsUserInput;

/**
 * Everything the panel presents as the user's to answer: a recorded decision or setup review, plus
 * a live worker parked on a permission prompt. The badge, the filter and the lanes all read this,
 * so the one control that opens "Needs you" can never hide a row that filter would list.
 */
export function workNeedsYou(
  task: Pick<PitbossTask, "status" | "decisions" | "proposedVerificationRecipe"> &
    Partial<Pick<PitbossTask, "attempts">>,
  awaitingApproval?: PitbossSnapshot["awaitingApproval"],
) {
  return (
    needsAttention(task) ||
    (!!task.attempts && taskAwaitingApproval({ attempts: task.attempts }, awaitingApproval))
  );
}

export function nextActionLabel(state: PitbossSnapshot, task: PitbossTask) {
  return pitbossTaskNextActionLabel(pitbossTaskNextAction(state, task));
}

/** Filters never truncate: every matching outcome remains reachable in the work list. */
export function filterWork<
  T extends Pick<
    PitbossTask,
    | "title"
    | "outcome"
    | "projectId"
    | "status"
    | "decisions"
    | "proposedVerificationRecipe"
    | "priority"
  > &
    // Optional so list fixtures and partial rows keep compiling; without attempts nothing is
    // waiting on the user.
    Partial<Pick<PitbossTask, "attempts">>,
>(
  tasks: readonly T[],
  filter: WorkFilter,
  search: string,
  projectId: string,
  awaitingApproval?: PitbossSnapshot["awaitingApproval"],
) {
  const query = search.trim().toLocaleLowerCase();
  const needsYou = (task: T) => workNeedsYou(task, awaitingApproval);
  return tasks
    .filter(
      (task) =>
        (!projectId || task.projectId === projectId) &&
        (!query || `${task.title} ${task.outcome}`.toLocaleLowerCase().includes(query)) &&
        (filter === "All" ||
          (filter === "Needs you" && needsYou(task)) ||
          (filter === "Working" &&
            !["done", "cancelled"].includes(task.status) &&
            !needsYou(task)) ||
          (filter === "Delivered" && task.status === "done")),
    )
    .toSorted((a, b) => a.priority - b.priority);
}

export function evidenceKind(recipe: Pick<PitbossVerificationRecipe, "mode"> | undefined) {
  if (!recipe) return "Outcome";
  if (recipe.mode === "artifact") return "Files & research";
  if (recipe.mode === "observation") return "Host observation";
  return "Code";
}
