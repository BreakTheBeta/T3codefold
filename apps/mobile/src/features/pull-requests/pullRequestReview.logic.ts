import {
  EnvironmentId,
  ProjectId,
  type PullRequestListEntry,
  type PullRequestRef,
  type PullRequestReviewCommentDraft,
  type PullRequestReviewPosition,
  type PullRequestReviewThread,
} from "@t3tools/contracts";

import type { ReviewInlineComment } from "../review/reviewCommentSelection";
import type { ReviewRenderableFile, ReviewRenderableLineRow } from "../review/reviewModel";

/** One pull request as a route addresses it: which environment asks, and which PR. */
export interface PullRequestTarget {
  readonly environmentId: EnvironmentId;
  readonly projectId: PullRequestRef["projectId"];
  readonly host?: string;
  readonly repository: string;
  readonly number: number;
}

/** Route params stay strings: deep links hand every segment over as text. */
// A type alias, not an interface: navigation params must be assignable to a string record.
export type PullRequestRouteParams = {
  readonly environmentId: string;
  readonly projectId: string;
  readonly repository: string;
  readonly number: string;
  readonly host?: string;
};

export function pullRequestRouteParams(target: PullRequestTarget): PullRequestRouteParams {
  return {
    environmentId: String(target.environmentId),
    projectId: String(target.projectId),
    repository: target.repository,
    number: String(target.number),
    ...(target.host === undefined ? {} : { host: target.host }),
  };
}

export function pullRequestTargetFromParams(
  params: Partial<PullRequestRouteParams> | undefined,
): PullRequestTarget | null {
  const number = Number(params?.number);
  if (
    !params?.environmentId ||
    !params.projectId ||
    !params.repository ||
    !Number.isSafeInteger(number) ||
    number <= 0
  ) {
    return null;
  }
  return {
    environmentId: EnvironmentId.make(params.environmentId),
    projectId: ProjectId.make(params.projectId),
    repository: params.repository,
    number,
    ...(params.host ? { host: params.host } : {}),
  };
}

export function pullRequestRefOf(target: PullRequestTarget): PullRequestRef {
  return {
    projectId: target.projectId,
    ...(target.host === undefined ? {} : { host: target.host }),
    repository: target.repository,
    number: target.number,
  };
}

/** Stable across environments: the same PR reviewed from two hosts shares one pending review. */
export function pullRequestReviewKey(target: Pick<PullRequestTarget, "repository" | "number">) {
  return `${target.repository.toLowerCase()}#${target.number}`;
}

export type PullRequestListRow = PullRequestListEntry & { readonly environmentId: EnvironmentId };

export type PullRequestListGroupKey = "review-requested" | "authored" | "others";

export interface PullRequestListGroup {
  readonly key: PullRequestListGroupKey;
  readonly title: string;
  readonly rows: ReadonlyArray<PullRequestListRow>;
}

const GROUP_TITLES: Record<PullRequestListGroupKey, string> = {
  "review-requested": "Needs your review",
  authored: "Yours",
  others: "Everything else",
};

/**
 * Several environments can list the same repository; the first environment to answer owns the
 * row, so a PR never shows twice. Groups put the work waiting on the reader first.
 */
