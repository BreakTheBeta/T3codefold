import { describe, expect, it } from "vite-plus/test";

import { resolveProjectIconGlyph } from "./projectIcon";

describe("resolveProjectIconGlyph", () => {
  it("draws a curated Lucide override as its glyph", () => {
    expect(
      resolveProjectIconGlyph({ kind: "lucide", name: "rocket", color: "violet" }, "Launchpad"),
    ).toEqual({ kind: "lucide", name: "rocket", color: "violet" });
  });

  it("falls back to the monogram for a Lucide name mobile does not bundle", () => {
    expect(
      resolveProjectIconGlyph({ kind: "lucide", name: "alarm-smoke", color: "blue" }, "Fold app"),
    ).toEqual({ kind: "monogram", text: "FA", color: "blue" });
  });
});
