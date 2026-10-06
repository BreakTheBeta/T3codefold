import { describe, expect, it } from "vite-plus/test";
import { deriveTabletopChatLayout } from "./tabletop-chat-layout";

const viewport = {
  hingeTop: 600,
  hingeHeight: 12,
  viewportTop: 100,
  viewportHeight: 1100,
  keyboardHeight: 0,
  controlsHeight: 140,
};

describe("tabletop chat layout", () => {
  it("keeps the transcript above the fold and controls beyond its occluded gap", () => {
    const layout = deriveTabletopChatLayout(viewport);
    expect(viewport.viewportTop + layout!.feedHeight).toBe(viewport.hingeTop);
    expect(viewport.viewportTop + layout!.controlsTop).toBe(
      viewport.hingeTop + viewport.hingeHeight,
    );
  });

  it("absorbs the keyboard entirely in the lower region when controls still fit", () => {
    expect(deriveTabletopChatLayout({ ...viewport, keyboardHeight: 350 })).toEqual(
      deriveTabletopChatLayout(viewport),
    );
  });

  it("uses the regular keyboard layout if the lower region cannot fit the input", () => {
    expect(deriveTabletopChatLayout({ ...viewport, keyboardHeight: 500 })).toBeNull();
  });

  it.each([{ hingeTop: null }, { viewportTop: 550 }, { viewportHeight: 500 }])(
    "ignores folds outside the usable viewport: %j",
    (change) => {
      expect(deriveTabletopChatLayout({ ...viewport, ...change })).toBeNull();
    },
  );
});
