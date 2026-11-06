import type { WorkspaceTab } from "./workspace/workspace-tabs-state";
import { createContext, use } from "react";
import type { InspectorContent } from "./inspector-panes";
import type { WorkspaceDetail, WorkspaceDetailSheet } from "./workspace/workspace-detail-selection";
import {
  deriveFileInspectorPaneLayout,
  deriveLayout,
  type FileInspectorPaneLayout,
  type Layout,
} from "../../lib/layout";
import type { FoldWorkspacePaneLayout } from "../../lib/foldable-pane-layout";
import {
  compactFoldPanes,
  DEFAULT_FOLD_ADAPTIVE_WORKSPACE_FIELDS,
  type FoldAdaptiveWorkspaceFields,
} from "./fold-adaptive-workspace-context";

interface AdaptiveWorkspaceContextValue extends FoldAdaptiveWorkspaceFields {
  readonly layout: Layout;
  readonly panes: FoldWorkspacePaneLayout;
  readonly fileInspector: FileInspectorPaneLayout;
  readonly primarySidebarSearchQuery: string;
  readonly startNewTask: () => void;
  /** Use `useSelectWorkspaceDetail`, which also works outside the layout. */
  readonly selectDetail?: (detail: WorkspaceDetail, sheet?: WorkspaceDetailSheet) => void;
  readonly registerWorkspaceInspector: (
    content: InspectorContent,
    routeKey: string | undefined,
    revealKey?: string,
  ) => () => void;
  readonly setPrimarySidebarSearchQuery: (query: string) => void;
  /** Opens the inspector: its column where the window has one, otherwise a sheet. */
  readonly showInspector: () => void;
  readonly toggleAuxiliaryPane: () => void;
  /**
   * Whether the content pane offers a sidebar button: false without columns, on a list that keeps
   * its sidebar, and on a workspace page (Android Settings, Usage) that covers it.
   */
  readonly sidebarToggleable: boolean;
  readonly togglePrimarySidebar: () => void;
  /** Shows the sidebar, setting aside the keyboard or an inspector that took its room. */
  readonly revealPrimarySidebar: () => void;
  readonly setPrimarySidebarVisible: (visible: boolean) => void;
  /** Opens a workspace tab with its list and, with columns, the page it last showed. */
  readonly openWorkspaceTab: (
    tab: WorkspaceTab | "settings",
    options?: { readonly columns?: boolean },
  ) => void;
  readonly setAuxiliaryPaneWidth: (width: number) => void;
  readonly nativeInspectorWidth: number;
  readonly setNativeInspectorWidth: (width: number) => void;
  /**
   * Android split view while the thread composer has the soft keyboard: the
   * sidebar and rail step aside and the thread header drops to one line.
   */
  readonly composerKeyboardActive: boolean;
  /**
   * Whether the sidebar shows in each orientation, where it floats over the content in portrait
   * (the unfolded Duo). The native split switches between them as a rotation starts.
   */
  readonly sidebarByOrientation: { readonly landscape: boolean; readonly portrait: boolean } | null;
  /** Android split: the composer's keyboard slides the sidebar, from focus until it lets go. */
  readonly keyboardHoldsSidebar?: boolean;
  /** Android split: the width a workspace page (Usage) opens at; null without columns. */
  readonly workspacePageWidth?: number | null;
  /** The thread composer reports its focus so the layout can make room for typing. */
  readonly setComposerEditing: (editing: boolean) => void;
}

const compactLayout = deriveLayout({ width: 0, height: 0 });
const compactPanes = compactFoldPanes;
const compactFileInspector = deriveFileInspectorPaneLayout({
  layout: compactLayout,
  viewportWidth: 0,
});
export const AdaptiveWorkspaceContext = createContext<AdaptiveWorkspaceContextValue>({
  ...DEFAULT_FOLD_ADAPTIVE_WORKSPACE_FIELDS,
  layout: compactLayout,
  panes: compactPanes,
  fileInspector: compactFileInspector,
  primarySidebarSearchQuery: "",
  startNewTask: () => undefined,
  registerWorkspaceInspector: () => () => undefined,
  setPrimarySidebarSearchQuery: () => undefined,
  showInspector: () => undefined,
  toggleAuxiliaryPane: () => undefined,
  sidebarToggleable: false,
  togglePrimarySidebar: () => undefined,
  revealPrimarySidebar: () => undefined,
  setPrimarySidebarVisible: () => undefined,
  openWorkspaceTab: () => undefined,
  setAuxiliaryPaneWidth: () => undefined,
  nativeInspectorWidth: 0,
  setNativeInspectorWidth: () => undefined,
  composerKeyboardActive: false,
  sidebarByOrientation: null,
  setComposerEditing: () => undefined,
});

export function useAdaptiveWorkspaceLayout(): AdaptiveWorkspaceContextValue {
  return use(AdaptiveWorkspaceContext);
}
