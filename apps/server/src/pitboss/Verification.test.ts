import { describe, expect, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import { replayJournal } from "./WorkJournal.ts";
import { fixture } from "./Verification.testkit.ts";
const boss = ThreadId.make("boss");
describe("captured verification acceptance", () => {
  it("requires captured proof, preserves it through replay and invalidates acceptance on recipe change", () => {
    const f = fixture();
    const review = f.state.tasks[0]!.evidence.at(-1)!;
    expect(() =>
      f.act({ type: "accept", taskId: "task", evidenceId: review.id, note: "Accept" }),
    ).toThrow(/captured check/);
    f.act({ type: "verify", taskId: "task", evidenceId: review.id });
    expect(() => f.act({ type: "rework", taskId: "task", note: "Change code" })).toThrow(
      /verification to finish/,
    );
    f.complete();
    const evidence = f.state.tasks[0]!.evidence.at(-1)!;
    expect(evidence.provenance).toBe("captured_check");
    expect(evidence.capture?.recipeVersion).toBe(1);
    f.act({ type: "accept", taskId: "task", evidenceId: evidence.id, note: "Inspected" });
    expect(replayJournal(f.history)).toEqual(f.state);
    f.act({ type: "verification-recipe", recipe: { ...f.recipe, version: 2 } });
    expect(f.state.tasks[0]!.acceptedEvidenceId).toBeNull();
    expect(() =>
      f.act({ type: "accept", taskId: "task", evidenceId: evidence.id, note: "Reuse" }),
    ).toThrow(/captured check/);
  });
  it.each(["fail", "inconclusive"] as const)("cannot accept a %s receipt", (verdict) => {
    const f = fixture();
    f.act({ type: "verify", taskId: "task", evidenceId: f.state.tasks[0]!.evidence.at(-1)!.id });
    f.complete(verdict);
    expect(() =>
      f.act({
        type: "accept",
        taskId: "task",
        evidenceId: f.state.tasks[0]!.evidence.at(-1)!.id,
        note: "Accept",
      }),
    ).toThrow();
  });
  it("rejects model-authored recipe changes and stale candidate evidence", () => {
    const f = fixture();
    expect(() =>
      f.act(
        { type: "verification-recipe", recipe: { ...f.recipe, version: 2, verify: "true" } },
        { type: "agent", threadId: boss },
      ),
    ).toThrow(/Only the user/);
    f.act({ type: "verify", taskId: "task", evidenceId: f.state.tasks[0]!.evidence.at(-1)!.id });
    f.complete();
    const task = f.state.tasks[0]!;
    f.act({
      type: "review",
      taskId: task.id,
      attemptId: task.attempts[0]!.id,
      candidate: `commit:${"b".repeat(40)}`,
      criteriaVersion: 1,
      verdict: "pass",
      summary: "New integrated candidate",
      command: "node --test",
      artifactUrls: [],
    });
    expect(() =>
      f.act({
        type: "accept",
        taskId: task.id,
        evidenceId: f.state.tasks[0]!.evidence.at(-1)!.id,
        note: "Accept",
      }),
    ).toThrow(/captured check/);
  });
});

it("disabling and re-enabling a recipe is explicit and invalidates old passes", () => {
  const f = fixture();
  f.act({ type: "verification-recipe", recipe: { ...f.recipe, version: 2, enabled: false } });
  expect(() =>
    f.act({ type: "verify", taskId: "task", evidenceId: f.state.tasks[0]!.evidence.at(-1)!.id }),
  ).toThrow(/approve/);
  f.act({ type: "verification-recipe", recipe: { ...f.recipe, version: 3, enabled: true } });
  f.act({ type: "verify", taskId: "task", evidenceId: f.state.tasks[0]!.evidence.at(-1)!.id });
  f.complete();
  expect(f.state.tasks[0]!.verification!.recipe.version).toBe(3);
});
it("bounds automatic retries without preventing an explicit user retry", () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) {
    f.act({ type: "verify", taskId: "task", evidenceId: f.state.tasks[0]!.evidence.at(-1)!.id });
    f.complete("inconclusive");
  }
  expect(() =>
    f.act(
      { type: "verify", taskId: "task", evidenceId: f.state.tasks[0]!.evidence.at(-1)!.id },
      { type: "agent", threadId: boss },
    ),
  ).toThrow(/retry allowance/);
  f.act({ type: "verify", taskId: "task", evidenceId: f.state.tasks[0]!.evidence.at(-1)!.id });
  expect(f.state.tasks[0]!.verification!.state).toBe("pending");
});
