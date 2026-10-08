import { describe, expect, it } from "vite-plus/test";
import { resolveRibbonPlacement } from "./useThreadRibbon";

const page = { pageHeight: 1000, columns: 3, pointer: -1 };

describe("resolveRibbonPlacement", () => {
  it("keeps a row inside one column live there", () => {
    expect(resolveRibbonPlacement({ ...page, top: 1200, height: 300 })).toEqual({
      first: 1,
      last: 1,
      live: 1,
    });
  });

  it("gives the live element to the largest piece of a straddling row", () => {
    expect(resolveRibbonPlacement({ ...page, top: 900, height: 300 })).toEqual({
      first: 0,
      last: 1,
      live: 1,
    });
    expect(resolveRibbonPlacement({ ...page, top: 700, height: 400 })).toEqual({
      first: 0,
      last: 1,
      live: 0,
    });
  });

  it("gives the live element to the piece under the pointer", () => {
    expect(resolveRibbonPlacement({ ...page, top: 900, height: 300, pointer: 950 })).toEqual({
      first: 0,
      last: 1,
      live: 0,
    });
    expect(resolveRibbonPlacement({ ...page, top: 900, height: 300, pointer: 1150 })).toEqual({
      first: 0,
      last: 1,
      live: 1,
    });
    // A pointer elsewhere does not pull the row to its column.
    expect(resolveRibbonPlacement({ ...page, top: 900, height: 300, pointer: 1500 })?.live).toBe(1);
  });

  it("clips rows entering from above and leaving past the last column", () => {
    expect(resolveRibbonPlacement({ ...page, top: -200, height: 500 })).toEqual({
      first: 0,
      last: 0,
      live: 0,
    });
    expect(resolveRibbonPlacement({ ...page, top: 2800, height: 500 })).toEqual({
      first: 2,
      last: 2,
      live: 2,
    });
  });

  it("spans every column a tall row covers", () => {
    expect(resolveRibbonPlacement({ ...page, top: 500, height: 2200 })).toEqual({
      first: 0,
      last: 2,
      live: 1,
    });
  });

  it("ignores rows outside the window and unplaced rows", () => {
    expect(resolveRibbonPlacement({ ...page, top: -500, height: 500 })).toBeNull();
    expect(resolveRibbonPlacement({ ...page, top: 3000, height: 100 })).toBeNull();
    expect(resolveRibbonPlacement({ ...page, top: Number.NaN, height: 100 })).toBeNull();
    expect(resolveRibbonPlacement({ ...page, top: 100, height: 0 })).toBeNull();
  });
});
