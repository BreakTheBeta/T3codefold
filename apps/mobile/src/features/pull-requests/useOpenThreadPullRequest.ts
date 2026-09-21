import { useNavigation } from "@react-navigation/native";
import { useCallback } from "react";

import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { useThreadSelection } from "../../state/use-thread-selection";
import { parsePullRequestUrl, pullRequestRouteParams } from "./pullRequestReview.logic";

/**
 * Opens the current thread's pull request in the app's review screens, reading it through the
 * thread's environment. A URL the app cannot address (another host's shape) still opens in the
 * browser. Resolves false only when neither worked.
 */
export function useOpenThreadPullRequest() {
  const navigation = useNavigation();
  const { selectedThread } = useThreadSelection();
  return useCallback(
    async (url: string, options?: { readonly beforeNavigate?: () => void }) => {
      const parsed = parsePullRequestUrl(url);
      if (selectedThread !== null && parsed !== null) {
        options?.beforeNavigate?.();
        navigation.navigate(
          "PullRequest",
          pullRequestRouteParams({
            environmentId: selectedThread.environmentId,
            projectId: selectedThread.projectId,
            ...parsed,
          }),
        );
        return true;
      }
      return tryOpenExternalUrl(url, "pull-request");
    },
    [navigation, selectedThread],
  );
}
