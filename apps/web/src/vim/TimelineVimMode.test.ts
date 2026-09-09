import { describe, expect, it } from "vite-plus/test";
import { buildVimHintLabels, nextVimListIndex } from "./TimelineVimMode";

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

describe("Vim list navigation", () => {
  it("enters from either edge, applies counts, and stops at list boundaries", () => {
    expect(nextVimListIndex(5, -1, 1, 1)).toBe(0);
    expect(nextVimListIndex(5, -1, -1, 1)).toBe(4);
    expect(nextVimListIndex(5, 1, 1, 2)).toBe(3);
    expect(nextVimListIndex(5, 1, -1, 20)).toBe(0);
    expect(nextVimListIndex(0, -1, 1, 1)).toBe(-1);
  });
});
