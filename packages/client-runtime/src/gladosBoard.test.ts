import { describe, expect, it } from "vite-plus/test";
import { ProjectId, type PitbossMessage, type PitbossTask } from "@t3tools/contracts";
import { buildGladosBoard, gladosBoardColumnWidth } from "./gladosBoard";

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
  attempts: [],
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
const contents = (tasks: PitbossTask[], messages: PitbossMessage[] = []) =>
  Object.fromEntries(
    buildGladosBoard({ tasks, messages }).map((lane) => [
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
  it("adapts columns to folded and unfolded modal widths", () => {
    expect(gladosBoardColumnWidth(280)).toBe(240);
    expect(gladosBoardColumnWidth(320)).toBe(280);
    expect(gladosBoardColumnWidth(800)).toBe(300);
  });
});