export function groupPullRequestRows(
  lists: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly entries: ReadonlyArray<PullRequestListEntry>;
    readonly viewers: Readonly<Record<string, string>>;
  }>,
): ReadonlyArray<PullRequestListGroup> {
  const seen = new Set<string>();
  const buckets: Record<PullRequestListGroupKey, PullRequestListRow[]> = {
    "review-requested": [],
    authored: [],
    others: [],
  };
  for (const list of lists) {
    for (const entry of list.entries) {
      const key = `${entry.host.toLowerCase()} ${pullRequestReviewKey(entry)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const viewer = list.viewers[entry.host];
      const authored =
        viewer !== undefined && entry.author?.login.toLowerCase() === viewer.toLowerCase();
      const bucket = authored
        ? "authored"
        : entry.viewerReviewRequested
          ? "review-requested"
          : "others";
      buckets[bucket].push({ ...entry, environmentId: list.environmentId });
    }
  }
  return (["review-requested", "authored", "others"] as const)
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({
      key,
      title: GROUP_TITLES[key],
      rows: [...buckets[key]].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    }));
}

/** Reads `https://<host>/<owner>/<repo>/pull/<n>`, which is every GitHub PR URL. */
export function parsePullRequestUrl(
  url: string,
): { readonly host: string; readonly repository: string; readonly number: number } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const match = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/.exec(parsed.pathname);
  if (!match) return null;
  const number = Number(match[3]);
  if (!Number.isSafeInteger(number) || number <= 0) return null;
  return { host: parsed.hostname, repository: `${match[1]}/${match[2]}`, number };
}

export type PullRequestDiffLine = Pick<
  ReviewRenderableLineRow,
  "change" | "oldLineNumber" | "newLineNumber"
>;

/** Where a line of the unified diff sits in GitHub's terms, which is what a comment is sent with. */
export function reviewPositionForLine(line: PullRequestDiffLine): PullRequestReviewPosition | null {
  if (line.change === "add") {
    return line.newLineNumber === null ? null : { kind: "added", newLine: line.newLineNumber };
  }
  if (line.change === "delete") {
    return line.oldLineNumber === null ? null : { kind: "deleted", oldLine: line.oldLineNumber };
  }
  if (line.oldLineNumber === null || line.newLineNumber === null) return null;
  return {
    kind: "context",
    oldLine: line.oldLineNumber,
    newLine: line.newLineNumber,
    side: "right",
  };
}

interface LineAnchor {
  readonly side: "left" | "right";
  readonly line: number;
}

function anchorOfPosition(position: PullRequestReviewPosition): LineAnchor {
  if (position.kind === "added") return { side: "right", line: position.newLine };
  if (position.kind === "deleted") return { side: "left", line: position.oldLine };
  return position.side === "left"
    ? { side: "left", line: position.oldLine }
    : { side: "right", line: position.newLine };
}

function findAnchoredLineIndex(
  lines: ReadonlyArray<PullRequestDiffLine>,
  anchor: LineAnchor,
): number {
  return lines.findIndex((line) =>
    anchor.side === "right"
      ? line.change !== "delete" && line.newLineNumber === anchor.line
      : line.change !== "add" && line.oldLineNumber === anchor.line,
  );
}

export function formatReviewPositionLabel(position: PullRequestReviewPosition): string {
  const anchor = anchorOfPosition(position);
  return anchor.side === "left" ? `-${anchor.line}` : `+${anchor.line}`;
}

export interface PullRequestPendingComment extends PullRequestReviewCommentDraft {
  readonly id: string;
}

/**
 * Review threads and unsent comments, pinned under the diff line they belong to. A thread whose
 * line has left the diff is not pinned anywhere; the conversation still lists it.
 */
export function buildPullRequestInlineComments(input: {
  readonly files: ReadonlyArray<ReviewRenderableFile>;
  readonly threads: ReadonlyArray<PullRequestReviewThread>;
  readonly pending: ReadonlyArray<PullRequestPendingComment>;
}): ReadonlyArray<ReviewInlineComment> {
  const linesByPath = new Map(
    input.files.map((file) => [
      file.path,
      file.rows.filter((row): row is ReviewRenderableLineRow => row.kind === "line"),
    ]),
  );
  const comments: ReviewInlineComment[] = [];
  const pin = (
    path: string,
    anchor: LineAnchor,
    comment: Omit<ReviewInlineComment, "filePath" | "startIndex" | "endIndex" | "sectionId">,
  ) => {
    const lines = linesByPath.get(path);
    if (!lines) return;
    const index = findAnchoredLineIndex(lines, anchor);
    if (index < 0) return;
    comments.push({
      ...comment,
      sectionId: "pull-request",
      filePath: path,
      startIndex: index,
      endIndex: index,
    });
  };
  for (const thread of input.threads) {
    if (thread.isOutdated || thread.line === null) continue;
    const first = thread.comments[0];
    const author = first?.author?.login ?? "unknown";
    const replies = thread.comments.length - 1;
    pin(
      thread.path,
      { side: thread.side, line: thread.line },
      {
        id: `thread:${thread.id}`,
        sectionTitle: [
          `@${author}`,
          replies > 0 ? `${replies} ${replies === 1 ? "reply" : "replies"}` : null,
          thread.isResolved ? "resolved" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        rangeLabel: `${thread.side === "left" ? "-" : "+"}${thread.line}`,
        text: thread.comments
          .map((comment, index) =>
            index === 0 ? comment.body : `@${comment.author?.login ?? "unknown"}: ${comment.body}`,
          )
          .join("\n\n"),
        diff: "",
      },
    );
  }
  for (const comment of input.pending) {
    pin(comment.path, anchorOfPosition(comment.position), {
      id: `pending:${comment.id}`,
      sectionTitle: "Pending",
      rangeLabel: formatReviewPositionLabel(comment.position),
      text: comment.body,
      diff: "",
    });
  }
  return comments;
}

/** The review threads that sit on one diff line, so tapping it can show them. */
export function threadsOnLine(
  threads: ReadonlyArray<PullRequestReviewThread>,
  path: string,
  line: PullRequestDiffLine,
): ReadonlyArray<PullRequestReviewThread> {
  return threads.filter(
    (thread) =>
      !thread.isOutdated &&
      thread.path === path &&
      thread.line !== null &&
      findAnchoredLineIndex([line], { side: thread.side, line: thread.line }) === 0,
  );
}
