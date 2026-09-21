import type {
  PullRequestActivity,
  PullRequestComment,
  PullRequestDetail,
  PullRequestReviewThread,
} from "@t3tools/contracts";
import { useNavigation } from "@react-navigation/native";
import { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import { ControlPill } from "../../components/ControlPill";
import { StatusPill } from "../../components/StatusPill";
import { cn } from "../../lib/cn";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { relativeTime } from "../../lib/time";
import { usePendingReviewComments } from "./pendingReview";
import { PullRequestMarkdown, PullRequestMediaContext } from "./PullRequestMarkdown";
import { checkStatusPresentation, pullRequestStateTone } from "./pullRequestPresentation";
import {
  pullRequestReviewKey,
  pullRequestRouteParams,
  type PullRequestTarget,
} from "./pullRequestReview.logic";
import { usePullRequestDetail } from "./usePullRequestData";

/** Wide enough to put checks, reviewers, and labels in a column beside the conversation. */
const TWO_COLUMN_MIN_WIDTH = 700;
const SIDE_COLUMN_WIDTH = 300;

function accentClassName(textClassName: string) {
  return textClassName.replace(/^text-/, "accent-");
}

function Section(props: {
  readonly title: string;
  readonly trailing?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between px-1">
        <Text className="text-xs font-t3-bold uppercase text-foreground-muted">{props.title}</Text>
        {props.trailing ? (
          <Text className="text-xs text-foreground-muted">{props.trailing}</Text>
        ) : null}
      </View>
      <View className="overflow-hidden rounded-[20px] border border-border bg-card">
        {props.children}
      </View>
    </View>
  );
}

function StatusSections(props: { readonly detail: PullRequestDetail }) {
  const { detail } = props;
  const failing = detail.checks.filter(
    (check) => check.status === "failure" || check.status === "cancelled",
  ).length;
  return (
    <View className="gap-4">
      <Section
        title="Checks"
        trailing={
          detail.checks.length === 0
            ? undefined
            : failing > 0
              ? `${failing} failing`
              : `${detail.checks.length} total`
        }
      >
        {detail.checks.length === 0 ? (
          <Text className="px-4 py-3 text-sm text-foreground-muted">No checks reported.</Text>
        ) : (
          detail.checks.map((check, index) => {
            const presentation = checkStatusPresentation(check.status);
            return (
              <Pressable
                key={`${check.name}:${index}`}
                accessibilityRole={check.url ? "link" : undefined}
                disabled={!check.url}
                className={cn(
                  "min-h-11 flex-row items-center gap-3 px-4 py-2.5 active:bg-subtle",
                  index > 0 && "border-t border-border",
                )}
                onPress={() => {
                  if (check.url) void tryOpenExternalUrl(check.url, "pull-request");
                }}
              >
                <SymbolView
                  name={presentation.icon}
                  size={16}
                  tintColorClassName={accentClassName(presentation.textClassName)}
                  type="monochrome"
                />
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-t3-medium text-foreground" numberOfLines={1}>
                    {check.name}
                  </Text>
                  {check.description ? (
                    <Text className="text-xs text-foreground-muted" numberOfLines={1}>
                      {check.description}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        )}
      </Section>
      <Section title="Merge">
        <View className="gap-1 px-4 py-3">
          <Text
            className={cn(
              "text-sm font-t3-medium",
              detail.mergeability === "conflicting"
                ? "text-adaptive-rose-700-300"
                : "text-foreground",
            )}
          >
            {detail.mergeability === "conflicting"
              ? "Has conflicts with the base branch"
              : detail.mergeability === "mergeable"
                ? "No conflicts with the base branch"
                : "Mergeability unknown"}
          </Text>
          {detail.baseComparison === "behind" ? (
            <Text className="text-xs text-foreground-muted">
              {detail.behindBy === undefined
                ? "Behind its base branch"
                : `${detail.behindBy} commit${detail.behindBy === 1 ? "" : "s"} behind its base`}
            </Text>
          ) : null}
        </View>
      </Section>
      <Section title="Reviewers">
        {detail.reviewers.length === 0 ? (
          <Text className="px-4 py-3 text-sm text-foreground-muted">No reviewers yet.</Text>
        ) : (
          <View className="gap-1 px-4 py-3">
            {detail.reviewers.map((reviewer) => (
              <Text key={reviewer.login} className="text-sm text-foreground">
                @{reviewer.login}
              </Text>
            ))}
          </View>
        )}
      </Section>
      {detail.labels.length > 0 ? (
        <Section title="Labels">
          <View className="flex-row flex-wrap gap-2 px-4 py-3">
            {detail.labels.map((label) => (
              <StatusPill
                key={label.name}
                label={label.name}
                size="compact"
                pillClassName="bg-subtle"
                textClassName="text-foreground-secondary"
              />
            ))}
          </View>
        </Section>
      ) : null}
    </View>
  );
}

const TimelineComment = memo(function TimelineComment(props: {
  readonly comment: PullRequestComment;
}) {
  const { comment } = props;
  const reviewState = comment.reviewState?.toLowerCase().replace(/_/g, " ");
  return (
    <View className="gap-2 px-4 py-3">
      <View className="flex-row items-center gap-2">
        <Text className="text-sm font-t3-bold text-foreground">
          @{comment.author?.login ?? "unknown"}
        </Text>
        {comment.kind === "review" && reviewState ? (
          <Text className="text-xs text-foreground-muted">{reviewState}</Text>
        ) : null}
        <View className="flex-1" />
        <Text className="text-xs text-foreground-muted">{relativeTime(comment.createdAt)}</Text>
      </View>
      {comment.body.trim().length > 0 ? <PullRequestMarkdown markdown={comment.body} /> : null}
    </View>
  );
});

const ReviewThreadCard = memo(function ReviewThreadCard(props: {
  readonly thread: PullRequestReviewThread;
  readonly canComment: boolean;
  readonly onOpen: (threadId: string) => void;
}) {
  const { thread } = props;
  return (
    <Pressable
      className="gap-2 px-4 py-3 active:bg-subtle"
      disabled={!props.canComment}
      onPress={() => props.onOpen(thread.id)}
    >
      <View className="flex-row items-center gap-2">
        <Text
          className="min-w-0 flex-1 font-mono text-xs text-foreground-muted"
          ellipsizeMode="middle"
          numberOfLines={1}
        >
          {thread.path}
          {thread.line === null ? "" : `:${thread.line}`}
        </Text>
        {thread.isResolved ? (
          <Text className="text-xs font-t3-bold text-adaptive-emerald-700-300">Resolved</Text>
        ) : thread.isOutdated ? (
          <Text className="text-xs font-t3-bold text-foreground-muted">Outdated</Text>
        ) : null}
      </View>
      {thread.comments.map((comment) => (
        <View key={comment.id} className="gap-1">
          <Text className="text-xs font-t3-bold text-foreground">
            @{comment.author?.login ?? "unknown"}
          </Text>
          <PullRequestMarkdown markdown={comment.body} />
        </View>
      ))}
      {props.canComment ? (
        <Text className="text-xs font-t3-medium text-foreground-muted">
          Tap to reply or resolve
        </Text>
      ) : null}
    </Pressable>
  );
});

function Conversation(props: {
  readonly activity: PullRequestActivity | null;
  readonly error: string | null;
  readonly canComment: boolean;
  readonly onOpenThread: (threadId: string) => void;
}) {
  if (props.activity === null) {
    return (
      <Section title="Conversation">
        {props.error ? (
          <Text className="px-4 py-3 text-sm text-foreground-muted">{props.error}</Text>
        ) : (
          <View className="items-center py-4">
            <ActivityIndicator size="small" />
          </View>
        )}
      </Section>
    );
  }
  // Line remarks already appear inside their threads.
  const timeline = props.activity.comments.filter((comment) => comment.kind !== "review-comment");
  const unresolved = props.activity.reviewThreads.filter((thread) => !thread.isResolved).length;
  return (
    <View className="gap-4">
      {props.activity.reviewThreads.length > 0 ? (
        <Section
          title="Review threads"
          trailing={unresolved > 0 ? `${unresolved} unresolved` : "All resolved"}
        >
          {props.activity.reviewThreads.map((thread, index) => (
            <View key={thread.id} className={index > 0 ? "border-t border-border" : undefined}>
              <ReviewThreadCard
                thread={thread}
                canComment={props.canComment}
                onOpen={props.onOpenThread}
              />
            </View>
          ))}
        </Section>
      ) : null}
      <Section
        title="Conversation"
        trailing={
          props.activity.commentsTruncated
            ? `${timeline.length} of ${props.activity.commentCount}`
            : undefined
        }
      >
        {timeline.length === 0 ? (
          <Text className="px-4 py-3 text-sm text-foreground-muted">No comments yet.</Text>
        ) : (
          timeline.map((comment, index) => (
            <View key={comment.id} className={index > 0 ? "border-t border-border" : undefined}>
              <TimelineComment comment={comment} />
            </View>
          ))
        )}
      </Section>
    </View>
  );
}

/**
 * Everything about one pull request except its diff. Lays out as one column on a phone and as
 * a conversation beside a status column once the pane is wide, e.g. an unfolded foldable.
 */
export function PullRequestOverview(props: { readonly target: PullRequestTarget }) {
  const { target } = props;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const { detail, activity, refresh } = usePullRequestDetail(target);
  const pending = usePendingReviewComments(pullRequestReviewKey(target));
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);
  const params = useMemo(() => pullRequestRouteParams(target), [target]);
  const openFiles = useCallback(() => {
    navigation.navigate("PullRequestFiles", params);
  }, [navigation, params]);
  const openReview = useCallback(() => {
    navigation.navigate("PullRequestReview", params);
  }, [navigation, params]);
  const openComment = useCallback(() => {
    navigation.navigate("PullRequestComment", { ...params, mode: "conversation" });
  }, [navigation, params]);
  const openThread = useCallback(
    (threadId: string) => {
      navigation.navigate("PullRequestComment", { ...params, mode: "thread", threadId });
    },
    [navigation, params],
  );

  const data = detail.data;
  const workspaceRoot = data?.workspaceRoot ?? null;
  const media = useMemo(
    () =>
      workspaceRoot === null ? null : { environmentId: target.environmentId, cwd: workspaceRoot },
    [target.environmentId, workspaceRoot],
  );
  if (data === null) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-6" onLayout={handleLayout}>
        {detail.error ? (
          <>
            <Text className="text-base font-t3-bold text-foreground">Pull request unavailable</Text>
            <Text className="text-center text-sm text-foreground-muted">{detail.error}</Text>
            <ControlPill label="Retry" variant="pill" onPress={() => void handleRefresh()} />
          </>
        ) : (
          <ActivityIndicator size="small" />
        )}
      </View>
    );
  }

  const twoColumns = width >= TWO_COLUMN_MIN_WIDTH;
  const stateTone = pullRequestStateTone(data.state, data.isDraft);
  const canReview = data.viewerPermissions.verdicts.length > 0;
  const canComment = data.viewerPermissions.comment;
  const conversation = (
    <Conversation
      activity={activity.data}
      error={activity.error}
      canComment={canComment || data.viewerPermissions.resolve}
      onOpenThread={openThread}
    />
  );

  return (
    <PullRequestMediaContext value={media}>
      <ScrollView
        className="flex-1"
        onLayout={handleLayout}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          gap: 16,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />
        }
      >
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <StatusPill {...stateTone} size="compact" />
            <Text className="min-w-0 flex-1 text-xs text-foreground-muted" numberOfLines={1}>
              {data.repository} #{data.number}
            </Text>
          </View>
          <Text className="text-xl font-t3-bold text-foreground" selectable>
            {data.title}
          </Text>
          <Text className="text-sm text-foreground-muted">
            @{data.author?.login ?? "unknown"} wants to merge{" "}
            <Text className="font-mono text-xs text-foreground">{data.headBranch}</Text> into{" "}
            <Text className="font-mono text-xs text-foreground">{data.baseBranch}</Text>
          </Text>
          <View className="flex-row gap-3">
            <Text className="text-xs font-t3-bold text-adaptive-emerald-700-300">
              +{data.additions}
            </Text>
            <Text className="text-xs font-t3-bold text-adaptive-rose-700-300">
              -{data.deletions}
            </Text>
            <Text className="text-xs text-foreground-muted">
              {data.changedFiles} file{data.changedFiles === 1 ? "" : "s"} · updated{" "}
              {relativeTime(data.updatedAt)} ago
            </Text>
          </View>
        </View>

        <View className="flex-row flex-wrap gap-2">
          <ControlPill
            icon="doc.text"
            label={`Files (${data.changedFiles})`}
            variant="primary"
            onPress={openFiles}
          />
          {canReview ? (
            <ControlPill
              icon="checkmark.circle"
              label={pending.length > 0 ? `Submit review (${pending.length})` : "Review"}
              variant="pill"
              onPress={openReview}
            />
          ) : null}
          {canComment ? (
            <ControlPill icon="text.bubble" label="Comment" variant="pill" onPress={openComment} />
          ) : null}
          <ControlPill
            icon="arrow.up.right"
            accessibilityLabel="Open in browser"
            variant="circle"
            onPress={() => void tryOpenExternalUrl(data.url, "pull-request")}
          />
        </View>

        {twoColumns ? (
          <View className="flex-row items-start gap-4">
            <View className="min-w-0 flex-1 gap-4">
              <Description body={data.body} />
              {conversation}
            </View>
            <View style={{ width: SIDE_COLUMN_WIDTH }}>
              <StatusSections detail={data} />
            </View>
          </View>
        ) : (
          <>
            <Description body={data.body} />
            <StatusSections detail={data} />
            {conversation}
          </>
        )}
      </ScrollView>
    </PullRequestMediaContext>
  );
}

function Description(props: { readonly body: string }) {
  return (
    <Section title="Description">
      <View className="px-4 py-3">
        {props.body.trim().length > 0 ? (
          <PullRequestMarkdown markdown={props.body} />
        ) : (
          <Text className="text-sm text-foreground-muted">No description provided.</Text>
        )}
      </View>
    </Section>
  );
}
