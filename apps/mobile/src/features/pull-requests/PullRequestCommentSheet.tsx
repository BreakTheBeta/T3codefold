import type { PullRequestReviewThread } from "@t3tools/contracts";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import * as Cause from "effect/Cause";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { AppText as Text, AppTextInput as TextInput } from "../../components/AppText";
import { ControlPill } from "../../components/ControlPill";
import { cn } from "../../lib/cn";
import { pullRequestEnvironment } from "../../state/pull-requests";
import { useAtomCommand } from "../../state/use-atom-command";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import { changeTone, ReviewChangeBar } from "../review/reviewDiffRendering";
import {
  addPendingReviewComment,
  removePendingReviewComment,
  usePendingReviewComments,
} from "./pendingReview";
import { PullRequestMarkdown, PullRequestMediaContext } from "./PullRequestMarkdown";
import { PullRequestSheetScaffold } from "./PullRequestSheetScaffold";
import {
  formatReviewPositionLabel,
  pullRequestRefOf,
  pullRequestReviewKey,
  pullRequestTargetFromParams,
  reviewPositionForLine,
  threadsOnLine,
  type PullRequestDiffLine,
  type PullRequestRouteParams,
} from "./pullRequestReview.logic";
import { usePullRequestDetail } from "./usePullRequestData";

export type PullRequestCommentRouteParams = PullRequestRouteParams & {
  /** A diff line, one review thread, or the conversation as a whole. */
  readonly mode: "line" | "thread" | "conversation";
  readonly threadId?: string;
  readonly path?: string;
  readonly oldPath?: string;
  readonly change?: PullRequestDiffLine["change"];
  readonly oldLine?: number | null;
  readonly newLine?: number | null;
  readonly content?: string;
};

function failureMessage(result: AtomCommandResult<unknown, unknown>): string | null {
  if (result._tag !== "Failure") return null;
  const error = Cause.squash(result.cause);
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "The host refused this change.";
}

