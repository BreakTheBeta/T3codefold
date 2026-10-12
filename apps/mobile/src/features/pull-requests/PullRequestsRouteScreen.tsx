import { useNavigation } from "@react-navigation/native";
import { useCallback } from "react";

import { MaterialScreenContent } from "../../components/MaterialScreenContent";
import { ScreenHeader } from "../../components/ScreenHeader";
import { WorkspaceTabsProvider } from "../workspace/WorkspaceTabsContext";
import { PullRequestsScreen } from "./PullRequestsScreen";

/**
 * The pull request list as its own route, for entry points outside the workspace tabs: the
 * Android split sidebar, the command palette, and the Home header where no tab bar is shown.
 */
export function PullRequestsRouteScreen() {
  const navigation = useNavigation();
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("Home");
  }, [navigation]);

  return (
    <>
      <ScreenHeader title="Pull requests" onBack={handleBack} />
      <MaterialScreenContent>
        <WorkspaceTabsProvider>
          <PullRequestsScreen />
        </WorkspaceTabsProvider>
      </MaterialScreenContent>
    </>
  );
}
