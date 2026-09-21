// @effect-diagnostics globalDate:off -- Fixed local instants keep the 6am rollover deterministic.
import { ProjectId, type ThreadPullRequestLink } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  collectMergedPullRequests,
  mergeDayStart,
  mergesSince,
  nextMergeDayStart,
  projectSplatterColor,
  sameMerges,
} from "./mergeSplatters.ts";
import { renderMergeSplatters } from "./splatterBackdrop.ts";

const projectId = ProjectId.make("project-1");
const at = (hours: number, day = 21) => new Date(2026, 8, day, hours, 30);

function link(number: number, mergedAt: Date | null, state: "merged" | "open" = "merged") {
  return {
    host: "github.com",
    repository: "acme/app",
    number,
    url: `https://github.com/acme/app/pull/${number}`,
    source: "created",
    linkedAt: at(1).toISOString(),
    snapshot: {
      state,
      title: "Change",
      headBranch: "feature",
      baseBranch: "main",
      isDraft: false,
      updatedAt: null,
      syncedAt: at(1).toISOString(),
      mergedAt: mergedAt?.toISOString() ?? null,
    },
    stack: null,
  } satisfies ThreadPullRequestLink;
}

const project = {
  environmentId: "env",
  id: projectId,
  title: "App",
  projectIcon: { kind: "lucide", name: "code", color: "teal" },
} as const;
const thread = (pullRequests: ReadonlyArray<ThreadPullRequestLink>) => ({
  environmentId: "env",
  projectId,
  pullRequests,
});

describe("mergeDayStart", () => {
  it("rolls over at 6am local", () => {
    expect(mergeDayStart(at(9))).toEqual(new Date(2026, 8, 21, 6));
    expect(mergeDayStart(at(5))).toEqual(new Date(2026, 8, 20, 6));
    expect(nextMergeDayStart(at(5))).toBe(new Date(2026, 8, 21, 6).getTime());
    expect(nextMergeDayStart(at(9))).toBe(new Date(2026, 8, 22, 6).getTime());
  });
});

describe("merged pull requests", () => {
  const since = mergeDayStart(at(12)).getTime();

  it("keeps each of today's merges once, in the project's colour", () => {
    const merges = collectMergedPullRequests(
      [thread([link(1, at(8)), link(2, at(5)), link(3, null, "open")]), thread([link(1, at(8))])],
      [project],
    );
    expect(mergesSince(merges, since)).toEqual([
      { key: "github.com/acme/app#1", color: "teal", mergedAt: at(8).toISOString() },
    ]);
  });

  it("collects the same list from the same threads, and is empty after the rollover", () => {
    const threads = [thread([link(1, at(8))])];
    const merges = collectMergedPullRequests(threads, [project]);
    expect(sameMerges(merges, collectMergedPullRequests(threads, [project]))).toBe(true);
    expect(mergesSince(merges, mergeDayStart(at(7, 22)).getTime())).toEqual([]);
  });
});

it("derives a colour for projects without one", () => {
  expect(projectSplatterColor({ title: "App", projectIcon: null })).toBe(
    projectSplatterColor({ title: " app ", projectIcon: null }),
  );
});

it("adding a merge leaves the existing splats where they were", () => {
  const options = {
    colors: ["#39ff88", "#29d9ff", "#ff3dcb"],
    appearance: "dark",
    intensity: 1,
    glow: false,
    seed: 0,
    amount: 1,
  } as const;
  const one = renderMergeSplatters([{ key: "a#1", color: "#ff0000" }], options);
  const two = renderMergeSplatters(
    [
      { key: "a#1", color: "#ff0000" },
      { key: "a#2", color: "#00ff00" },
    ],
    options,
  );
  const firstSplat = one.match(/<g id="mm0">.*?<\/g>/)?.[0];
  expect(firstSplat).toBeTruthy();
  expect(two).toContain(firstSplat);
});
