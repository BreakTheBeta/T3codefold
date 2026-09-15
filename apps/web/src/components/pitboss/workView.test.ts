import { describe, expect, it } from "vite-plus/test";
import { ProjectId, type PitbossTask } from "@t3tools/contracts";
import { evidenceKind, filterWork, needsAttention } from "./workView";

function task(title: string, status: PitbossTask["status"] = "queued", priority = 50) {
  return {
    title,
    outcome: "A useful result",
    status,
    priority,
    projectId: ProjectId.make("research"),
  };
}

describe("GLaDOS work discovery", () => {
  it("keeps every outcome reachable, including beyond the tenth item", () => {
    const tasks = Array.from({ length: 24 }, (_, i) => task(`Outcome ${i}`));
    expect(filterWork(tasks, "All", "", "")).toHaveLength(24);
    expect(filterWork(tasks, "All", "outcome 23", "")).toEqual([tasks[23]]);
  });
  it("combines project, text and status filters and orders by priority", () => {
    const first = task("Review sources", "active", 10);
    const second = task("Compare sources", "queued", 40);
    const other = { ...task("Other sources"), projectId: ProjectId.make("code") };
    expect(
      filterWork(
        [second, other, first, task("Accepted sources", "done")],
        "Working",
        " SOURCES ",
        "research",
      ),
    ).toEqual([first, second]);
  });
  it("keeps operational blockers with GLaDOS and keeps cancelled work out of delivered results", () => {
    const blocked = task("Missing hardware", "blocked");
    const done = task("Research report", "done");
    const cancelled = task("Cancelled render", "cancelled");
    expect(filterWork([blocked, done, cancelled], "Needs you", "", "")).toEqual([]);
    expect(filterWork([blocked, done, cancelled], "Working", "", "")).toEqual([blocked]);
    const decision = {
      ...blocked,
      decisions: [
        {
          id: "choice",
          question: "Which target?",
          options: ["A", "B"],
          recommendation: "A",
          requestedAt: "2026-09-15",
        },
      ],
    };
    expect(filterWork([decision], "Needs you", "", "")).toEqual([decision]);
    expect(filterWork([decision], "Working", "", "")).toEqual([]);
    expect(
      needsAttention({ ...decision, decisions: [{ ...decision.decisions[0]!, answer: "A" }] }),
    ).toBe(false);
    expect(filterWork([blocked, done, cancelled], "Delivered", "", "")).toEqual([done]);
    expect(needsAttention(cancelled)).toBe(false);
  });
  it("does not label unconfigured or file outcomes as code", () => {
    expect(evidenceKind(undefined)).toBe("Outcome");
    expect(evidenceKind({ mode: "artifact" })).toBe("Files & research");
    expect(evidenceKind({ mode: "observation" })).toBe("Host observation");
    expect(evidenceKind({})).toBe("Code");
  });
});
