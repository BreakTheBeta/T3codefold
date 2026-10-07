import { describe, expect, it } from "vite-plus/test";

import {
  deriveCenteredContentHorizontalPadding,
  deriveLayout,
  deriveThreadFeedInitialContentInset,
  deriveThreadWorkLogSizing,
  deriveWorkspacePaneLayout,
  SPLIT_LAYOUT_MIN_HEIGHT,
  SPLIT_LAYOUT_MIN_WIDTH,
} from "./layout";

describe("thread work-log text sizing", () => {
  it.each([11, 16, 22])(
    "keeps exact compact rows at base size %i without OS enlargement",
    (baseFontSize) => {
      expect(deriveThreadWorkLogSizing({ baseFontSize, fontScale: 1 })).toMatchObject({
        estimatedRowHeight: 28,
        fixedRowHeight: 28,
      });
    },
  );

  it.each([
    { baseFontSize: 16, fontScale: 1.25, estimatedRowHeight: 28 },
    { baseFontSize: 16, fontScale: 2, estimatedRowHeight: 38 },
    { baseFontSize: 22, fontScale: 2, estimatedRowHeight: 52 },
  ])(
    "measures accessibility text instead of locking it to the estimate: %j",
    ({ estimatedRowHeight, ...settings }) => {
      expect(deriveThreadWorkLogSizing(settings)).toMatchObject({
        estimatedRowHeight,
        fixedRowHeight: undefined,
      });
    },
  );

  it("invalidates native text measurements even when the minimum row height is unchanged", () => {
    const original = deriveThreadWorkLogSizing({ baseFontSize: 16, fontScale: 1 });
    for (const settings of [
      { baseFontSize: 16, fontScale: 1.1 },
      { baseFontSize: 17, fontScale: 1 },
    ]) {
      const resized = deriveThreadWorkLogSizing(settings);
      expect(resized.estimatedRowHeight).toBe(original.estimatedRowHeight);
      expect(resized.textSizeKey).not.toBe(original.textSizeKey);
    }
  });
});

describe("deriveThreadFeedInitialContentInset", () => {
  it("seeds Android scroll math with the composer overlay estimate", () => {
    expect(
      deriveThreadFeedInitialContentInset({
        platform: "android",
        usesNativeAutomaticInsets: false,
        bottomContentInset: 174,
      }),
    ).toEqual({ bottom: 174 });
  });

  it("does not double native iOS insets", () => {
    expect(
      deriveThreadFeedInitialContentInset({
        platform: "ios",
        usesNativeAutomaticInsets: true,
        bottomContentInset: 174,
      }),
    ).toBeUndefined();
  });
});

describe("deriveCenteredContentHorizontalPadding", () => {
  it("keeps the minimum padding while the viewport fits the reading width", () => {
    expect(
      deriveCenteredContentHorizontalPadding({
        viewportWidth: 744,
        maxContentWidth: 960,
        minimumPadding: 20,
      }),
    ).toBe(20);
  });

  it("centers only the content inside a wider full-width scroll host", () => {
    expect(
      deriveCenteredContentHorizontalPadding({
        viewportWidth: 1_032,
        maxContentWidth: 960,
        minimumPadding: 20,
      }),
    ).toBe(56);
  });

  it("supports unconstrained compact content", () => {
    expect(
      deriveCenteredContentHorizontalPadding({
        viewportWidth: 430,
        maxContentWidth: null,
        minimumPadding: 16,
      }),
    ).toBe(16);
  });
});

describe("deriveLayout", () => {
  it.each([
    { posture: "folded portrait", width: 384, height: 832, expected: "compact" },
    { posture: "unfolded portrait", width: 768, height: 900, expected: "split" },
    { posture: "unfolded landscape", width: 900, height: 768, expected: "split" },
    { posture: "half-width multi-window", width: 600, height: 900, expected: "compact" },
    { posture: "short landscape or tabletop", width: 900, height: 450, expected: "compact" },
  ])(
    "uses the $expected workspace for a Fold-class $posture window",
    ({ width, height, expected }) => {
      expect(deriveLayout({ width, height }).variant).toBe(expected);
    },
  );

  it.each([
    { name: "small iPhone portrait", width: 375, height: 667 },
    { name: "large iPhone portrait", width: 430, height: 932 },
    { name: "small iPhone landscape", width: 667, height: 375 },
    { name: "large iPhone landscape", width: 932, height: 430 },
    { name: "short wide window", width: 1_024, height: 599 },
    { name: "narrow tall window", width: 719, height: 1_024 },
  ])("keeps a $name in the compact shell", ({ width, height }) => {
    expect(deriveLayout({ width, height })).toEqual({
      variant: "compact",
      usesSplitView: false,
      listPaneWidth: null,
      shellPadding: 0,
    });
  });

  it.each([
    { name: "small tablet portrait", width: 744, height: 1_133 },
    { name: "tablet landscape", width: 1_024, height: 768 },
    { name: "large resizable window", width: 1_366, height: 1_024 },
    { name: "foldable-sized window", width: 800, height: 700 },
  ])("uses the split shell for a $name", ({ width, height }) => {
    expect(deriveLayout({ width, height })).toMatchObject({
      variant: "split",
      usesSplitView: true,
    });
  });

  it("switches only after both space requirements are met", () => {
    expect(
      deriveLayout({ width: SPLIT_LAYOUT_MIN_WIDTH, height: SPLIT_LAYOUT_MIN_HEIGHT }).variant,
    ).toBe("split");
    expect(
      deriveLayout({ width: SPLIT_LAYOUT_MIN_WIDTH - 1, height: SPLIT_LAYOUT_MIN_HEIGHT }).variant,
    ).toBe("compact");
    expect(
      deriveLayout({ width: SPLIT_LAYOUT_MIN_WIDTH, height: SPLIT_LAYOUT_MIN_HEIGHT - 1 }).variant,
    ).toBe("compact");
  });

  it("keeps the sidebar within usable native-column bounds", () => {
    expect(deriveLayout({ width: 720, height: 1_000 }).listPaneWidth).toBe(280);
    expect(deriveLayout({ width: 1_024, height: 768 }).listPaneWidth).toBe(328);
    expect(deriveLayout({ width: 1_600, height: 1_000 }).listPaneWidth).toBe(380);
  });
});

