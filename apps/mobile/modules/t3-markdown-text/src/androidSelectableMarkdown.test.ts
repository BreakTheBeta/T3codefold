import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("react-native-nitro-markdown/headless", () => ({
  parseMarkdownWithOptions: () => ({
    type: "document",
    children: [
      { type: "paragraph", children: [{ type: "text", content: "First paragraph." }] },
      { type: "paragraph", children: [{ type: "text", content: "Second paragraph." }] },
      {
        type: "list",
        children: [
          { type: "list_item", children: [{ type: "text", content: "first item" }] },
          { type: "list_item", children: [{ type: "text", content: "second item" }] },
        ],
      },
      {
        type: "table",
        children: [
          {
            type: "table_row",
            children: [
              { type: "table_cell", isHeader: true, children: [{ type: "text", content: "Name" }] },
              {
                type: "table_cell",
                isHeader: true,
                children: [{ type: "text", content: "Value" }],
              },
            ],
          },
          {
            type: "table_row",
            children: [
              { type: "table_cell", children: [{ type: "text", content: "Alpha" }] },
              { type: "table_cell", children: [{ type: "text", content: "One" }] },
            ],
          },
        ],
      },
    ],
  }),
}));

import { androidSelectableMarkdownRuns } from "./androidSelectableMarkdown";

describe("androidSelectableMarkdownRuns", () => {
  it("keeps paragraphs, list items, and table cells in one selectable surface", () => {
    const runs = androidSelectableMarkdownRuns(
      [
        "First paragraph.",
        "",
        "Second paragraph.",
        "",
        "- first item",
        "- second item",
        "",
        "| Name | Value |",
        "| --- | --- |",
        "| Alpha | One |",
      ].join("\n"),
    );

    expect(runs.map((run) => run.text).join("")).toContain(
      "First paragraph.\n\nSecond paragraph.\n\n•\tfirst item\n•\tsecond item\n\nName\u00a0│\u00a0Value\nAlpha\u00a0│\u00a0One",
    );
  });
});
