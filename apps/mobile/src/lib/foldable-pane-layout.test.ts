import { describe, expect, it } from "vite-plus/test";

import { constrainFoldablePaneWidth } from "./foldable-pane-layout";

describe("constrainFoldablePaneWidth", () => {
  it("lets either pane become compact in an unfolded workspace", () => {
    expect(constrainFoldablePaneWidth({ preferredWidth: 0, availableWidth: 800 })).toBe(72);
    expect(constrainFoldablePaneWidth({ preferredWidth: 800, availableWidth: 800 })).toBe(728);
  });
});
