import { useAtomValue } from "@effect/atom-react";
import type { PullRequestReviewCommentDraft } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import { appAtomRegistry } from "../../state/atom-registry";
import type { PullRequestPendingComment } from "./pullRequestReview.logic";

/**
 * Line comments written but not sent. They travel with the verdict in one review, so nobody
 * sees a half-finished review. Kept in memory for the session, keyed by `pullRequestReviewKey`.
 */
const pendingReviewAtom = Atom.family((key: string) =>
  Atom.make<ReadonlyArray<PullRequestPendingComment>>([]).pipe(
    Atom.keepAlive,
    Atom.withLabel(`mobile:pull-request-pending-review:${key}`),
  ),
);

let nextPendingCommentId = 0;

export function usePendingReviewComments(key: string): ReadonlyArray<PullRequestPendingComment> {
  return useAtomValue(pendingReviewAtom(key));
}

export function getPendingReviewComments(key: string): ReadonlyArray<PullRequestPendingComment> {
  return appAtomRegistry.get(pendingReviewAtom(key));
}

export function addPendingReviewComment(key: string, draft: PullRequestReviewCommentDraft) {
  nextPendingCommentId += 1;
  const comment = { ...draft, id: String(nextPendingCommentId) };
  appAtomRegistry.update(pendingReviewAtom(key), (current) => [...current, comment]);
}

export function removePendingReviewComment(key: string, id: string) {
  appAtomRegistry.update(pendingReviewAtom(key), (current) =>
    current.filter((comment) => comment.id !== id),
  );
}

export function clearPendingReviewComments(key: string) {
  appAtomRegistry.set(pendingReviewAtom(key), []);
}
