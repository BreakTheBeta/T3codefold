import { describe, expect, it } from "vite-plus/test";
import {
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type PitbossMessage,
  type PitbossTask,
} from "@t3tools/contracts";
import {
  buildGladosBoard,
  gladosBoardColumnWidth,
  gladosTaskLane,
  managedWorkerRows,
  managedWorkerStateLabel,
} from "./gladosBoard.ts";

const task = (id: string, status: PitbossTask["status"]): PitbossTask => ({
  id,
  projectId: ProjectId.make("project"),
  title: id,
  outcome: "Outcome",
  criteria: "Evidence",
  criteriaVersion: 1,
  verifyCommand: "",
  priority: 50,
  dependencies: [],
  workspaceStrategy: { type: "root" },
  status,
  attempts:
    status === "active"
      ? [
          {
            id: `attempt-${id}`,
            threadId: ThreadId.make(`worker-${id}`),
            generation: 1,
            state: "running",
            model: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.6-sol" },
            createdAt: "2026-09-18",
            detail: "Worker launched",
          },
        ]
      : [],
  evidence: [],
  source: null,
  note: "",
  acceptedEvidenceId: null,
  revision: 1,
  createdAt: "2026-09-18",
  updatedAt: "2026-09-18",
});
const message = (taskId: string | null): PitbossMessage => ({
  id: "question",
  taskId,
  kind: "question",
  text: "Which direction?",
  threadId: null,
  createdAt: "2026-09-18",
  acknowledged: false,
});
const contents = (
  tasks: PitbossTask[],
  messages: PitbossMessage[] = [],
  awaitingApproval?: readonly string[],
) =>
  Object.fromEntries(
    buildGladosBoard({ tasks, messages, awaitingApproval }).map((lane) => [
      lane.id,
      lane.items.map((item) => item.key),
    ]),
  );

describe("GLaDOS board", () => {
  it("separates operational blockers and verification from user questions", () => {
    expect(
      contents(
        [
          task("queued", "queued"),
          task("working", "active"),
          task("review", "verifying"),
          task("blocked", "blocked"),
          task("question", "blocked"),
          task("done", "done"),
          task("closed", "cancelled"),
        ],
        [message("question")],
      ),
    ).toEqual({
      "needs-you": ["task:question"],
      queued: ["task:queued"],
      working: ["task:working"],
      review: ["task:review"],
      waiting: ["task:blocked"],
      done: ["task:done"],
      closed: ["task:closed"],
    });
  });
  it("keeps completed work delivered despite stale questions and updates after reopening", () => {
    const completed = task("outcome", "done");
    expect(contents([completed], [message(completed.id)]).done).toEqual(["task:outcome"]);
    expect(
      contents(
        [{ ...completed, status: "queued" }],
        [{ ...message(completed.id), acknowledged: true }],
      ).queued,
    ).toEqual(["task:outcome"]);
  });
  it("keeps worker questions with GLaDOS and unattached user questions visible", () => {
    expect(
      contents(
        [task("outcome", "active")],
        [
          { ...message("outcome"), sourcePeerId: "peer" },
          { ...message(null), id: "unattached" },
        ],
      ),
    ).toMatchObject({ working: ["task:outcome"], "needs-you": ["message:unattached"] });
  });
  it("does not call a stopped active task working and exposes the replacement worker", () => {
    const stopped = {
      ...task("recover", "active"),
      attempts: [
        {
          id: "attempt-1",
          threadId: ThreadId.make("worker-1"),
          generation: 1,
          state: "stopped" as const,
          model: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.6-sol" },
          createdAt: "2026-09-18",
          detail: "Worker stopped without evidence",
        },
      ],
    };
    expect(gladosTaskLane(stopped)).toBe("waiting");

    const replacement = {
      ...stopped,
      attempts: [
        ...stopped.attempts,
        {
          ...stopped.attempts[0]!,
          id: "attempt-2",
          threadId: ThreadId.make("worker-2"),
          generation: 2,
          state: "running" as const,
          detail: "Worker launched",
        },
      ],
    };
    expect(gladosTaskLane(replacement)).toBe("working");
    expect(managedWorkerRows(replacement)).toEqual([
      expect.objectContaining({ threadId: "worker-2", state: "running", current: true }),
      expect.objectContaining({ threadId: "worker-1", state: "stopped", current: false }),
    ]);
  });
  it("filters outcomes without leaking attached messages into another project", () => {
    const state = {
      tasks: [
        task("one", "active"),
        { ...task("two", "active"), projectId: ProjectId.make("other") },
      ],
      messages: [message("one")],
    };
    const cards = buildGladosBoard(state, { projectId: "other", query: " TWO " }).flatMap(
      (lane) => lane.items,
    );
    expect(cards.map((card) => card.key)).toEqual(["task:two"]);
  });
  it("orders each lane by priority then recent activity", () => {
    expect(
      contents([
        task("old", "queued"),
        { ...task("new", "queued"), updatedAt: "2026-09-19" },
        { ...task("urgent", "queued"), priority: 1 },
      ]).queued,
    ).toEqual(["task:urgent", "task:new", "task:old"]);
  });
  it("moves a task whose live worker waits for a permission answer into the user lane", () => {
    const blocked = task("blocked", "active");
    expect(contents([blocked]).working).toEqual(["task:blocked"]);
    const waiting = contents([blocked], [], ["attempt-blocked"]);
    expect(waiting["needs-you"]).toEqual(["task:blocked"]);
    expect(waiting.working).toEqual([]);
    expect(gladosTaskLane(blocked, false, true)).toBe("needs-you");
  });
  it("labels the current worker row with what the user owes it", () => {
    const blocked = task("blocked", "active");
    const [current] = managedWorkerRows(blocked, ["attempt-blocked"]);
    expect(current?.awaitingApproval).toBe(true);
    expect(managedWorkerStateLabel(current!)).toBe("waiting for your approval");
    expect(managedWorkerStateLabel(managedWorkerRows(blocked)[0]!)).toBe("running");
  });
  it("adapts columns to folded and unfolded modal widths", () => {
    expect(gladosBoardColumnWidth(280)).toBe(240);
    expect(gladosBoardColumnWidth(320)).toBe(280);
    expect(gladosBoardColumnWidth(800)).toBe(300);
  });
});
