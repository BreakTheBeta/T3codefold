import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("react-native-nitro-markdown/headless", () => ({
  parseMarkdownWithOptions: (markdown: string) => ({
    type: "document",
    children: markdown.startsWith("![")
      ? [{ type: "paragraph", children: [{ type: "image", url: "image.png" }] }]
      : markdown.startsWith("[shot]")
        ? [
            {
              type: "paragraph",
              children: [
                {
                  type: "link",
                  // md4c reads `\.` in the authored path as an escape.
                  href: "C:\\me.t3\\shot.png",
                  children: [{ type: "text", content: "shot" }],
                },
              ],
            },
          ]
        : [
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
                    {
                      type: "table_cell",
                      isHeader: true,
                      children: [{ type: "text", content: "Name" }],
                    },
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

import { androidSelectableMarkdownContent } from "./androidSelectableMarkdown";

describe("androidSelectableMarkdownContent", () => {
  it("keeps paragraphs, list items, and table cells in one selectable surface", () => {
    const content = androidSelectableMarkdownContent(
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

    expect(content.hasImage).toBe(false);
    expect(content.runs.map((run) => run.text).join("")).toContain(
      "First paragraph.\n\nSecond paragraph.\n\n•\tfirst item\n•\tsecond item\n\nName\u00a0│\u00a0Value\nAlpha\u00a0│\u00a0One",
    );
  });

  it("keeps authored Windows link destinations like the rich renderer", () => {
    const content = androidSelectableMarkdownContent("[shot](C:\\me\\.t3\\shot.png)");

    expect(content.runs.map((run) => run.href)).toEqual([
      "C:\\me\\.t3\\shot.png",
      "C:\\me\\.t3\\shot.png",
    ]);
  });

  it("defers documents with images to the upstream rich renderer", () => {
    expect(androidSelectableMarkdownContent("![Preview](image.png)").hasImage).toBe(true);
  });
});
