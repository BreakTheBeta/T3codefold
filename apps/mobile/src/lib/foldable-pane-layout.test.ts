import { describe, expect, it } from "vite-plus/test";

import {
  constrainFoldablePaneWidth,
  deriveHingeSnapWidths,
  deriveWorkspaceFoldRegions,
  resolvePaneDividerRelease,
} from "./foldable-pane-layout";

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

describe("deriveHingeSnapWidths", () => {
  it("places the divider on a vertical fold", () => {
    expect(
      deriveHingeSnapWidths({
        hinges: [{ left: 420, right: 420, orientation: "vertical" }],
        windowWidth: 840,
        trailingInset: 0,
      }),
    ).toEqual([420]);
    expect(
      deriveHingeSnapWidths({
        hinges: [{ left: 400, right: 440, orientation: "vertical" }],
        windowWidth: 900,
        trailingInset: 24,
      }),
    ).toEqual([456]);
  });

  it("ignores horizontal (tabletop) folds", () => {
    expect(
      deriveHingeSnapWidths({
        hinges: [{ left: 0, right: 840, orientation: "horizontal" }],
        windowWidth: 840,
        trailingInset: 0,
      }),
    ).toEqual([]);
  });
});

describe("fold workspace regions", () => {
  const input = { width: 900, height: 1000, leadingInset: 20, trailingInset: 24 };
  it("excludes an occluded vertical hinge from both usable regions", () => {
    const regions = deriveWorkspaceFoldRegions({
      ...input,
      hinges: [
        {
          left: 400,
          right: 440,
          top: 0,
          bottom: 1000,
          orientation: "vertical",
          state: "flat",
          separating: true,
        },
      ],
    });
    expect(regions.vertical).toEqual({ leadingWidth: 380, gap: 40, trailingWidth: 436 });
    expect(regions.presetKey).toBe("separating:portrait:medium");
  });
  it("adopts horizontal half-open posture and restores flat layout", () => {
    const hinge = {
      left: 0,
      right: 900,
      top: 490,
      bottom: 510,
      orientation: "horizontal" as const,
      state: "halfOpened" as const,
      separating: true,
    };
    expect(deriveWorkspaceFoldRegions({ ...input, hinges: [hinge] }).tabletop).toEqual({
      top: 490,
      gap: 20,
    });
    expect(
      deriveWorkspaceFoldRegions({ ...input, hinges: [{ ...hinge, state: "flat" }] }).tabletop,
    ).toBeNull();
    expect(
      deriveWorkspaceFoldRegions({ ...input, hinges: [{ ...hinge, top: 80 }] }).tabletop,
    ).toBeNull();
  });
  it("keeps the pane preset as a window resizes within its posture class", () => {
    expect(deriveWorkspaceFoldRegions({ ...input, hinges: [] }).presetKey).toBe(
      deriveWorkspaceFoldRegions({ ...input, width: 800, hinges: [] }).presetKey,
    );
    expect(deriveWorkspaceFoldRegions({ ...input, width: 1400, hinges: [] }).presetKey).not.toBe(
      deriveWorkspaceFoldRegions({ ...input, hinges: [] }).presetKey,
    );
  });
});
