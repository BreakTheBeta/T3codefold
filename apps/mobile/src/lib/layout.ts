import { scaledTypographyLineHeight } from "./appearancePreferences";
import { MOBILE_TYPOGRAPHY } from "./typography";
import { constrainFoldablePaneWidth, FOLDABLE_PANE_COMPACT_WIDTH } from "./foldable-pane-layout";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Use available space, not device or orientation labels, to choose the shell.
 *
 * The height floor deliberately keeps every current iPhone in the compact shell
 * when it rotates to landscape, while still allowing iPad and foldable-sized
 * windows to adopt the persistent sidebar as they resize. Android also accepts
 * wide, short windows down to 320dp so landscape and multi-window keep usable panes.
 */
export const SPLIT_LAYOUT_MIN_WIDTH = 720;
export const SPLIT_LAYOUT_MIN_HEIGHT = 600;

export const SPLIT_SIDEBAR_MIN_WIDTH = 280;
const SPLIT_SIDEBAR_DEFAULT_MAX_WIDTH = 380;

export const CHAT_CONTENT_MAX_WIDTH = 960;
// min-h-8 uses the 14px rem configured in metro.config.js.
export const THREAD_WORK_ROW_MIN_HEIGHT = 28;

export function deriveThreadWorkLogSizing(input: {
  readonly baseFontSize: number;
  readonly fontScale: number;
}) {
  const lineHeight = scaledTypographyLineHeight(MOBILE_TYPOGRAPHY.footnote, input.baseFontSize);
  return {
    // Different text metrics can share the same minimum row height.
    textSizeKey: `${input.baseFontSize}:${input.fontScale}`,
    estimatedRowHeight: Math.max(
      THREAD_WORK_ROW_MIN_HEIGHT,
      Math.ceil(lineHeight * input.fontScale),
    ),
    // Native text can exceed its authored line height with accessibility scaling.
    // Leave those rows measured instead of promising LegendList an exact size.
    fixedRowHeight:
      input.fontScale <= 1 && lineHeight <= THREAD_WORK_ROW_MIN_HEIGHT
        ? THREAD_WORK_ROW_MIN_HEIGHT
        : undefined,
  };
}

const INSPECTOR_DEFAULT_MIN_WIDTH = 260;
const INSPECTOR_DEFAULT_MAX_WIDTH = 320;
/** Below this, the chat beside an open inspector yields the thread sidebar's space. */
const CHAT_MIN_WIDTH_BESIDE_SIDEBAR = 560;

export type LayoutVariant = "compact" | "split";

export interface Layout {
  readonly variant: LayoutVariant;
  readonly usesSplitView: boolean;
  readonly listPaneWidth: number | null;
  readonly shellPadding: number;
}

export interface WorkspacePaneLayout {
  readonly primarySidebarVisible: boolean;
  /** The sidebar is preferred but yields to the inspector; showing it closes the inspector. */
  readonly primarySidebarSuppressedByAuxiliary: boolean;
  /** Width of the chat column, between the sidebar and the inspector. */
  readonly contentPaneWidth: number;
  readonly supportsAuxiliaryPane: boolean;
  readonly auxiliaryPaneVisible: boolean;
  readonly auxiliaryPaneMaximized: boolean;
  /** Rendered inspector width: the whole workspace when maximized. */
  readonly auxiliaryPaneWidth: number | null;
  /** Resting widths the divider may drag the inspector between. */
  readonly auxiliaryPaneWidthRange: { readonly min: number; readonly max: number } | null;
}

export interface FileInspectorPaneLayout {
  readonly supported: boolean;
  readonly width: number | null;
}

export function deriveThreadFeedInitialContentInset(input: {
  readonly platform: string;
  readonly usesNativeAutomaticInsets: boolean;
  readonly bottomContentInset: number;
}): { readonly bottom: number } | undefined {
  if (input.platform !== "android" || input.usesNativeAutomaticInsets) {
    return undefined;
  }

  return { bottom: Math.max(0, input.bottomContentInset) };
}

export function deriveLayout(input: {
  readonly width: number;
  readonly height: number;
  readonly platform?: string;
}): Layout {
  const { width, height } = input;
  const wideEnoughForSplit =
    width >= SPLIT_LAYOUT_MIN_WIDTH &&
    height >= (input.platform === "android" ? 320 : SPLIT_LAYOUT_MIN_HEIGHT);

  if (!wideEnoughForSplit) {
    return {
      variant: "compact",
      usesSplitView: false,
      listPaneWidth: null,
      shellPadding: 0,
    };
  }

  return {
    variant: "split",
    usesSplitView: true,
    listPaneWidth: clamp(
      Math.round(width * 0.32),
      SPLIT_SIDEBAR_MIN_WIDTH,
      SPLIT_SIDEBAR_DEFAULT_MAX_WIDTH,
    ),
    shellPadding: 0,
  };
}

