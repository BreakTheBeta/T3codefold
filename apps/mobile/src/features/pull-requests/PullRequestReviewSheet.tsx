import type { PullRequestReviewVerdict } from "@t3tools/contracts";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import * as Cause from "effect/Cause";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { AppText as Text, AppTextInput as TextInput } from "../../components/AppText";
import { ControlPill } from "../../components/ControlPill";
import { SegmentedControl } from "../../components/SegmentedControl";
import { pullRequestEnvironment } from "../../state/pull-requests";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  clearPendingReviewComments,
  removePendingReviewComment,
  usePendingReviewComments,
} from "./pendingReview";
import { REVIEW_VERDICT_LABELS } from "./pullRequestPresentation";
import { PullRequestSheetScaffold } from "./PullRequestSheetScaffold";
import {
  formatReviewPositionLabel,
  pullRequestRefOf,
  pullRequestReviewKey,
  pullRequestTargetFromParams,
  type PullRequestRouteParams,
} from "./pullRequestReview.logic";
import { usePullRequestDetail } from "./usePullRequestData";

/** Send the verdict with every pending line comment as one review. */
export function PullRequestReviewSheet(props: StaticScreenProps<PullRequestRouteParams>) {
  const navigation = useNavigation();
  const { environmentId, projectId, repository, number, host } = props.route.params;
  const target = useMemo(
    () => pullRequestTargetFromParams({ environmentId, projectId, repository, number, host }),
    [environmentId, host, number, projectId, repository],
  );
  const reviewKey = target === null ? "" : pullRequestReviewKey(target);
  const { detail, refresh } = usePullRequestDetail(target);
  const pending = usePendingReviewComments(reviewKey);
  const verdicts = detail.data?.viewerPermissions.verdicts ?? [];
  const [chosenVerdict, setChosenVerdict] = useState<PullRequestReviewVerdict | null>(null);
  const verdict =
    chosenVerdict !== null && verdicts.includes(chosenVerdict)
      ? chosenVerdict
      : verdicts.includes("comment")
        ? "comment"
        : (verdicts[0] ?? null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitReview = useAtomCommand(pullRequestEnvironment.submitReview, {
    reportFailure: false,
  });
  const close = useCallback(() => navigation.goBack(), [navigation]);
  // An approval may be silent; a comment or change request has to say something.
  const needsWords = verdict !== "approve" && pending.length === 0;
  const canSubmit =
    target !== null && verdict !== null && !busy && (!needsWords || body.trim().length > 0);

  const handleSubmit = useCallback(async () => {
    if (target === null || verdict === null) return;
    setBusy(true);
    setError(null);
    const result = await submitReview({
      environmentId: target.environmentId,
      input: {
        ...pullRequestRefOf(target),
        verdict,
        body,
        comments: pending.map(({ id: _id, ...draft }) => draft),
      },
    });
    setBusy(false);
    if (result._tag === "Failure") {
      const failure = Cause.squash(result.cause);
      setError(
        failure instanceof Error && failure.message.trim().length > 0
          ? failure.message
          : "The host refused this review.",
      );
      return;
    }
    clearPendingReviewComments(reviewKey);
    void refresh();
    close();
  }, [body, close, pending, refresh, reviewKey, submitReview, target, verdict]);

  return (
    <PullRequestSheetScaffold
      title="Submit review"
      onClose={close}
      footer={
        <ControlPill
          icon="checkmark.circle"
          label={verdict === null ? "Submit" : REVIEW_VERDICT_LABELS[verdict]}
          variant="primary"
          disabled={!canSubmit}
          onPress={() => void handleSubmit()}
        />
      }
    >
      {detail.data === null ? (
        <Text className="text-sm text-foreground-muted">{detail.error ?? "Loading…"}</Text>
      ) : verdicts.length === 0 || verdict === null ? (
        <Text className="text-sm text-foreground-muted">
          Your account cannot review this pull request.
        </Text>
      ) : (
        <SegmentedControl
          options={verdicts.map((value) => ({ value, label: REVIEW_VERDICT_LABELS[value] }))}
          selected={verdict}
          onSelect={setChosenVerdict}
        />
      )}

      <View className="gap-2">
        <Text className="text-sm font-t3-bold text-foreground">Summary</Text>
        <View className="min-h-[120px] rounded-[20px] border border-border bg-card px-4 py-3">
          <TextInput
            multiline
            placeholder={needsWords ? "Say what needs to change…" : "Optional summary…"}
            textAlignVertical="top"
            value={body}
            onChangeText={setBody}
            className="min-h-[96px] border-0 bg-transparent px-0 py-0 font-sans text-base"
          />
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-t3-bold text-foreground">
          {pending.length === 0
            ? "No line comments"
            : `${pending.length} line comment${pending.length === 1 ? "" : "s"}`}
        </Text>
        {pending.map((draft) => (
          <View
            key={draft.id}
            className="flex-row items-start gap-3 rounded-[20px] border border-border bg-card px-4 py-3"
          >
            <View className="min-w-0 flex-1 gap-1">
              <Text
                className="font-mono text-xs text-foreground-muted"
                ellipsizeMode="middle"
                numberOfLines={1}
              >
                {draft.path} {formatReviewPositionLabel(draft.position)}
              </Text>
              <Text className="text-sm text-foreground" numberOfLines={4}>
                {draft.body}
              </Text>
            </View>
            <ControlPill
              icon="xmark"
              accessibilityLabel="Remove comment"
              variant="circle"
              onPress={() => removePendingReviewComment(reviewKey, draft.id)}
            />
          </View>
        ))}
      </View>
      {error ? <Text className="text-sm text-adaptive-rose-700-300">{error}</Text> : null}
    </PullRequestSheetScaffold>
  );
}
