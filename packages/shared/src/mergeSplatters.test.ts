// @effect-diagnostics globalDate:off -- Fixed local instants keep the 6am rollover deterministic.
import { ProjectId, type ThreadPullRequestLink } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { mergeDayStart, projectSplatterColor, rememberMerges } from "./mergeSplatters.ts";
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
  });
});

describe("rememberMerges", () => {
  const since = mergeDayStart(at(12));

  it("keeps each of today's merges once, in the project's colour", () => {
    const merges = rememberMerges(
      [],
      [thread([link(1, at(8)), link(2, at(5)), link(3, null, "open")]), thread([link(1, at(8))])],
      [project],
      since,
    );
    expect(merges).toEqual([
      { key: "github.com/acme/app#1", color: "teal", mergedAt: at(8).toISOString() },
    ]);
  });

  it("keeps remembered merges after their thread leaves the list, until the rollover", () => {
    const merges = rememberMerges([], [thread([link(1, at(8))])], [project], since);
    expect(rememberMerges(merges, [], [], since)).toBe(merges);
    expect(rememberMerges(merges, [], [], mergeDayStart(at(7, 22)))).toEqual([]);
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
