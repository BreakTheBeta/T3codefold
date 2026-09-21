import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import { MaterialScreenContent } from "../../components/MaterialScreenContent";
import { ScreenHeader } from "../../components/ScreenHeader";
import type { ScreenHeaderAction } from "../../components/ScreenHeader.types";
import { cn } from "../../lib/cn";
import {
  resolveNativeReviewDiffView,
  type NativeReviewDiffViewHandle,
} from "../diffs/nativeReviewDiffSurface";
import {
  useAdaptiveWorkspaceLayout,
  useAdaptiveWorkspacePaneRole,
  useRegisterWorkspaceInspector,
} from "../layout/AdaptiveWorkspaceLayout";
import {
  getCachedNativeReviewDiffData,
  NATIVE_REVIEW_DIFF_CONTENT_WIDTH,
} from "../review/nativeReviewDiffAdapter";
import { buildReviewParsedDiff, type ReviewParsedDiff } from "../review/reviewModel";
import { ReviewFileNavigator, type ReviewFileNavigatorHandle } from "../review/ReviewSheet";
import { useNativeReviewDiffBridge } from "../review/useNativeReviewDiffBridge";
import { useAppearanceCodeSurface } from "../settings/appearance/useAppearanceCodeSurface";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";
import { usePendingReviewComments } from "./pendingReview";
import {
  buildPullRequestInlineComments,
  pullRequestReviewKey,
  pullRequestRouteParams,
  pullRequestTargetFromParams,
  type PullRequestRouteParams,
} from "./pullRequestReview.logic";
import {
  usePullRequestDetail,
  usePullRequestDiff,
  usePullRequestFilesViewed,
} from "./usePullRequestData";

const EMPTY_DIFF: ReviewParsedDiff = { kind: "empty" };
const NO_SELECTED_ROWS: ReadonlyArray<string> = [];

/**
 * A pull request's diff on the native diff surface. Tapping a line opens a sheet to comment on
 * it; the changed-file list sits in the workspace inspector column when there is room for it
 * (an unfolded foldable or a tablet), and scrolls the diff to the picked file.
 */
