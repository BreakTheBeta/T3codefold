import { describe, expect, it } from "vite-plus/test";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";

import { indexNotificationThreads, localAgentNotificationEvents } from "./localNotificationEvents";

function thread(input: Record<string, unknown>): EnvironmentThreadShell {
  return {
    projectId: "project-1",
    title: "Fix Android notifications",
    modelSelection: null,
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    deletedAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    ...input,
  } as unknown as EnvironmentThreadShell;
}

function events(previous: EnvironmentThreadShell, current: EnvironmentThreadShell) {
  return localAgentNotificationEvents({
    previous: indexNotificationThreads([previous]),
    current: [current],
  });
}

describe("localAgentNotificationEvents", () => {
  const base = thread({ environmentId: "environment-1", id: "thread-1" });

  it.each([
    ["approval", { hasPendingApprovals: true }],
    ["input", { hasPendingUserInput: true }],
    ["failure", { session: { status: "error" } }],
  ] as const)("emits a %s transition once", (kind, update) => {
    const current = thread({ ...base, ...update });
    expect(events(base, current).map((event) => event.kind)).toEqual([kind]);
    expect(events(current, current)).toEqual([]);
  });

  it("emits completion when a running turn completes", () => {
    const running = thread({
      ...base,
      latestTurn: {
        turnId: "turn-1",
        state: "running",
        requestedAt: "2026-08-30T00:00:01.000Z",
        startedAt: "2026-08-30T00:00:02.000Z",
        completedAt: null,
        assistantMessageId: null,
      },
    });
    const completed = thread({
      ...running,
      latestTurn: {
        ...running.latestTurn!,
        state: "completed",
        completedAt: "2026-08-30T00:00:03.000Z",
      },
    });
    expect(events(running, completed).map((event) => event.kind)).toEqual(["completion"]);
  });

  it("does not emit for the initial snapshot", () => {
    expect(localAgentNotificationEvents({ previous: new Map(), current: [base] })).toEqual([]);
  });
});
