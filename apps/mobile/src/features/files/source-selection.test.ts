import { ComposerContextId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { sourceSelectionContext } from "./source-selection";

const contextId = ComposerContextId.make("selection-context");

describe("source selection context", () => {
  it("preserves tabs and whole selected lines with a navigable file reference", () => {
    const selection = sourceSelectionContext({
      contents: "first\r\n\tsecond\r\nthird",
      path: "src/test.ts",
      startIndex: 1,
      endIndex: 2,
      contextId,
    });
    expect(selection?.text).toContain("\n```\n\tsecond\nthird\n```\n");
    expect(selection?.context.records[0]).toMatchObject({
      path: "src/test.ts",
      label: "src/test.ts:2–3",
    });
  });
  it("handles reversed ranges and protects code containing fences", () => {
    const selection = sourceSelectionContext({
      contents: "```\ntext\n```",
      path: "README.md",
      startIndex: 2,
      endIndex: 0,
      contextId,
    });
    expect(selection?.text).toContain("\n````\n```\ntext\n```\n````\n");
  });
  it("rejects stale or fractional native ranges", () => {
    const base = { contents: "one", path: "test.ts", contextId };
    expect(sourceSelectionContext({ ...base, startIndex: 0, endIndex: 3 })).toBeNull();
    expect(sourceSelectionContext({ ...base, startIndex: -1, endIndex: 0 })).toBeNull();
    expect(sourceSelectionContext({ ...base, startIndex: 0, endIndex: 0.5 })).toBeNull();
  });
});
