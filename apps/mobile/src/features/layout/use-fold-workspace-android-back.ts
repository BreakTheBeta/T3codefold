import { useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { BackHandler, Platform } from "react-native";

import { resolveAdaptiveWorkspaceBackAction } from "../../lib/adaptive-navigation";
import { useAdaptiveWorkspaceLayout } from "./AdaptiveWorkspaceLayout";

/** Unwinds Fold workspace chrome before Android Back leaves the thread. */
export function useFoldWorkspaceAndroidBack() {
  const { layout, panes, toggleAuxiliaryPane, togglePrimarySidebar } = useAdaptiveWorkspaceLayout();

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android" || !layout.usesSplitView) return;

      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        const action = resolveAdaptiveWorkspaceBackAction({
          auxiliaryPaneVisible: panes.auxiliaryPaneVisible,
          primarySidebarVisible: panes.primarySidebarVisible,
        });
        if (action === "close-inspector") {
          toggleAuxiliaryPane();
          return true;
        }
        if (action === "show-sidebar") {
          togglePrimarySidebar();
          return true;
        }
        return false;
      });
      return () => subscription.remove();
    }, [
      layout.usesSplitView,
      panes.auxiliaryPaneVisible,
      panes.primarySidebarVisible,
      toggleAuxiliaryPane,
      togglePrimarySidebar,
    ]),
  );
}
