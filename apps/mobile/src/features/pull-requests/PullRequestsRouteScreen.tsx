import type { PullRequestInvolvement } from "@t3tools/contracts";
import { useNavigation } from "@react-navigation/native";
import { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { EmptyState } from "../../components/EmptyState";
import { MaterialScreenContent } from "../../components/MaterialScreenContent";
import { ScreenHeader } from "../../components/ScreenHeader";
import { StatusPill } from "../../components/StatusPill";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/time";
import { PullRequestOverview } from "./PullRequestOverview";
import {
  checksSummary,
  pullRequestStateTone,
  reviewDecisionLabel,
} from "./pullRequestPresentation";
import {
  pullRequestRouteParams,
  type PullRequestListRow,
  type PullRequestTarget,
} from "./pullRequestReview.logic";
import { usePullRequestList } from "./usePullRequestData";

/** Past this width the list stays on the left and the selected PR opens beside it. */
const SPLIT_MIN_WIDTH = 680;
const SPLIT_LIST_MIN_WIDTH = 300;
const SPLIT_LIST_MAX_WIDTH = 400;

type ListState = "open" | "all";

const INVOLVEMENT_OPTIONS: ReadonlyArray<{
  readonly value: PullRequestInvolvement;
  readonly title: string;
}> = [
  { value: "all", title: "Everything" },
  { value: "reviewing", title: "Review requested" },
  { value: "authored", title: "Created by me" },
];

function targetOfRow(row: PullRequestListRow): PullRequestTarget {
  return {
    environmentId: row.environmentId,
    projectId: row.projectId,
    host: row.host,
    repository: row.repository,
    number: row.number,
  };
}

function rowKey(row: PullRequestListRow) {
  return JSON.stringify([row.environmentId, row.projectId, row.host, row.repository, row.number]);
}

function targetOfRowKey(key: string): PullRequestTarget {
  const [environmentId, projectId, host, repository, number] = JSON.parse(key) as [
    PullRequestListRow["environmentId"],
    PullRequestListRow["projectId"],
    string,
    string,
    number,
  ];
  return { environmentId, projectId, host, repository, number };
}

const PullRequestRow = memo(function PullRequestRow(props: {
  readonly row: PullRequestListRow;
  readonly selected: boolean;
  readonly onPress: (row: PullRequestListRow) => void;
}) {
  const { row } = props;
  const stateTone = pullRequestStateTone(row.state, row.isDraft);
  const checks = checksSummary(row.checksState);
  const decision = reviewDecisionLabel(row.reviewDecision);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      className={cn(
        "mx-2 my-0.5 gap-1.5 rounded-[20px] px-4 py-3 active:bg-subtle",
        props.selected && "bg-subtle-strong",
      )}
      onPress={() => props.onPress(row)}
    >
      <Text className="text-base font-t3-bold text-foreground" numberOfLines={2}>
        {row.title}
      </Text>
      <Text className="text-xs text-foreground-muted" numberOfLines={1}>
        {row.repository} #{row.number} · @{row.author?.login ?? "unknown"} ·{" "}
        {relativeTime(row.updatedAt)}
      </Text>
      <View className="flex-row flex-wrap items-center gap-2">
        {row.state !== "open" || row.isDraft ? <StatusPill {...stateTone} size="compact" /> : null}
        {decision ? (
          <Text className={cn("text-xs font-t3-medium", decision.textClassName)}>
            {decision.label}
          </Text>
        ) : null}
        {checks ? (
          <Text className={cn("text-xs font-t3-medium", checks.textClassName)}>{checks.label}</Text>
        ) : null}
        {row.mergeability === "conflicting" ? (
          <Text className="text-xs font-t3-medium text-adaptive-rose-700-300">Conflicts</Text>
        ) : null}
        {row.additions + row.deletions > 0 ? (
          <Text className="text-xs text-foreground-muted">
            <Text className="text-adaptive-emerald-700-300">+{row.additions}</Text>{" "}
            <Text className="text-adaptive-rose-700-300">-{row.deletions}</Text>
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

export function PullRequestsRouteScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [involvement, setInvolvement] = useState<PullRequestInvolvement>("all");
  const [listState, setListState] = useState<ListState>("open");
  const list = usePullRequestList({ state: listState, involvement });
  const [width, setWidth] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const split = width >= SPLIT_MIN_WIDTH;
  const listWidth = Math.min(
    SPLIT_LIST_MAX_WIDTH,
    Math.max(SPLIT_LIST_MIN_WIDTH, Math.round(width * 0.38)),
  );
  const rows = useMemo(() => list.groups.flatMap((group) => group.rows), [list.groups]);
  // In the split layout something is always open: the pick, or else the first row.
  const selectedRow = split
    ? (rows.find((row) => rowKey(row) === selectedKey) ?? rows[0] ?? null)
    : null;
  // Rows are rebuilt on every refresh; the open detail follows the PR's key, not the row object,
  // so a list re-read does not make it re-subscribe.
  const selectedRowKey = selectedRow === null ? null : rowKey(selectedRow);
  const selectedTarget = useMemo(
    () => (selectedRowKey === null ? null : targetOfRowKey(selectedRowKey)),
    [selectedRowKey],
  );
  const sections = useMemo(
    () => list.groups.map((group) => ({ key: group.key, title: group.title, data: group.rows })),
    [list.groups],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);
  const refreshList = list.refresh;
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshList();
    } finally {
      setRefreshing(false);
    }
  }, [refreshList]);
  const handlePressRow = useCallback(
    (row: PullRequestListRow) => {
      if (split) {
        setSelectedKey(rowKey(row));
        return;
      }
      navigation.navigate("PullRequest", pullRequestRouteParams(targetOfRow(row)));
    },
    [navigation, split],
  );
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("Home");
  }, [navigation]);

  const reviewCount =
    list.groups.find((group) => group.key === "review-requested")?.rows.length ?? 0;
  const subtitle =
    list.isPending && rows.length === 0
      ? "Loading…"
      : reviewCount > 0
        ? `${reviewCount} need${reviewCount === 1 ? "s" : ""} your review`
        : `${rows.length} ${listState === "open" ? "open" : "total"}`;

  const listView = (
    <SectionList
      sections={sections}
      keyExtractor={rowKey}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) + 16 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />
      }
      renderSectionHeader={({ section }) => (
        <Text className="px-6 pb-1 pt-3 text-xs font-t3-bold uppercase text-foreground-muted">
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => (
        <PullRequestRow
          row={item}
          selected={selectedRow !== null && rowKey(item) === rowKey(selectedRow)}
          onPress={handlePressRow}
        />
      )}
      ListHeaderComponent={
        list.errors.length > 0 ? (
          <View className="mx-4 mb-2 gap-1 rounded-[20px] bg-warning px-4 py-3">
            {list.errors.map((error) => (
              <Text key={error} className="text-xs text-warning-foreground">
                {error}
              </Text>
            ))}
          </View>
        ) : null
      }
      ListEmptyComponent={
        list.isPending ? (
          <View className="items-center py-10">
            <ActivityIndicator size="small" />
          </View>
        ) : (
          <EmptyState
            variant="plain"
            title={list.hasEnvironments ? "No pull requests" : "No environment connected"}
            detail={
              list.hasEnvironments
                ? "Nothing matches these filters in your projects."
                : "Connect to a T3 Code environment to review its pull requests."
            }
          />
        )
      }
    />
  );

  return (
    <>
      <ScreenHeader
        title="Pull requests"
        subtitle={subtitle}
        onBack={handleBack}
        menus={[
          {
            title: "Filter pull requests",
            icon:
              involvement === "all" && listState === "open"
                ? "line.3.horizontal.decrease.circle"
                : "line.3.horizontal.decrease.circle.fill",
            items: [
              {
                id: "involvement",
                inline: true,
                items: INVOLVEMENT_OPTIONS.map((option) => ({
                  id: `involvement:${option.value}`,
                  title: option.title,
                  selected: involvement === option.value,
                  onPress: () => setInvolvement(option.value),
                })),
              },
              {
                id: "state",
                inline: true,
                items: [
                  {
                    id: "state:open",
                    title: "Open only",
                    selected: listState === "open",
                    onPress: () => setListState("open"),
                  },
                  {
                    id: "state:all",
                    title: "Include closed",
                    selected: listState === "all",
                    onPress: () => setListState("all"),
                  },
                ],
              },
            ],
          },
        ]}
      />
      <MaterialScreenContent>
        <View
          className={
            Platform.OS === "android"
              ? "flex-1 flex-row bg-sheet-solid"
              : "flex-1 flex-row bg-screen"
          }
          onLayout={handleLayout}
        >
          {split ? (
            <>
              <View className="border-r border-border" style={{ width: listWidth }}>
                {listView}
              </View>
              <View className="min-w-0 flex-1">
                {selectedTarget === null ? (
                  <View className="flex-1 items-center justify-center px-6">
                    <Text className="text-sm text-foreground-muted">
                      Select a pull request to review it.
                    </Text>
                  </View>
                ) : (
                  <PullRequestOverview key={selectedRowKey} target={selectedTarget} />
                )}
              </View>
            </>
          ) : (
            <View className="flex-1">{listView}</View>
          )}
        </View>
      </MaterialScreenContent>
    </>
  );
}
