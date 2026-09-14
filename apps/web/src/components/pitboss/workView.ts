import type { PitbossTask, PitbossVerificationRecipe } from "@t3tools/contracts";

export const workFilters = ["All", "Needs you", "Working", "Delivered"] as const;
export type WorkFilter = (typeof workFilters)[number];

export function needsAttention(
  task: Pick<PitbossTask, "status" | "decisions" | "proposedVerificationRecipe">,
) {
  return (
    !["done", "cancelled"].includes(task.status) &&
    (task.status === "blocked" ||
      !!task.proposedVerificationRecipe ||
      !!task.decisions?.some((decision) => decision.answer === undefined))
  );
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
  >,
>(tasks: readonly T[], filter: WorkFilter, search: string, projectId: string) {
  const query = search.trim().toLocaleLowerCase();
  return tasks
    .filter(
      (task) =>
        (!projectId || task.projectId === projectId) &&
        (!query || `${task.title} ${task.outcome}`.toLocaleLowerCase().includes(query)) &&
        (filter === "All" ||
          (filter === "Needs you" && needsAttention(task)) ||
          (filter === "Working" && ["queued", "active", "verifying"].includes(task.status)) ||
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
