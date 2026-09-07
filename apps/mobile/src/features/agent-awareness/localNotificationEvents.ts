import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";

export type LocalAgentNotificationKind = "approval" | "input" | "completion" | "failure";

export interface LocalAgentNotificationEvent {
  readonly environmentId: string;
  readonly threadId: string;
  readonly threadTitle: string;
  readonly kind: LocalAgentNotificationKind;
}

type NotificationThread = Pick<
  EnvironmentThreadShell,
  | "environmentId"
  | "id"
  | "title"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "latestRun"
  | "runtime"
>;

function threadKey(thread: NotificationThread): string {
  return `${thread.environmentId}:${thread.id}`;
}

export function localAgentNotificationEvents(input: {
  readonly previous: ReadonlyMap<string, NotificationThread>;
  readonly current: ReadonlyArray<NotificationThread>;
}): ReadonlyArray<LocalAgentNotificationEvent> {
  const events: LocalAgentNotificationEvent[] = [];

  for (const thread of input.current) {
    const previous = input.previous.get(threadKey(thread));
    if (!previous) continue;

    let kind: LocalAgentNotificationKind | null = null;
    if (!previous.hasPendingApprovals && thread.hasPendingApprovals) {
      kind = "approval";
    } else if (!previous.hasPendingUserInput && thread.hasPendingUserInput) {
      kind = "input";
    } else if (previous.runtime?.status !== "failed" && thread.runtime?.status === "failed") {
      kind = "failure";
    } else if (
      thread.latestRun?.status === "failed" &&
      (previous.latestRun?.runId !== thread.latestRun.runId ||
        previous.latestRun.status !== "failed")
    ) {
      kind = "failure";
    } else if (
      thread.latestRun?.status === "completed" &&
      (previous.latestRun?.runId !== thread.latestRun.runId ||
        previous.latestRun.status !== "completed")
    ) {
      kind = "completion";
    }

    if (kind) {
      events.push({
        environmentId: String(thread.environmentId),
        threadId: String(thread.id),
        threadTitle: thread.title,
        kind,
      });
    }
  }

  return events;
}

export function indexNotificationThreads(
  threads: ReadonlyArray<NotificationThread>,
): ReadonlyMap<string, NotificationThread> {
  return new Map(threads.map((thread) => [threadKey(thread), thread]));
}