describe("deriveWorkspacePaneLayout", () => {
  // Galaxy Z Fold-class inner display, landscape.
  const foldLayout = deriveLayout({ width: 900, height: 700 });
  const tabletLayout = deriveLayout({ width: 1_366, height: 1_024 });
  const base = {
    primarySidebarPreferredVisible: true,
    auxiliaryPanePreferredVisible: true,
    auxiliaryPaneRegistered: true,
  } as const;

  it("shows sidebar, chat and inspector together when the chat stays readable", () => {
    expect(
      deriveWorkspacePaneLayout({ ...base, layout: tabletLayout, viewportWidth: 1_366 }),
    ).toMatchObject({
      primarySidebarVisible: true,
      primarySidebarSuppressedByAuxiliary: false,
      auxiliaryPaneVisible: true,
      auxiliaryPaneWidth: 276,
      contentPaneWidth: 1_366 - 380 - 276,
    });
  });

  it("lets the sidebar yield when the inspector would squeeze the chat", () => {
    expect(
      deriveWorkspacePaneLayout({ ...base, layout: foldLayout, viewportWidth: 900 }),
    ).toMatchObject({
      primarySidebarVisible: false,
      primarySidebarSuppressedByAuxiliary: true,
      auxiliaryPaneWidth: 260,
      contentPaneWidth: 900 - 260,
    });
  });

  it("takes no space until a route registers inspector content", () => {
    expect(
      deriveWorkspacePaneLayout({
        ...base,
        layout: foldLayout,
        viewportWidth: 900,
        auxiliaryPaneRegistered: false,
      }),
    ).toMatchObject({
      primarySidebarVisible: true,
      auxiliaryPaneVisible: false,
      contentPaneWidth: 900 - (foldLayout.listPaneWidth ?? 0),
    });
  });

  it("gives a maximized inspector the whole workspace and remembers the sidebar", () => {
    expect(
      deriveWorkspacePaneLayout({
        ...base,
        layout: tabletLayout,
        viewportWidth: 1_366,
        auxiliaryPaneMaximized: true,
      }),
    ).toMatchObject({
      primarySidebarVisible: false,
      primarySidebarSuppressedByAuxiliary: true,
      auxiliaryPaneMaximized: true,
      auxiliaryPaneWidth: 1_366,
      contentPaneWidth: 0,
    });
  });

  it("ignores maximize while the inspector is hidden", () => {
    expect(
      deriveWorkspacePaneLayout({
        ...base,
        layout: tabletLayout,
        viewportWidth: 1_366,
        auxiliaryPanePreferredVisible: false,
        auxiliaryPaneMaximized: true,
      }),
    ).toMatchObject({ auxiliaryPaneMaximized: false, primarySidebarVisible: true });
  });

  it("lets either side of the divider become a compact sliver", () => {
    const wide = deriveWorkspacePaneLayout({
      ...base,
      layout: foldLayout,
      viewportWidth: 900,
      auxiliaryPanePreferredWidth: 2_000,
    });
    expect(wide).toMatchObject({ auxiliaryPaneWidth: 828, contentPaneWidth: 72 });
    expect(wide.auxiliaryPaneWidthRange).toEqual({ min: 72, max: 828 });
    expect(
      deriveWorkspacePaneLayout({
        ...base,
        layout: foldLayout,
        viewportWidth: 900,
        auxiliaryPanePreferredWidth: 0,
      }).auxiliaryPaneWidth,
    ).toBe(72);
  });

  it("never exposes workspace panes in compact layouts", () => {
    expect(
      deriveWorkspacePaneLayout({
        ...base,
        layout: deriveLayout({ width: 390, height: 844 }),
        viewportWidth: 390,
      }),
    ).toMatchObject({
      primarySidebarVisible: false,
      supportsAuxiliaryPane: false,
      auxiliaryPaneVisible: false,
      contentPaneWidth: 390,
    });
  });
});

describe("Android adaptive windows", () => {
  it("supports a wide short Android window without changing iPhone landscape", () => {
    expect(deriveLayout({ width: 840, height: 360, platform: "android" }).usesSplitView).toBe(true);
    expect(deriveLayout({ width: 840, height: 360, platform: "ios" }).usesSplitView).toBe(false);
    expect(deriveLayout({ width: 600, height: 900, platform: "android" }).usesSplitView).toBe(
      false,
    );
    expect(deriveLayout({ width: 840, height: 280, platform: "android" }).usesSplitView).toBe(
      false,
    );
  });
});
