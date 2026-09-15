import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { OrchestrationThread } from "@t3tools/contracts/legacy-orchestration";
import { OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import { legacyThreadProjection } from "./legacyProjection.ts";

const isProjection = Schema.is(OrchestrationV2ThreadProjection);
const decodeActivities = Schema.decodeUnknownSync(OrchestrationThread.fields.activities);

export const legacyThread = Schema.decodeUnknownSync(OrchestrationThread)({
  id: "thread-old",
  projectId: "project-old",
  title: "Older server",
  modelSelection: { instanceId: "codex", model: "gpt-5.4" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  latestTurn: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  deletedAt: null,
  messages: [
    {
      id: "message-old",
      role: "assistant",
      text: "Existing conversation",
      turnId: null,
      streaming: false,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  activities: [],
  checkpoints: [],
  session: null,
});

describe("legacy server chat compatibility", () => {
  it("loads an old server transcript into the native client projection", () => {
    const projection = legacyThreadProjection(legacyThread);
    expect(isProjection(projection)).toBe(true);
    expect(
      projection.visibleTurnItems.map(({ item }) => item.type === "assistant_message" && item.text),
    ).toEqual(["Existing conversation"]);
  });
});

it("keeps pending approvals and questions actionable in the native client", () => {
  const projection = legacyThreadProjection({
    ...legacyThread,
    activities: decodeActivities([
      {
        id: "approval",
        tone: "approval",
        kind: "approval.requested",
        summary: "Allow command?",
        turnId: null,
        createdAt: legacyThread.createdAt,
        payload: { requestId: "approve-1", requestKind: "command", detail: "Run a build" },
      },
      {
        id: "question",
        tone: "approval",
        kind: "user-input.requested",
        summary: "Choose",
        turnId: null,
        createdAt: legacyThread.createdAt,
        payload: {
          requestId: "question-1",
          questions: [
            {
              id: "q",
              header: "Choice",
              question: "Which?",
              options: [{ label: "A", description: "First" }],
            },
          ],
        },
      },
    ]),
  });
  expect(projection.runtimeRequests.map((request) => request.id)).toEqual([
    "approve-1",
    "question-1",
  ]);
  expect(projection.turnItems.map((item) => item.type)).toContain("user_input_request");
  expect(isProjection(projection)).toBe(true);
});
