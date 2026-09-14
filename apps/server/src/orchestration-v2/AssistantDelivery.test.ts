import { describe, expect, it } from "vite-plus/test";
import { DateTime } from "effect";
import { MessageId, ThreadId, RunId, NodeId, ProviderDriverKind } from "@t3tools/contracts";
import type { ProviderAdapterV2Event } from "./ProviderAdapter.ts";
import { makeAssistantDelivery, splitBufferedAssistantText } from "./AssistantDelivery.ts";
const now = DateTime.makeUnsafe("2026-09-14T00:00:00Z");
function update(
  text: string,
  streaming = true,
): Extract<ProviderAdapterV2Event, { type: "message.updated" }> {
  return {
    type: "message.updated",
    driver: ProviderDriverKind.make("codex"),
    message: {
      id: MessageId.make("message"),
      threadId: ThreadId.make("thread"),
      runId: RunId.make("run"),
      nodeId: NodeId.make("node"),
      createdBy: "agent",
      creationSource: "provider",
      role: "assistant",
      text,
      attachments: [],
      streaming,
      createdAt: now,
      updatedAt: now,
    },
  };
}
describe("assistant delivery", () => {
  it("paces completed paragraphs without leaking unfinished text and flushes completion", () => {
    const deliver = makeAssistantDelivery("paragraph");
    expect(deliver(update("Hello"), 0)).toBeNull();
    expect(deliver(update("Hello\n\nPart"), 10)).toMatchObject({ message: { text: "Hello\n\n" } });
    expect(deliver(update("Hello\n\nPart two\n\nTail"), 100)).toBeNull();
    expect(deliver(update("Hello\n\nPart two\n\nTail"), 410)).toMatchObject({
      message: { text: "Hello\n\nPart two\n\n" },
    });
    const final = update("Hello\n\nPart two\n\nTail", false);
    expect(deliver(final, 420)).toBe(final);
  });
  it("holds open code fences and delivers closed blocks", () => {
    expect(splitBufferedAssistantText("Intro\n\n```ts\nconst x = 1;\n\n")).toEqual({
      ready: "Intro\n\n",
      rest: "```ts\nconst x = 1;\n\n",
    });
    expect(splitBufferedAssistantText("~~~\na\n~~~\nTail")).toEqual({
      ready: "~~~\na\n~~~\n",
      rest: "Tail",
    });
  });
  it("keeps turn and token modes and bounds text with no paragraph boundary", () => {
    const event = update("word");
    expect(makeAssistantDelivery("turn")(event, 0)).toBeNull();
    expect(makeAssistantDelivery("token")(event, 0)).toBe(event);
    const final = update("word", false);
    expect(makeAssistantDelivery("turn")(final, 0)).toBe(final);
    expect(makeAssistantDelivery("paragraph")(update("x".repeat(32_001)), 0)).toMatchObject({
      message: { text: "x".repeat(32_001) },
    });
  });
});
