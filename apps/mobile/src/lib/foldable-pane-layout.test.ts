import { describe, expect, it } from "vite-plus/test";

import { constrainFoldablePaneWidth, resolvePaneDividerRelease } from "./foldable-pane-layout";

describe("constrainFoldablePaneWidth", () => {
  it("lets either pane become compact in an unfolded workspace", () => {
    expect(constrainFoldablePaneWidth({ preferredWidth: 0, availableWidth: 800 })).toBe(72);
    expect(constrainFoldablePaneWidth({ preferredWidth: 800, availableWidth: 800 })).toBe(728);
  });
});

describe("resolvePaneDividerRelease", () => {
  const range = { min: 72, max: 728 };

  it("rests the pane where the divider was released, within its range", () => {
    expect(resolvePaneDividerRelease({ startWidth: 300, translationX: -100, range })).toEqual({
      kind: "resize",
      width: 400,
    });
    expect(resolvePaneDividerRelease({ startWidth: 300, translationX: 260, range })).toEqual({
      kind: "resize",
      width: 72,
    });
  });

  it("maximizes or closes only when dragged clearly past either end", () => {
    expect(resolvePaneDividerRelease({ startWidth: 700, translationX: -60, range })).toEqual({
      kind: "resize",
      width: 728,
    });
    expect(resolvePaneDividerRelease({ startWidth: 700, translationX: -120, range })).toEqual({
      kind: "maximize",
    });
    expect(resolvePaneDividerRelease({ startWidth: 300, translationX: 300, range })).toEqual({
      kind: "close",
    });
  });

  it("restores a maximized pane when dragged back into range", () => {
    expect(resolvePaneDividerRelease({ startWidth: 800, translationX: 400, range })).toEqual({
      kind: "resize",
      width: 400,
    });
    expect(resolvePaneDividerRelease({ startWidth: 800, translationX: 10, range })).toEqual({
      kind: "maximize",
    });
  });

  it("snaps to a nearby snap width such as the hinge", () => {
    expect(
      resolvePaneDividerRelease({ startWidth: 300, translationX: -110, range, snapWidths: [400] }),
    ).toEqual({ kind: "resize", width: 400 });
    expect(
      resolvePaneDividerRelease({ startWidth: 300, translationX: -10, range, snapWidths: [400] }),
    ).toEqual({ kind: "resize", width: 310 });
  });
});
