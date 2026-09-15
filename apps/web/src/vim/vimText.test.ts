import { describe, expect, it } from "vite-plus/test";
import { currentLineRange, currentWordRange, moveTextCursor, orderedRange } from "./vimText";

describe("Vim text motions", () => {
  const text = "one two\n  three four\n\nfive";

  it("moves by characters, words and document edges", () => {
    expect(moveTextCursor(text, 0, "l", 3)).toBe(3);
    expect(moveTextCursor(text, 0, "w")).toBe(4);
    expect(moveTextCursor(text, 8, "b")).toBe(4);
    expect(moveTextCursor(text, 0, "G")).toBe(text.length);
    expect(moveTextCursor(text, text.length, "gg")).toBe(0);
  });

  it("preserves columns for vertical motions and supports line motions", () => {
    expect(moveTextCursor(text, 2, "j")).toBe(10);
    expect(moveTextCursor(text, 10, "k")).toBe(2);
    expect(moveTextCursor(text, 12, "0")).toBe(8);
    expect(moveTextCursor(text, 12, "^")).toBe(10);
    expect(moveTextCursor(text, 12, "$")).toBe(20);
  });

  it("moves between paragraphs", () => {
    expect(moveTextCursor(text, 3, "}")).toBe(22);
    expect(moveTextCursor(text, text.length, "{")).toBe(22);
  });

  it("builds line, word and ordered ranges", () => {
    expect(currentLineRange(text, 2)).toEqual({ start: 0, end: 8 });
    expect(currentWordRange(text, 5, false)).toEqual({ start: 4, end: 7 });
    expect(currentWordRange(text, 5, true)).toEqual({ start: 3, end: 7 });
    expect(orderedRange(7, 2)).toEqual({ start: 2, end: 7 });
  });
});