export function PullRequestFilesRouteScreen(props: StaticScreenProps<PullRequestRouteParams>) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  useAdaptiveWorkspacePaneRole("inspector");
  const { panes, showAuxiliaryPane, toggleAuxiliaryPane } = useAdaptiveWorkspaceLayout();
  const { nativeReviewDiffStyle } = useAppearanceCodeSurface();
  const { themeAppearance } = useAppearancePreferences();
  const { environmentId, projectId, repository, number, host } = props.route.params;
  const target = useMemo(
    () => pullRequestTargetFromParams({ environmentId, projectId, repository, number, host }),
    [environmentId, host, number, projectId, repository],
  );
  const params = useMemo(() => (target === null ? null : pullRequestRouteParams(target)), [target]);
  const reviewKey = target === null ? "" : pullRequestReviewKey(target);

  useEffect(() => {
    showAuxiliaryPane("inspector");
  }, [reviewKey, showAuxiliaryPane]);

  const diff = usePullRequestDiff(target);
  const { detail, activity } = usePullRequestDetail(target);
  const pending = usePendingReviewComments(reviewKey);
  const { viewedPaths, toggleViewed } = usePullRequestFilesViewed(target);
  const parsedDiff = useMemo(
    () =>
      diff.patch.trim().length === 0
        ? EMPTY_DIFF
        : buildReviewParsedDiff(diff.patch, `pull-request:${reviewKey}`),
    [diff.patch, reviewKey],
  );
  const files = parsedDiff.kind === "files" ? parsedDiff.files : [];
  const threads = activity.data?.reviewThreads;
  const inlineComments = useMemo(
    () => buildPullRequestInlineComments({ files, threads: threads ?? [], pending }),
    [files, pending, threads],
  );
  const nativeData = useMemo(
    () => getCachedNativeReviewDiffData({ parsedDiff, comments: inlineComments }),
    [inlineComments, parsedDiff],
  );
  const [collapsedFileIds, setCollapsedFileIds] = useState<ReadonlyArray<string>>([]);
  const viewedFileIds = useMemo(() => {
    const viewed = new Set(viewedPaths);
    return files.filter((file) => viewed.has(file.path)).map((file) => file.id);
  }, [files, viewedPaths]);
  const bridge = useNativeReviewDiffBridge({
    threadKey: `pull-request:${reviewKey}`,
    sectionId: "pull-request",
    diff: diff.patch,
    data: nativeData,
    collapsedFileIds,
    viewedFileIds,
    selectedRowIds: NO_SELECTED_ROWS,
    canHighlight: parsedDiff.kind === "files",
  });
  const NativeReviewDiffView = resolveNativeReviewDiffView();
  const diffViewRef = useRef<NativeReviewDiffViewHandle>(null);
  const navigatorRef = useRef<ReviewFileNavigatorHandle>(null);

  const toggleCollapsed = useCallback((fileId: string) => {
    setCollapsedFileIds((current) =>
      current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId],
    );
  }, []);
  const handleSelectFile = useCallback((fileId: string | null) => {
    if (fileId !== null) {
      setCollapsedFileIds((current) => current.filter((id) => id !== fileId));
    }
    const scroll =
      fileId === null
        ? diffViewRef.current?.scrollToTop(true)
        : diffViewRef.current?.scrollToFile(fileId, true);
    void scroll?.catch((error: unknown) => {
      console.error("[pull-request] Failed to scroll to diff file", error);
    });
  }, []);
  const renderInspector = useCallback(
    () => (
      <ReviewFileNavigator
        ref={navigatorRef}
        files={nativeData.files}
        headerInset={insets.top}
        sectionId={reviewKey}
        onSelectFile={handleSelectFile}
      />
    ),
    [handleSelectFile, insets.top, nativeData.files, reviewKey],
  );
  const showFilesPane = parsedDiff.kind === "files";
  useRegisterWorkspaceInspector(showFilesPane ? renderInspector : undefined);

  const handleVisibleFileChange = useCallback(
    (event: NativeSyntheticEvent<{ readonly fileId?: string | null }>) => {
      navigatorRef.current?.setVisibleFile(event.nativeEvent.fileId ?? null);
    },
    [],
  );
  const handleToggleFile = useCallback(
    (event: NativeSyntheticEvent<{ readonly fileId?: string }>) => {
      if (event.nativeEvent.fileId) toggleCollapsed(event.nativeEvent.fileId);
    },
    [toggleCollapsed],
  );
  const handleToggleViewedFile = useCallback(
    (event: NativeSyntheticEvent<{ readonly fileId?: string }>) => {
      const file = files.find((candidate) => candidate.id === event.nativeEvent.fileId);
      if (!file) return;
      // Marking a file viewed folds it away, the way the host's own review page does.
      if (!viewedPaths.includes(file.path)) {
        setCollapsedFileIds((current) =>
          current.includes(file.id) ? current : [...current, file.id],
        );
      }
      void toggleViewed(file.path);
    },
    [files, toggleViewed, viewedPaths],
  );
  const handlePressLine = useCallback(
    (event: NativeSyntheticEvent<{ readonly rowId?: string }>) => {
      const rowId = event.nativeEvent.rowId;
      const commentTarget = rowId ? nativeData.commentTargetsByRowId.get(rowId) : undefined;
      const line = commentTarget?.lines[commentTarget.lineIndex];
      if (!params || !commentTarget || !line) return;
      const file = files.find((candidate) => candidate.path === commentTarget.filePath);
      navigation.navigate("PullRequestComment", {
        ...params,
        mode: "line",
        path: commentTarget.filePath,
        ...(file?.previousPath && file.previousPath !== file.path
          ? { oldPath: file.previousPath }
          : {}),
        change: line.change,
        oldLine: line.oldLineNumber,
        newLine: line.newLineNumber,
        content: line.content,
      });
    },
    [files, nativeData.commentTargetsByRowId, navigation, params],
  );
  const openReview = useCallback(() => {
    if (params) navigation.navigate("PullRequestReview", params);
  }, [navigation, params]);
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else if (params) navigation.navigate("PullRequest", params);
  }, [navigation, params]);

  const canReview = (detail.data?.viewerPermissions.verdicts.length ?? 0) > 0;
  const headerActions: ScreenHeaderAction[] = [];
  if (panes.supportsAuxiliaryPane && showFilesPane) {
    headerActions.push({
      accessibilityLabel: panes.auxiliaryPaneVisible ? "Hide changed files" : "Show changed files",
      icon: "sidebar.right",
      selected: panes.auxiliaryPaneVisible,
      onPress: toggleAuxiliaryPane,
    });
  }
  if (canReview) {
    headerActions.push({
      accessibilityLabel: "Submit review",
      icon: "checkmark.circle",
      onPress: openReview,
    });
  }
  const subtitle = [
    parsedDiff.kind === "files" ? `${parsedDiff.fileCount} files` : null,
    parsedDiff.kind === "files" ? `+${parsedDiff.additions} -${parsedDiff.deletions}` : null,
    pending.length > 0 ? `${pending.length} pending` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const notice = !diff.complete
    ? diff.canLoadMore
      ? "This pull request is large. Showing the first part of its diff."
      : null
    : diff.truncated || diff.omittedFileStats.length > 0
      ? "Some files are too large or binary and are not shown."
      : null;

  return (
    <>
      <ScreenHeader
        title={`#${number} files`}
        subtitle={subtitle || repository}
        onBack={handleBack}
        hideBottomBorder
        backInSplitView={{ accessibilityLabel: "Back to pull request", icon: "chevron.left" }}
        actions={headerActions}
        menus={[
          {
            title: "Diff options",
            icon: "ellipsis.circle",
            items: [
              {
                id: "refresh",
                title: "Refresh diff",
                onPress: diff.refresh,
              },
              ...(diff.canLoadMore
                ? [{ id: "load-more", title: "Load more files", onPress: diff.loadMore }]
                : []),
            ],
          },
        ]}
      />
      <MaterialScreenContent>
        <View
          className={Platform.OS === "android" ? "flex-1 bg-sheet-solid" : "flex-1 bg-sheet"}
          style={{
            backgroundColor: parsedDiff.kind === "files" ? bridge.theme.background : undefined,
          }}
        >
          {notice ? (
            <Pressable
              disabled={!diff.canLoadMore}
              onPress={diff.loadMore}
              className={cn(
                "bg-warning px-4 py-3",
                Platform.OS === "android" ? "m-2 rounded-[20px]" : "border-b border-warning-border",
              )}
            >
              <Text className="text-xs leading-normal text-warning-foreground">
                {notice}
                {diff.canLoadMore ? " Tap to load more." : ""}
              </Text>
            </Pressable>
          ) : null}
          {parsedDiff.kind === "files" && NativeReviewDiffView ? (
            <View className="min-w-0 flex-1" collapsable={false}>
              <NativeReviewDiffView
                collapsable={false}
                testID="pull-request-native-diff-view"
                refreshing={diff.isPending}
                onPullToRefresh={diff.refresh}
                style={StyleSheet.absoluteFill}
                appearanceScheme={themeAppearance}
                collapsedFileIdsJson={bridge.collapsedFileIdsJson}
                collapsedCommentIdsJson={bridge.collapsedCommentIdsJson}
                contentResetKey={`pull-request:${reviewKey}`}
                contentWidth={NATIVE_REVIEW_DIFF_CONTENT_WIDTH}
                nativeViewRef={diffViewRef}
                rowHeight={nativeReviewDiffStyle.rowHeight}
                rowsJson={bridge.rowsJson}
                selectedRowIdsJson={bridge.selectedRowIdsJson}
                styleJson={bridge.styleJson}
                themeJson={bridge.themeJson}
                tokensPatchJson={bridge.tokensPatchJson}
                tokensResetKey={bridge.tokensResetKey}
                viewedFileIdsJson={bridge.viewedFileIdsJson}
                onDebug={bridge.onDebug}
                onPressLine={handlePressLine}
                onVisibleFileChange={handleVisibleFileChange}
                onToggleComment={bridge.onToggleComment}
                onToggleFile={handleToggleFile}
                onToggleViewedFile={handleToggleViewedFile}
              />
            </View>
          ) : (
            <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 12 }}>
              {diff.error ? (
                <View className="gap-1 rounded-[20px] bg-card px-4 py-3">
                  <Text className="text-sm font-t3-bold text-foreground">Diff unavailable</Text>
                  <Text className="text-xs leading-normal text-foreground-muted">{diff.error}</Text>
                </View>
              ) : diff.isPending ? (
                <View className="items-center gap-3 py-6">
                  <ActivityIndicator size="small" />
                  <Text className="text-xs text-foreground-muted">Loading diff…</Text>
                </View>
              ) : parsedDiff.kind === "empty" ? (
                <Text className="text-center text-sm text-foreground-muted">No changes.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Text selectable className="font-mono text-xs leading-relaxed text-foreground">
                    {parsedDiff.kind === "raw" ? parsedDiff.text : diff.patch}
                  </Text>
                </ScrollView>
              )}
            </ScrollView>
          )}
          {pending.length > 0 && canReview ? (
            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                left: 18,
                right: 18,
                bottom: Math.max(insets.bottom, 10) + 18,
                alignItems: "center",
              }}
            >
              <Pressable
                className="h-12 flex-row items-center justify-center gap-2 rounded-full bg-primary px-6"
                onPress={openReview}
              >
                <SymbolView
                  name="checkmark.circle"
                  size={16}
                  tintColorClassName="accent-primary-foreground"
                  type="monochrome"
                />
                <Text className="text-base font-t3-bold text-primary-foreground">
                  Submit review · {pending.length} pending
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </MaterialScreenContent>
    </>
  );
}
