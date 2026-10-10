import { describe, expect, it } from "vite-plus/test";
import {
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import {
  storageCleanupActivityAt,
  storageCleanupIgnoredEntryRegenerable,
  storageCleanupThreadIdle,
  storageCleanupWorktreeIdleSince,
} from "./storageCleanup.ts";

const NOW_MS = Date.parse("2026-06-10T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;

function at(offsetMs: number): DateTime.Utc {
  return DateTime.makeUnsafe(NOW_MS + offsetMs);
}

function shell(overrides: Partial<OrchestrationV2ThreadShell> = {}): OrchestrationV2ThreadShell {
  return {
    id: ThreadId.make("thread-1"),
    projectId: ProjectId.make("project-1"),
    title: "Thread",
    providerInstanceId: ProviderInstanceId.make("codex"),
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: {
      rootThreadId: ThreadId.make("thread-1"),
      parentThreadId: null,
      relationshipToParent: null,
    },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "web",
    activeRunId: null,
    latestVisibleMessage: null,
    hasActionableProposedPlan: false,
    itemCount: 0,
    visibleItemCount: 0,
    lastVisitedAt: null,
    deletedAt: null,
    branch: null,
    linkedPullRequest: null,
    status: "idle",
    activityRunStatus: null,
    pendingRuntimeRequest: null,
    pendingBackgroundTasks: [],
    latestRunId: null,
    latestRunRequestedAt: null,
    latestRunStartedAt: null,
    latestRunCompletedAt: null,
    latestUserMessageAt: null,
    createdAt: at(-30 * DAY_MS),
    updatedAt: at(-10 * DAY_MS),
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    snoozedUntil: null,
    snoozedAt: null,
    pinnedAt: null,
    ...overrides,
  };
}

describe("V2 storage cleanup eligibility", () => {
  const candidate = () => shell({ branch: "feature", worktreePath: "/worktrees/feature" });

  it("allows an idle worktree and rejects the project checkout", () => {
    expect(storageCleanupThreadIdle(candidate(), NOW_MS)).toBe(true);
    expect(storageCleanupThreadIdle(shell(), NOW_MS)).toBe(false);
  });

  it.each(["running", "starting", "preparing", "waiting", "queued"] as const)(
    "retains a worktree while its thread is %s",
    (status) => {
      expect(storageCleanupThreadIdle(candidateWithStatus(status), NOW_MS)).toBe(false);
    },
  );

  it("retains an active run even if the shell status is idle", () => {
    expect(
      storageCleanupThreadIdle({ ...candidate(), activeRunId: RunId.make("run") }, NOW_MS),
    ).toBe(false);
  });

  it("retains a queued prompt before the new run has been projected", () => {
    expect(
      storageCleanupThreadIdle({ ...candidate(), latestUserMessageAt: at(-1_000) }, NOW_MS),
    ).toBe(false);
  });

  it("uses V2 run activity instead of metadata refreshes for retention", () => {
    const thread = candidate();
    const runTime = at(-3 * DAY_MS);
    expect(
      storageCleanupActivityAt({ ...thread, latestRunCompletedAt: runTime, updatedAt: at(0) }),
    ).toBe(DateTime.toEpochMillis(runTime));
  });

  function candidateWithStatus(status: OrchestrationV2ThreadShell["status"]) {
    return { ...candidate(), status };
  }
});

describe("V2 storage cleanup shared worktrees", () => {
  const onWorktree = (id: string, overrides: Partial<OrchestrationV2ThreadShell> = {}) =>
    shell({
      id: ThreadId.make(id),
      branch: "feature",
      worktreePath: "/worktrees/feature",
      ...overrides,
    });

  it("dates a shared worktree from its most recently active thread", () => {
    const recent = at(-3 * DAY_MS);
    expect(
      storageCleanupWorktreeIdleSince(
        [
          onWorktree("a", { latestRunCompletedAt: at(-9 * DAY_MS) }),
          onWorktree("b", { latestRunCompletedAt: recent }),
          onWorktree("c", { archivedAt: at(-20 * DAY_MS) }),
        ],
        NOW_MS,
      ),
    ).toBe(DateTime.toEpochMillis(recent));
  });

  it("keeps a shared worktree while any of its threads is busy", () => {
    expect(
      storageCleanupWorktreeIdleSince(
        [onWorktree("a"), onWorktree("b", { status: "running" })],
        NOW_MS,
      ),
    ).toBeNull();
  });

  it("keeps a worktree whose threads disagree on branch or project", () => {
    expect(
      storageCleanupWorktreeIdleSince(
        [onWorktree("a"), onWorktree("b", { branch: "other" })],
        NOW_MS,
      ),
    ).toBeNull();
    expect(
      storageCleanupWorktreeIdleSince(
        [onWorktree("a"), onWorktree("b", { projectId: ProjectId.make("project-2") })],
        NOW_MS,
      ),
    ).toBeNull();
  });
});

describe("V2 storage cleanup ignored files", () => {
  it.each([
    "node_modules/",
    "apps/web/node_modules/",
    ".vite-hooks/_/",
    ".vite-hooks/_/pre-commit",
    ".husky/_/",
    "apps/web/tsconfig.tsbuildinfo",
    "apps/mobile/.expo/",
    ".generated/",
    "apps/desktop/dist-electron/",
    "apps/server/dist/",
    "apps/marketing/.astro/",
    "native/foo/target/",
    ".turbo/",
    "coverage/",
    "src/__pycache__/",
  ])("treats %s as regenerable", (entry) => {
    expect(storageCleanupIgnoredEntryRegenerable(entry)).toBe(true);
  });

  it.each([
    ".env",
    ".env.local",
    "infra/relay/.env",
    "gen-secret",
    ".t3/",
    "data/",
    "notes.md",
    ".husky/pre-commit",
    "node_modules",
    "dist",
  ])("keeps the worktree for %s", (entry) => {
    expect(storageCleanupIgnoredEntryRegenerable(entry)).toBe(false);
  });
});
