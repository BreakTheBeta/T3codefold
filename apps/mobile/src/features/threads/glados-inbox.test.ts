import { describe, expect, it } from "vite-plus/test";
import {
  ProjectId,
  ThreadId,
  ProviderInstanceId,
  type PitbossTask,
  type PitbossSnapshot,
  type PitbossMessage,
} from "@t3tools/contracts";
import {
  gladosElection,
  gladosInboxLayout,
  gladosInboxRows,
  gladosNewTask,
  gladosReceiptStatus,
} from "./glados-inbox";
const projectId = ProjectId.make("project");
const model = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "worker",
  options: [{ id: "reasoningEffort", value: "high" }],
};
const brief = {
  priorities: "House before exploration",
  quality: "Preserve taste and show proof",
  projectIds: [projectId, ProjectId.make("music")],
  maxWorkers: 4,
  maxAttempts: 2,
  workerModel: model,
  alternateWorkerModel: { ...model, model: "alternate" },
  workerRuntimeMode: "approval-required" as const,
  modelGuidance: "Use the cheaper worker first",
  managedPeerIds: ["home"],
};
const task = (id: string, status: PitbossTask["status"]): PitbossTask => ({
  id,
  projectId,
  title: id,
  outcome: "Outcome",
  criteria: "Evidence",
  criteriaVersion: 1,
  verifyCommand: "",
  priority: 50,
  dependencies: [],
  workspaceStrategy: { type: "root" },
  status,
  attempts: [],
  evidence: [],
  source: null,
  note: "",
  acceptedEvidenceId: null,
  revision: 1,
  createdAt: "2026-09-14",
  updatedAt: "2026-09-14",
});
const message = (
  id: string,
  taskId: string | null,
  kind: PitbossMessage["kind"],
): PitbossMessage => ({
  id,
  taskId,
  kind,
  text: "Please inspect",
  threadId: null,
  createdAt: "2026-09-14",
  acknowledged: false,
});
const snapshot = (tasks: PitbossTask[], messages: PitbossMessage[] = []): PitbossSnapshot => ({
  revision: 1,
  role: null,
  tasks,
  messages,
});

describe("GLaDOS mobile decisions", () => {
  it("moving the role retains the complete operating agreement, including future optional settings", () => {
    const action = gladosElection({
      threadId: ThreadId.make("new-thread"),
      projectId,
      priorities: "unsaved draft",
      modelSelection: { ...model, model: "different" },
      brief,
    });
    expect(action.type).toBe("elect");
    if (action.type !== "elect") throw new Error("Expected election");
    expect(action.brief).toBe(brief);
    expect(action.threadId).toBe("new-thread");
  });
  it("creates non-Git work by default and isolates code only when selected", () => {
    const fields = {
      id: "research",
      projectId,
      title: " Compare options ",
      criteria: " Dated sources ",
    };
    const research = gladosNewTask({ ...fields, isolatedCode: false });
    const code = gladosNewTask({ ...fields, isolatedCode: true });
    if (research.type !== "create" || code.type !== "create") throw new Error("Expected creation");
    expect(research.workspaceStrategy).toEqual({ type: "root" });
    expect(code.workspaceStrategy).toEqual({ type: "worktree", baseRef: "HEAD" });
    expect(research.title).toBe("Compare options");
  });
  it("surfaces questions with their task once, leaves progress in working and clears acknowledged decisions", () => {
    const state = snapshot(
      [task("research", "active"), task("game", "verifying"), task("done", "done")],
      [
        message("question", "research", "question"),
        message("global", null, "decision"),
        message("update", null, "progress"),
      ],
    );
    expect(gladosInboxRows(state, "needs-you").map((r) => r.key)).toEqual([
      "message:global",
      "task:research",
      "task:game",
    ]);
    expect(gladosInboxRows(state, "working").map((r) => r.key)).toEqual(["message:update"]);
    expect(gladosInboxRows(state, "delivered").map((r) => r.key)).toEqual(["task:done"]);
    const acknowledged = {
      ...state,
      messages: state.messages.map((m) => ({ ...m, acknowledged: true })),
    };
    expect(gladosInboxRows(acknowledged, "needs-you").map((r) => r.key)).toEqual(["task:game"]);
    expect(gladosInboxRows(acknowledged, "working").map((r) => r.key)).toEqual(["task:research"]);
  });
  it("keeps answered tasks in working and cancelled questions in delivered", () => {
    const state = snapshot(
      [task("answered", "queued"), task("cancelled", "cancelled")],
      [message("answer", "answered", "progress"), message("old-question", "cancelled", "question")],
    );
    expect(gladosInboxRows(state, "needs-you")).toEqual([]);
    expect(gladosInboxRows(state, "working").map((row) => row.key)).toEqual(["task:answered"]);
    expect(gladosInboxRows(state, "delivered").map((row) => row.key)).toEqual(["task:cancelled"]);
  });
  it("keeps orphaned decisions visible and does not truncate a busy backlog", () => {
    const state = snapshot(
      Array.from({ length: 150 }, (_, i) => task(`task-${i}`, "blocked")),
      [message("orphan", "removed", "question")],
    );
    expect(gladosInboxRows(state, "needs-you")).toHaveLength(151);
  });
  it("marks expired observations as stale even when the captured command passed", () => {
    let t = task("health", "verifying");
    const recipe = {
      projectId,
      version: 1,
      name: "Health",
      doctor: "ready",
      verify: "check",
      cleanup: "",
      timeoutSeconds: 5,
      artifacts: [],
    };
    t = {
      ...t,
      verification: {
        id: "run",
        state: "completed",
        candidate: "observation:service",
        attemptId: "attempt",
        criteriaVersion: 1,
        recipe,
        requestedAt: "2026-09-14T00:00:00Z",
        receipt: {
          verdict: "pass",
          summary: "healthy",
          checks: [],
          artifacts: [],
          finishedAt: "2026-09-14T00:00:01Z",
          expiresAt: "2026-09-14T00:05:00Z",
        },
      },
    };
    expect(gladosReceiptStatus(t, snapshot([t]), Date.parse("2026-09-14T00:05:00Z"))).toMatch(
      /expired/,
    );
  });
  it.each([
    { width: 384, height: 832, split: false },
    { width: 390, height: 844, split: false },
    { width: 768, height: 900, split: true },
    { width: 900, height: 768, split: true },
    { width: 600, height: 900, split: false },
    { width: 900, height: 450, split: false },
  ])("keeps usable review space at $width × $height", ({ width, height, split }) => {
    const layout = gladosInboxLayout(width, height);
    expect(layout.split).toBe(split);
    if (split) expect(width - layout.listWidth).toBeGreaterThanOrEqual(428);
  });
});
