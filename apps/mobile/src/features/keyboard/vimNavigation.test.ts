import { describe, expect, it } from "vite-plus/test";

import {
  INITIAL_VIM_STATE,
  moveVimCursor,
  reduceVimKey,
  type VimKey,
  type VimState,
} from "./vimNavigation";

const ALL_PANES = { regions: ["sidebar", "chat", "inspector"] } as const;

function press(keys: ReadonlyArray<string | VimKey>, start: VimState = INITIAL_VIM_STATE) {
  let state = start;
  const effects = [];
  for (const key of keys) {
    const result = reduceVimKey(state, typeof key === "string" ? { key } : key, ALL_PANES);
    state = result.state;
    effects.push(...result.effects);
  }
  return { state, effects };
}

const sidebar: VimState = { ...INITIAL_VIM_STATE, region: "sidebar" };

describe("reduceVimKey", () => {
  it("moves between panes with Ctrl-w and Ctrl-h/l", () => {
    expect(press([{ key: "w", ctrl: true }, "h"]).state.region).toBe("sidebar");
    expect(press([{ key: "l", ctrl: true }]).state.region).toBe("inspector");
    expect(press([{ key: "w", ctrl: true }, "w"], sidebar).state.region).toBe("chat");
    // No pane beyond the edge: focus stays put.
    expect(press([{ key: "h", ctrl: true }], sidebar).state.region).toBe("sidebar");
  });

  it("moves the thread cursor in the sidebar and scrolls in the chat", () => {
    expect(press(["j"], sidebar).effects).toEqual([{ type: "moveCursor", delta: 1 }]);
    expect(press(["k"]).effects).toEqual([{ type: "scroll", unit: "line", delta: -1 }]);
    expect(press([{ key: "d", ctrl: true }]).effects).toEqual([
      { type: "scroll", unit: "halfPage", delta: 1 },
    ]);
  });

  it("applies counts and gg/G", () => {
    expect(press(["1", "2", "j"], sidebar).effects).toEqual([{ type: "moveCursor", delta: 12 }]);
    expect(press(["g", "g"], sidebar).effects).toEqual([{ type: "cursorToEdge", edge: "first" }]);
    expect(press(["G"]).effects).toEqual([{ type: "scrollToEdge", edge: "bottom" }]);
    // 0 alone is not a count.
    expect(press(["0", "j"], sidebar).effects).toEqual([{ type: "moveCursor", delta: 1 }]);
  });

  it("opens the cursor thread and lands in the chat", () => {
    const result = press(["Enter"], sidebar);
    expect(result.effects).toEqual([{ type: "openCursor" }]);
    expect(result.state.region).toBe("chat");
  });

  it("jumps to the composer, search and command palette", () => {
    expect(press(["i"], sidebar)).toMatchObject({
      state: { region: "chat" },
      effects: [{ type: "focusComposer" }],
    });
    expect(press(["/"]).effects).toEqual([{ type: "focusSearch" }]);
    expect(press([" "]).effects).toEqual([{ type: "commandPalette" }]);
    expect(press([{ key: "w", ctrl: true }, "o"]).effects).toEqual([{ type: "toggleMaximize" }]);
  });

  it("Escape cancels a pending count or prefix", () => {
    expect(press(["3", "Escape", "j"], sidebar).effects).toEqual([
      { type: "moveCursor", delta: 1 },
    ]);
    expect(press(["g", "Escape", "g"], sidebar).effects).toEqual([]);
  });

  it("falls back to the chat when the focused pane closes", () => {
    const inspector: VimState = { ...INITIAL_VIM_STATE, region: "inspector" };
    expect(reduceVimKey(inspector, { key: "j" }, { regions: ["sidebar", "chat"] })).toMatchObject({
      state: { region: "chat" },
      effects: [{ type: "scroll", unit: "line", delta: 1 }],
    });
  });
});

describe("moveVimCursor", () => {
  const same = (a: number, b: number) => a === b;

  it("clamps to the list and starts from the edge nearest the direction", () => {
    expect(moveVimCursor([1, 2, 3], 2, 1, same)).toBe(3);
    expect(moveVimCursor([1, 2, 3], 3, 5, same)).toBe(3);
    expect(moveVimCursor([1, 2, 3], null, 1, same)).toBe(1);
    expect(moveVimCursor([1, 2, 3], null, -1, same)).toBe(3);
    expect(moveVimCursor([], null, 1, same)).toBeNull();
  });
});