/**
 * Splits a split-view workspace into thread sidebar, chat, and the trailing
 * inspector (files, git, terminal, review). The inspector only takes space
 * while a route has registered content for it. When it would squeeze the chat
 * below a readable width, the sidebar yields; maximizing gives it everything.
 */
export function deriveWorkspacePaneLayout(input: {
  readonly layout: Layout;
  readonly viewportWidth: number;
  readonly primarySidebarPreferredVisible: boolean;
  readonly auxiliaryPanePreferredVisible: boolean;
  /** Whether the focused route has inspector content to show. */
  readonly auxiliaryPaneRegistered?: boolean;
  readonly auxiliaryPaneMaximized?: boolean;
  readonly auxiliaryPanePreferredWidth?: number;
}): WorkspacePaneLayout {
  const viewportWidth = Math.max(0, input.viewportWidth);
  const supportsAuxiliaryPane = input.layout.usesSplitView;
  const auxiliaryPaneVisible =
    supportsAuxiliaryPane &&
    input.auxiliaryPanePreferredVisible &&
    (input.auxiliaryPaneRegistered ?? true);
  const sidebarPreferred = input.layout.usesSplitView && input.primarySidebarPreferredVisible;
  const listPaneWidth = input.layout.listPaneWidth ?? 0;
  const restingInspectorWidth = (availableWidth: number) =>
    constrainFoldablePaneWidth({
      preferredWidth:
        input.auxiliaryPanePreferredWidth ??
        clamp(
          Math.round(availableWidth * 0.28),
          INSPECTOR_DEFAULT_MIN_WIDTH,
          INSPECTOR_DEFAULT_MAX_WIDTH,
        ),
      availableWidth,
    });
  const widthRange = (availableWidth: number) => ({
    min: FOLDABLE_PANE_COMPACT_WIDTH,
    max: Math.max(FOLDABLE_PANE_COMPACT_WIDTH, availableWidth - FOLDABLE_PANE_COMPACT_WIDTH),
  });

  if (!supportsAuxiliaryPane) {
    return {
      primarySidebarVisible: false,
      primarySidebarSuppressedByAuxiliary: false,
      contentPaneWidth: viewportWidth,
      supportsAuxiliaryPane: false,
      auxiliaryPaneVisible: false,
      auxiliaryPaneMaximized: false,
      auxiliaryPaneWidth: null,
      auxiliaryPaneWidthRange: null,
    };
  }

  if (auxiliaryPaneVisible && input.auxiliaryPaneMaximized === true) {
    return {
      primarySidebarVisible: false,
      primarySidebarSuppressedByAuxiliary: sidebarPreferred,
      contentPaneWidth: 0,
      supportsAuxiliaryPane,
      auxiliaryPaneVisible,
      auxiliaryPaneMaximized: true,
      auxiliaryPaneWidth: viewportWidth,
      auxiliaryPaneWidthRange: widthRange(viewportWidth),
    };
  }

  const sidebarWidth = sidebarPreferred ? listPaneWidth : 0;
  const besideSidebarWidth = restingInspectorWidth(viewportWidth - sidebarWidth);
  const primarySidebarSuppressedByAuxiliary =
    sidebarPreferred &&
    auxiliaryPaneVisible &&
    viewportWidth - listPaneWidth - besideSidebarWidth < CHAT_MIN_WIDTH_BESIDE_SIDEBAR;
  const primarySidebarVisible = sidebarPreferred && !primarySidebarSuppressedByAuxiliary;
  const availableWidth = viewportWidth - (primarySidebarVisible ? listPaneWidth : 0);
  const auxiliaryPaneWidth = primarySidebarSuppressedByAuxiliary
    ? restingInspectorWidth(availableWidth)
    : besideSidebarWidth;

  return {
    primarySidebarVisible,
    primarySidebarSuppressedByAuxiliary,
    contentPaneWidth: Math.max(0, availableWidth - (auxiliaryPaneVisible ? auxiliaryPaneWidth : 0)),
    supportsAuxiliaryPane,
    auxiliaryPaneVisible,
    auxiliaryPaneMaximized: false,
    auxiliaryPaneWidth,
    auxiliaryPaneWidthRange: widthRange(availableWidth),
  };
}

export function deriveCenteredContentHorizontalPadding(input: {
  readonly viewportWidth: number;
  readonly maxContentWidth: number | null;
  readonly minimumPadding: number;
}): number {
  const viewportWidth = Number.isFinite(input.viewportWidth) ? Math.max(0, input.viewportWidth) : 0;
  const minimumPadding = Number.isFinite(input.minimumPadding)
    ? Math.max(0, input.minimumPadding)
    : 0;

  if (
    input.maxContentWidth === null ||
    !Number.isFinite(input.maxContentWidth) ||
    input.maxContentWidth <= 0
  ) {
    return minimumPadding;
  }

  return minimumPadding + Math.max(0, (viewportWidth - input.maxContentWidth) / 2);
}
