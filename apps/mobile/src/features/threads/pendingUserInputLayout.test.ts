import { describe, expect, it } from "vite-plus/test";

import {
  derivePendingUserInputFullScreenLayout,
  derivePendingUserInputMaxHeight,
} from "./pendingUserInputLayout";

describe("derivePendingUserInputMaxHeight", () => {
  it("caps a tall portrait viewport", () => {
    expect(
      derivePendingUserInputMaxHeight({
        windowHeight: 932,
        keyboardHeight: 0,
        navigationHeaderHeight: 103,
        composerOverlapHeight: 94,
      }),
    ).toBe(560);
  });

  it("subtracts the keyboard while editing a custom answer", () => {
    expect(
      derivePendingUserInputMaxHeight({
        windowHeight: 932,
        keyboardHeight: 336,
        navigationHeaderHeight: 103,
        composerOverlapHeight: 94,
      }),
    ).toBe(387);
  });

  it("keeps the fixed action area usable in a short keyboard-open viewport", () => {
    expect(
      derivePendingUserInputMaxHeight({
        windowHeight: 375,
        keyboardHeight: 240,
        navigationHeaderHeight: 44,
        composerOverlapHeight: 94,
      }),
    ).toBe(160);
  });
});

describe("derivePendingUserInputFullScreenLayout", () => {
  it("fills a folded phone width", () => {
    expect(derivePendingUserInputFullScreenLayout({ windowWidth: 393 })).toEqual({
      horizontalPadding: 16,
      contentMaxWidth: 361,
    });
  });

  it("caps the measure on an unfolded foldable", () => {
    expect(derivePendingUserInputFullScreenLayout({ windowWidth: 1024 })).toEqual({
      horizontalPadding: 32,
      contentMaxWidth: 720,
    });
  });

  it("spends medium widths on padding before line length", () => {
    expect(derivePendingUserInputFullScreenLayout({ windowWidth: 673 })).toEqual({
      horizontalPadding: 24,
      contentMaxWidth: 625,
    });
  });
});