function ThreadCard(props: {
  readonly thread: PullRequestReviewThread;
  readonly replying: boolean;
  readonly canReply: boolean;
  readonly canResolve: boolean;
  readonly busy: boolean;
  readonly onReply: () => void;
  readonly onToggleResolved: () => void;
}) {
  const { thread } = props;
  return (
    <View
      className={cn(
        "gap-3 rounded-[20px] border bg-card px-4 py-3",
        props.replying ? "border-primary" : "border-border",
      )}
    >
      {thread.comments.map((comment) => (
        <View key={comment.id} className="gap-1">
          <Text className="text-xs font-t3-bold text-foreground">
            @{comment.author?.login ?? "unknown"}
          </Text>
          <PullRequestMarkdown markdown={comment.body} />
        </View>
      ))}
      <View className="flex-row flex-wrap gap-2">
        {props.canReply ? (
          <ControlPill
            icon="arrow.uturn.backward"
            label={props.replying ? "Replying" : "Reply"}
            variant="pill"
            onPress={props.onReply}
          />
        ) : null}
        {props.canResolve ? (
          <ControlPill
            icon="checkmark.circle"
            label={thread.isResolved ? "Unresolve" : "Resolve"}
            variant="pill"
            disabled={props.busy}
            onPress={props.onToggleResolved}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * Write on a pull request: a new remark on a diff line (added to the pending review, or posted
 * at once), a reply to a review thread, or a comment on the conversation. Threads already on
 * the line are shown so the reader can reply or resolve rather than start a duplicate.
 */
export function PullRequestCommentSheet(props: StaticScreenProps<PullRequestCommentRouteParams>) {
  const navigation = useNavigation();
  const params = props.route.params;
  const { environmentId, projectId, repository, number, host } = params;
  const target = useMemo(
    () => pullRequestTargetFromParams({ environmentId, projectId, repository, number, host }),
    [environmentId, host, number, projectId, repository],
  );
  const reviewKey = target === null ? "" : pullRequestReviewKey(target);
  const { detail, activity, refreshActivity } = usePullRequestDetail(target);
  const pending = usePendingReviewComments(reviewKey);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replyThreadId, setReplyThreadId] = useState<string | null>(
    params.mode === "thread" ? (params.threadId ?? null) : null,
  );
  const commandOptions = { reportFailure: false } as const;
  const comment = useAtomCommand(pullRequestEnvironment.comment, commandOptions);
  const replyToThread = useAtomCommand(pullRequestEnvironment.replyToThread, commandOptions);
  const submitReview = useAtomCommand(pullRequestEnvironment.submitReview, commandOptions);
  const setThreadResolution = useAtomCommand(
    pullRequestEnvironment.setThreadResolution,
    commandOptions,
  );

  const line = useMemo<PullRequestDiffLine | null>(
    () =>
      params.mode === "line" && params.change
        ? {
            change: params.change,
            oldLineNumber: params.oldLine ?? null,
            newLineNumber: params.newLine ?? null,
          }
        : null,
    [params.change, params.mode, params.newLine, params.oldLine],
  );
  const position = line === null ? null : reviewPositionForLine(line);
  const reviewThreads = activity.data?.reviewThreads;
  const threads = useMemo(() => {
    if (!reviewThreads) return [];
    if (params.mode === "thread") {
      return reviewThreads.filter((thread) => thread.id === params.threadId);
    }
    if (line !== null && params.path) return threadsOnLine(reviewThreads, params.path, line);
    return [];
  }, [line, params.mode, params.path, params.threadId, reviewThreads]);
  const pendingOnLine = useMemo(
    () =>
      position === null
        ? []
        : pending.filter(
            (draft) =>
              draft.path === params.path &&
              JSON.stringify(draft.position) === JSON.stringify(position),
          ),
    [params.path, pending, position],
  );

  const media = useMemo(
    () =>
      target === null || detail.data === null
        ? null
        : { environmentId: target.environmentId, cwd: detail.data.workspaceRoot },
    [detail.data, target],
  );
  const permissions = detail.data?.viewerPermissions;
  const canComment = permissions?.comment ?? true;
  const canResolve = permissions?.resolve ?? false;
  const trimmed = body.trim();
  const close = useCallback(() => navigation.goBack(), [navigation]);

  const run = useCallback(
    async (action: () => Promise<AtomCommandResult<unknown, unknown>>) => {
      setBusy(true);
      setError(null);
      const result = await action();
      setBusy(false);
      const message = failureMessage(result);
      if (message !== null) {
        setError(message);
        return false;
      }
      refreshActivity();
      return true;
    },
    [refreshActivity],
  );

  const handleToggleResolved = useCallback(
    (thread: PullRequestReviewThread) => {
      if (target === null) return;
      void run(() =>
        setThreadResolution({
          environmentId: target.environmentId,
          input: { ...pullRequestRefOf(target), threadId: thread.id, resolved: !thread.isResolved },
        }),
      );
    },
    [run, setThreadResolution, target],
  );

  const handleReply = useCallback(async () => {
    if (target === null || replyThreadId === null || trimmed.length === 0) return;
    const ok = await run(() =>
      replyToThread({
        environmentId: target.environmentId,
        input: { ...pullRequestRefOf(target), threadId: replyThreadId, body },
      }),
    );
    if (ok) close();
  }, [body, close, replyThreadId, replyToThread, run, target, trimmed.length]);

  const lineDraft =
    position !== null && params.path
      ? {
          path: params.path,
          ...(params.oldPath ? { oldPath: params.oldPath } : {}),
          position,
          body,
        }
      : null;

  const handleAddToReview = useCallback(() => {
    if (lineDraft === null || trimmed.length === 0) return;
    addPendingReviewComment(reviewKey, lineDraft);
    close();
  }, [close, lineDraft, reviewKey, trimmed.length]);

  const handlePostNow = useCallback(async () => {
    if (target === null || lineDraft === null || trimmed.length === 0) return;
    const ok = await run(() =>
      submitReview({
        environmentId: target.environmentId,
        input: { ...pullRequestRefOf(target), verdict: "comment", body: "", comments: [lineDraft] },
      }),
    );
    if (ok) close();
  }, [close, lineDraft, run, submitReview, target, trimmed.length]);

  const handleComment = useCallback(async () => {
    if (target === null || trimmed.length === 0) return;
    const ok = await run(() =>
      comment({
        environmentId: target.environmentId,
        input: { ...pullRequestRefOf(target), body },
      }),
    );
    if (ok) close();
  }, [body, close, comment, run, target, trimmed.length]);

  const title =
    params.mode === "conversation"
      ? "Comment"
      : params.mode === "thread"
        ? "Thread"
        : "Line comment";
  const disabled = busy || trimmed.length === 0 || target === null;

  let footer;
  if (replyThreadId !== null) {
    footer = (
      <>
        {params.mode === "line" ? (
          <ControlPill label="New comment" variant="pill" onPress={() => setReplyThreadId(null)} />
        ) : null}
        <ControlPill
          icon="arrow.up"
          label="Reply"
          variant="primary"
          disabled={disabled}
          onPress={() => void handleReply()}
        />
      </>
    );
  } else if (params.mode === "line") {
    footer = (
      <>
        <ControlPill
          label="Post now"
          variant="pill"
          disabled={disabled || lineDraft === null}
          onPress={() => void handlePostNow()}
        />
        <ControlPill
          icon="plus"
          label="Add to review"
          variant="primary"
          disabled={disabled || lineDraft === null}
          onPress={handleAddToReview}
        />
      </>
    );
  } else {
    footer = (
      <ControlPill
        icon="arrow.up"
        label="Comment"
        variant="primary"
        disabled={disabled}
        onPress={() => void handleComment()}
      />
    );
  }

  return (
    <PullRequestMediaContext value={media}>
      <PullRequestSheetScaffold title={title} onClose={close} footer={footer}>
        {params.mode === "line" && params.path ? (
          <View className="gap-2">
            <Text
              className="px-1 font-mono text-xs text-foreground-muted"
              ellipsizeMode="middle"
              numberOfLines={2}
            >
              {params.path}
              {position === null ? "" : ` ${formatReviewPositionLabel(position)}`}
            </Text>
            {line !== null ? (
              <View
                className={cn(
                  "flex-row items-stretch overflow-hidden rounded-[16px] border border-border",
                  changeTone(line.change),
                )}
              >
                <ReviewChangeBar change={line.change} height={28} />
                <Text
                  className="flex-1 px-2 py-1.5 font-mono text-xs text-foreground"
                  numberOfLines={3}
                >
                  {params.content ?? ""}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {params.mode !== "conversation" && activity.data === null && !activity.error ? (
          <Text className="text-xs text-foreground-muted">Loading threads…</Text>
        ) : null}
        {threads.map((thread) => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            replying={replyThreadId === thread.id}
            canReply={canComment}
            canResolve={canResolve}
            busy={busy}
            onReply={() => setReplyThreadId(thread.id)}
            onToggleResolved={() => handleToggleResolved(thread)}
          />
        ))}

        {pendingOnLine.map((draft) => (
          <View
            key={draft.id}
            className="gap-2 rounded-[20px] border border-border bg-card px-4 py-3"
          >
            <Text className="text-xs font-t3-bold uppercase text-foreground-muted">Pending</Text>
            <PullRequestMarkdown markdown={draft.body} />
            <View className="flex-row">
              <ControlPill
                label="Remove"
                variant="danger"
                onPress={() => removePendingReviewComment(reviewKey, draft.id)}
              />
            </View>
          </View>
        ))}

        {canComment ? (
          <View className="gap-2">
            <Text className="text-sm font-t3-bold text-foreground">
              {replyThreadId !== null
                ? "Reply"
                : params.mode === "line"
                  ? "New comment"
                  : "Comment"}
            </Text>
            <View className="min-h-[132px] rounded-[20px] border border-border bg-card px-4 py-3">
              <TextInput
                autoFocus={threads.length === 0}
                multiline
                placeholder="Leave a comment…"
                textAlignVertical="top"
                value={body}
                onChangeText={setBody}
                className="min-h-[108px] border-0 bg-transparent px-0 py-0 font-sans text-base"
              />
            </View>
          </View>
        ) : (
          <Text className="text-sm text-foreground-muted">
            Your account cannot comment on this pull request.
          </Text>
        )}
        {error ? <Text className="text-sm text-adaptive-rose-700-300">{error}</Text> : null}
      </PullRequestSheetScaffold>
    </PullRequestMediaContext>
  );
}
