import { describe, expect, it } from "vite-plus/test";
import { buildVimHintLabels } from "./TimelineVimMode";

describe("Vim hint labels", () => {
  it("uses one key for small target sets", () => {
    expect(buildVimHintLabels(4)).toEqual(["a", "s", "d", "f"]);
  });

  it("uses fixed-width prefixes when the page has many targets", () => {
    const labels = buildVimHintLabels(40);
    expect(labels).toHaveLength(40);
    expect(labels[0]).toBe("aa");
    expect(labels[25]).toBe("am");
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("expands labels when more than two-key combinations are needed", () => {
    const labels = buildVimHintLabels(700);
    expect(labels).toHaveLength(700);
    expect(labels[0]).toBe("aaa");
    expect(labels.at(-1)).toHaveLength(3);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
