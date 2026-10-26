import { deriveLayout } from "../../lib/layout";
import {
  deriveFoldWorkspacePaneLayout,
  type FoldWorkspacePaneLayout,
} from "../../lib/foldable-pane-layout";

/** Fold's additions to the adaptive workspace context: fold geometry and the inspector's maximize. */
export interface FoldAdaptiveWorkspaceFields {
  readonly tabletopTopHeight: number | null;
  readonly tabletopHingeTop: number | null;
  readonly tabletopHingeHeight: number;
  readonly hideAuxiliaryPane: () => void;
  /** Gives the inspector the whole workspace, or returns it beside the chat. */
  readonly setAuxiliaryPaneMaximized: (maximized: boolean) => void;
  readonly toggleAuxiliaryPaneMaximized: () => void;
}

export const compactFoldPanes: FoldWorkspacePaneLayout = deriveFoldWorkspacePaneLayout({
  layout: deriveLayout({ width: 0, height: 0 }),
  viewportWidth: 0,
  primarySidebarPreferredVisible: true,
  auxiliaryPanePreferredVisible: true,
});

export const DEFAULT_FOLD_ADAPTIVE_WORKSPACE_FIELDS: FoldAdaptiveWorkspaceFields = {
  tabletopTopHeight: null,
  tabletopHingeTop: null,
  tabletopHingeHeight: 0,
  hideAuxiliaryPane: () => undefined,
  setAuxiliaryPaneMaximized: () => undefined,
  toggleAuxiliaryPaneMaximized: () => undefined,
};
