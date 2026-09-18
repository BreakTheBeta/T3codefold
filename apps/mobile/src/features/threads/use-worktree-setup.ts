import type { EnvironmentId, ThreadId, WorktreeSetupSnapshot } from "@t3tools/contracts";
import {
  findRecordedWorktreeSetup,
  resolveVisibleWorktreeSetup,
} from "@t3tools/client-runtime/worktree-setup";
import { useEffect, useState } from "react";
import { useEnvironmentQuery } from "../../state/query";
import { vcsEnvironment } from "../../state/vcs";
import { resolveWorktreeSetupSnapshot } from "./worktree-setup-state";

/** Retain the last live snapshot when its subscription closes after setup. */
export function useWorktreeSetup(input: {
  environmentId: EnvironmentId | null;
  threadId: ThreadId | null;
  activities: ReadonlyArray<{ kind: string; payload: unknown }>;
  preparing: boolean;
  turnStarted: boolean;
  followUpSent: boolean;
}) {
  const key = JSON.stringify([input.environmentId, input.threadId]);
  const [held, setHeld] = useState<{ key: string; snapshot: WorktreeSetupSnapshot } | null>(null);
  const live = held?.key === key ? held.snapshot : null;
  const recorded = input.threadId
    ? findRecordedWorktreeSetup(input.activities, input.threadId)
    : null;
  const query = useEnvironmentQuery(
    input.environmentId &&
      input.threadId &&
      (live?.phase === "running" || (!live && input.preparing))
      ? vcsEnvironment.worktreeSetup({
          environmentId: input.environmentId,
          input: { threadId: input.threadId },
        })
      : null,
  );
  const snapshot = resolveWorktreeSetupSnapshot(input.threadId, query.data, live);
  useEffect(() => {
    if (snapshot && snapshot !== live) setHeld({ key, snapshot });
  }, [key, live, snapshot]);
  return {
    snapshot,
    visible: resolveVisibleWorktreeSetup({
      live: snapshot,
      recorded,
      turnStarted: input.turnStarted,
      followUpSent: input.followUpSent,
    }),
  };
}
