// @effect-diagnostics globalDate:off -- The rollover is 6am on the viewer's wall clock, in their zone.
/**
 * Which pull requests the dynamic splatter backdrop paints: one splat per PR
 * merged since the day last rolled over at 6am local time, in the colour of
 * the project it merged in.
 *
 * Clients remember what they have seen in local storage, because the thread
 * a PR is linked to is often archived right after the merge and drops out of
 * the live thread list. The remembered list is pruned at the rollover.
 */
import {
  ProjectIconColor,
  type OrchestrationProjectShell,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";

import {
  type MergeSplat,
  type SplatterAppearance,
  type SplatterOklch,
  tuneSplatterPaint,
} from "./splatterBackdrop.ts";

export type MergedPullRequest = {
  /** Host-level PR identity, so a PR linked from two threads splats once. */
  readonly key: string;
  readonly color: ProjectIconColor;
  readonly mergedAt: string;
};

/** The hour the backdrop wipes clean each day, in local time. */
const ROLLOVER_HOUR = 6;

/** The most recent 6am local at or before `now`. */
export function mergeDayStart(now: Date): Date {
  const start = new Date(now);
  start.setHours(ROLLOVER_HOUR, 0, 0, 0);
  if (start > now) start.setDate(start.getDate() - 1);
  return start;
}

/**
 * A project's colour: its chosen icon colour, else the one its generated
 * monogram gets (mirrors apps/web/src/projectIdentity.ts).
 */
export function projectSplatterColor(
  project: Pick<OrchestrationProjectShell, "title" | "projectIcon">,
): ProjectIconColor {
  const icon = project.projectIcon;
  if (icon && icon.kind !== "emoji") return icon.color;
  const colors = ProjectIconColor.literals;
  const seed = project.title.normalize("NFKC").trim().toLocaleLowerCase("en-US") || "project";
  let index = 0;
  for (const glyph of seed) index = (index * 31 + (glyph.codePointAt(0) ?? 0)) % colors.length;
  return colors[index] ?? "blue";
}

type ScopedThread = Pick<OrchestrationThreadShell, "projectId" | "pullRequests"> & {
  readonly environmentId: string;
};
type ScopedProject = Pick<OrchestrationProjectShell, "id" | "title" | "projectIcon"> & {
  readonly environmentId: string;
};

/**
 * Folds the merges visible in these threads into `remembered`, dropping any
 * from before `since`. Returns `remembered` itself when nothing changed, so
 * callers can skip a write.
 */
export function rememberMerges(
  remembered: ReadonlyArray<MergedPullRequest>,
  threads: ReadonlyArray<ScopedThread>,
  projects: ReadonlyArray<ScopedProject>,
  since: Date,
): ReadonlyArray<MergedPullRequest> {
  const cutoff = since.getTime();
  const isToday = (mergedAt: string) => Date.parse(mergedAt) >= cutoff;
  const kept = remembered.filter((merge) => isToday(merge.mergedAt));
  const seen = new Set(kept.map((merge) => merge.key));
  const added: Array<MergedPullRequest> = [];
  for (const thread of threads) {
    for (const link of thread.pullRequests) {
      const mergedAt = link.snapshot?.state === "merged" ? link.snapshot.mergedAt : null;
      if (!mergedAt || link.source === "stack-dismissed" || !isToday(mergedAt)) continue;
      const key = `${link.host}/${link.repository}#${link.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const project = projects.find(
        (candidate) =>
          candidate.id === thread.projectId && candidate.environmentId === thread.environmentId,
      );
      added.push({
        key,
        color: project ? projectSplatterColor(project) : "gray",
        mergedAt,
      });
    }
  }
  if (added.length === 0 && kept.length === remembered.length) return remembered;
  // Hermes has no toSorted; this array is fresh.
  return [...kept, ...added].sort((a, b) => Date.parse(a.mergedAt) - Date.parse(b.mergedAt));
}

/** Tailwind's 500 shades, which the project icon swatches use. */
const PROJECT_PAINT: Record<ProjectIconColor, SplatterOklch> = {
  gray: { l: 0.551, c: 0.027, h: 264.4 },
  red: { l: 0.637, c: 0.237, h: 25.3 },
  orange: { l: 0.705, c: 0.213, h: 47.6 },
  amber: { l: 0.769, c: 0.188, h: 70.1 },
  yellow: { l: 0.795, c: 0.184, h: 86.0 },
  lime: { l: 0.768, c: 0.233, h: 130.9 },
  green: { l: 0.723, c: 0.219, h: 149.6 },
  emerald: { l: 0.696, c: 0.17, h: 162.5 },
  teal: { l: 0.704, c: 0.14, h: 182.5 },
  cyan: { l: 0.715, c: 0.143, h: 215.2 },
  sky: { l: 0.685, c: 0.169, h: 237.3 },
  blue: { l: 0.623, c: 0.214, h: 259.8 },
  indigo: { l: 0.585, c: 0.233, h: 277.1 },
  violet: { l: 0.606, c: 0.25, h: 292.7 },
  purple: { l: 0.627, c: 0.265, h: 303.9 },
  fuchsia: { l: 0.667, c: 0.295, h: 322.2 },
  pink: { l: 0.656, c: 0.241, h: 354.3 },
  rose: { l: 0.645, c: 0.246, h: 16.4 },
};

/** Paint for each merge, tuned to read on this appearance's canvas. */
export function mergeSplats(
  merges: ReadonlyArray<MergedPullRequest>,
  appearance: SplatterAppearance,
): ReadonlyArray<MergeSplat> {
  return merges.map((merge) => ({
    key: merge.key,
    color: tuneSplatterPaint(PROJECT_PAINT[merge.color], appearance),
  }));
}
