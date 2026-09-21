import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { useCallback, useMemo } from "react";
import { Platform, View } from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { MaterialScreenContent } from "../../components/MaterialScreenContent";
import { ScreenHeader } from "../../components/ScreenHeader";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { PullRequestOverview } from "./PullRequestOverview";
import {
  pullRequestTargetFromParams,
  type PullRequestRouteParams,
} from "./pullRequestReview.logic";
import { usePullRequestDetail } from "./usePullRequestData";

export function PullRequestRouteScreen(props: StaticScreenProps<PullRequestRouteParams>) {
  const navigation = useNavigation();
  const { environmentId, projectId, repository, number, host } = props.route.params;
  const target = useMemo(
    () => pullRequestTargetFromParams({ environmentId, projectId, repository, number, host }),
    [environmentId, host, number, projectId, repository],
  );
  const { detail } = usePullRequestDetail(target);
  const url = detail.data?.url ?? null;
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("PullRequests");
  }, [navigation]);

  return (
    <>
      <ScreenHeader
        title={`#${number}`}
        subtitle={repository}
        onBack={handleBack}
        actions={
          url
            ? [
                {
                  accessibilityLabel: "Open in browser",
                  icon: "arrow.up.right",
                  onPress: () => void tryOpenExternalUrl(url, "pull-request"),
                },
              ]
            : undefined
        }
      />
      <MaterialScreenContent>
        <View className={Platform.OS === "android" ? "flex-1 bg-sheet-solid" : "flex-1 bg-screen"}>
          {target === null ? (
            <EmptyState
              variant="plain"
              title="Pull request not found"
              detail="This link does not name a pull request."
            />
          ) : (
            <PullRequestOverview target={target} />
          )}
        </View>
      </MaterialScreenContent>
    </>
  );
}
