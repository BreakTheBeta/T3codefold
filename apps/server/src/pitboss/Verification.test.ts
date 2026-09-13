import { decide } from "./Work.ts";
import { describe, expect, it } from "@effect/vitest";
import {
  CommandId,
  ThreadId,
  hasCurrentVerification,
  verificationRecipeForTask,
} from "@t3tools/contracts";
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

it("keeps code and research profiles independent within one project and preserves selection on edit", () => {
  const f = fixture();
  f.act({
    type: "verification-recipe",
    recipe: { ...f.recipe, profileId: "research", mode: "artifact", inputPath: "research.json" },
  });
  f.act({
    type: "create",
    taskId: "research",
    projectId: f.recipe.projectId,
    title: "Findings",
    outcome: "Answer the question",
    criteria: "Sources and unknowns",
    verifyCommand: "inspect",
    priority: 1,
    dependencies: [],
    workspaceStrategy: { type: "root" },
  });
  f.act(
    { type: "verification-profile", taskId: "research", profileId: "research" },
    { type: "agent", threadId: boss },
  );
  expect(verificationRecipeForTask(f.state, f.state.tasks[0]!)?.mode ?? "commit").toBe("commit");
  expect(verificationRecipeForTask(f.state, f.state.tasks[1]!)?.mode).toBe("artifact");
  f.act({
    type: "edit",
    taskId: "research",
    projectId: f.recipe.projectId,
    title: "Better title",
    outcome: "Answer the question",
    criteria: "Sources and unknowns",
    verifyCommand: "inspect",
    priority: 2,
    dependencies: [],
    workspaceStrategy: { type: "root" },
  });
  expect(f.state.tasks[1]!.verificationProfileId).toBe("research");
  f.act({ type: "verify", taskId: "task", evidenceId: f.state.tasks[0]!.evidence.at(-1)!.id });
  f.complete();
  f.act({
    type: "accept",
    taskId: "task",
    evidenceId: f.state.tasks[0]!.evidence.at(-1)!.id,
    note: "Reviewed",
  });
  f.act({
    type: "verification-recipe",
    recipe: {
      ...f.recipe,
      profileId: "research",
      mode: "artifact",
      inputPath: "research.json",
      version: 2,
    },
  });
  expect(f.state.tasks[0]!.status).toBe("done");
  expect(replayJournal(f.history)).toEqual(f.state);
});

it("requires user approval to weaken or change proof after an attempt", () => {
  const f = fixture();
  expect(() =>
    f.act(
      { type: "verification-profile", taskId: "task", profileId: null },
      { type: "agent", threadId: boss },
    ),
  ).toThrow(/Only the user/);
  f.act({ type: "verification-profile", taskId: "task", profileId: null });
  expect(verificationRecipeForTask(f.state, f.state.tasks[0]!)).toBeUndefined();
  expect(f.state.tasks[0]!.criteriaVersion).toBe(2);
});

it("binds artifact verification to the selected profile and current digest", () => {
  const f = fixture();
  f.act({
    type: "verification-recipe",
    recipe: { ...f.recipe, profileId: "research", mode: "artifact", inputPath: "research.json" },
  });
  f.act({ type: "verification-profile", taskId: "task", profileId: "research" });
  expect(() =>
    f.act({ type: "verify", taskId: "task", evidenceId: f.state.tasks[0]!.evidence.at(-1)!.id }),
  ).toThrow(/matching the selected profile/);
  const task = f.state.tasks[0]!;
  f.act({
    type: "review",
    taskId: "task",
    attemptId: task.attempts[0]!.id,
    candidate: `sha256:${"b".repeat(64)}`,
    criteriaVersion: task.criteriaVersion,
    verdict: "pass",
    summary: "A supported negative result",
    command: "inspect",
    artifactUrls: [],
  });
  f.act({ type: "verify", taskId: "task", evidenceId: f.state.tasks[0]!.evidence.at(-1)!.id });
  f.complete();
  const verified = f.state.tasks[0]!;
  expect(
    hasCurrentVerification(
      verified,
      verificationRecipeForTask(f.state, verified),
      verified.verification!.candidate,
    ),
  ).toBe(true);
  expect(hasCurrentVerification(verified, f.recipe, verified.verification!.candidate)).toBe(false);
});

it("requires explicit host observation authority and rejects expired proof at acceptance", () => {
  const f = fixture();
  expect(() =>
    f.act({
      type: "verification-recipe",
      recipe: { ...f.recipe, profileId: "health", mode: "observation" },
    }),
  ).toThrow(/Observation profiles require/);
  f.act({ type: "verify", taskId: "task", evidenceId: f.state.tasks[0]!.evidence.at(-1)!.id });
  f.complete();
  const task = f.state.tasks[0]!;
  const expired = {
    ...task,
    verification: {
      ...task.verification!,
      receipt: { ...task.verification!.receipt!, expiresAt: "2026-09-13T00:05:00Z" },
    },
  };
  expect(
    hasCurrentVerification(
      expired,
      f.recipe,
      task.verification!.candidate,
      Date.parse("2026-09-13T00:04:59Z"),
    ),
  ).toBe(true);
  expect(
    hasCurrentVerification(
      expired,
      f.recipe,
      task.verification!.candidate,
      Date.parse("2026-09-13T00:05:00Z"),
    ),
  ).toBe(false);
  expect(() =>
    decide(
      { ...f.state, tasks: [expired] },
      {
        commandId: CommandId.make("accept-expired"),
        expectedRevision: f.state.revision,
        action: {
          type: "accept",
          taskId: task.id,
          evidenceId: task.evidence.at(-1)!.id,
          note: "Accept stale observation",
        },
      },
      { type: "user" },
      "2026-09-13T00:05:00Z",
    ),
  ).toThrow(/captured check/);
});
