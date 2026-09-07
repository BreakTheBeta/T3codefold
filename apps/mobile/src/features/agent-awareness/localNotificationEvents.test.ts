import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId, RunId, ProviderInstanceId } from "@t3tools/contracts";
type NotificationThread = Parameters<typeof indexNotificationThreads>[0][number];

import { indexNotificationThreads, localAgentNotificationEvents } from "./localNotificationEvents";

function thread(input: Partial<NotificationThread> = {}): NotificationThread {
  return {
    environmentId: EnvironmentId.make("environment-1"),
    id: ThreadId.make("thread-1"),
    title: "Fix Android notifications",
    latestRun: null,
    runtime: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    ...input,
  };
}

function events(previous: NotificationThread, current: NotificationThread) {
  return localAgentNotificationEvents({
    previous: indexNotificationThreads([previous]),
    current: [current],
  });
}

describe("localAgentNotificationEvents", () => {
  const base = thread();

  it.each([
    ["approval", { hasPendingApprovals: true }],
    ["input", { hasPendingUserInput: true }],
    [
      "failure",
      {
        runtime: {
          status: "failed",
          activeRunId: null,
          providerInstanceId: ProviderInstanceId.make("codex"),
          providerName: null,
          lastError: "Failed",
          updatedAt: "2026-08-30T00:00:00.000Z",
        },
      },
    ],
  ] as const)("emits a %s transition once", (kind, update) => {
    const current = thread({ ...base, ...update });
    expect(events(base, current).map((event) => event.kind)).toEqual([kind]);
    expect(events(current, current)).toEqual([]);
  });

  it("emits completion when a running turn completes", () => {
    const running = thread({
      ...base,
      latestRun: {
        runId: RunId.make("run-1"),
        status: "running",
        requestedAt: "2026-08-30T00:00:01.000Z",
        startedAt: "2026-08-30T00:00:02.000Z",
        completedAt: null,
        assistantMessageId: null,
      },
    });
    const completed = thread({
      ...running,
      latestRun: {
        ...running.latestRun!,
        status: "completed",
        completedAt: "2026-08-30T00:00:03.000Z",
      },
    });
    expect(events(running, completed).map((event) => event.kind)).toEqual(["completion"]);
  });

  it("does not emit for the initial snapshot", () => {
    expect(localAgentNotificationEvents({ previous: new Map(), current: [base] })).toEqual([]);
  });
});
