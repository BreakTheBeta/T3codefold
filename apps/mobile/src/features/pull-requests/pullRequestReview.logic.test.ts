import { describe, expect, it } from "vite-plus/test";

import {
  EnvironmentId,
  ProjectId,
  type PullRequestListEntry,
  type PullRequestReviewThread,
} from "@t3tools/contracts";

import { buildReviewParsedDiff, type ReviewRenderableLineRow } from "../review/reviewModel";
import {
  buildPullRequestInlineComments,
  groupPullRequestRows,
  parsePullRequestUrl,
  reviewPositionForLine,
  threadsOnLine,
} from "./pullRequestReview.logic";

const PATCH = [
  "diff --git a/src/app.ts b/src/app.ts",
  "index 1111111..2222222 100644",
  "--- a/src/app.ts",
  "+++ b/src/app.ts",
  "@@ -1,3 +1,3 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  " const c = 4;",
  "",
].join("\n");

function parsedFiles() {
  const parsed = buildReviewParsedDiff(PATCH, "test");
  if (parsed.kind !== "files") throw new Error("expected a parsed diff");
  return parsed.files;
}

function lineRows() {
  return parsedFiles()[0]!.rows.filter(
    (row): row is ReviewRenderableLineRow => row.kind === "line",
  );
}

function thread(input: Partial<PullRequestReviewThread>): PullRequestReviewThread {
  return {
    id: "t1",
    path: "src/app.ts",
    line: 2,
    side: "right",
    isResolved: false,
    isOutdated: false,
    comments: [
      {
        id: "c1",
        author: { login: "octocat", name: null, avatarUrl: null },
        body: "Why three?",
        createdAt: "2026-09-20T00:00:00.000Z",
        url: null,
      },
    ],
    ...input,
  };
}

function entry(input: Partial<PullRequestListEntry>): PullRequestListEntry {
  return {
    provider: "github",
    host: "github.com",
    projectId: ProjectId.make("project"),
    projectTitle: "Project",
    repository: "acme/app",
    number: 1,
    title: "Change",
    url: "https://github.com/acme/app/pull/1",
    author: { login: "someone", name: null, avatarUrl: null },
    headBranch: "feature",
    baseBranch: "main",
    state: "open",
    isDraft: false,
    mergeability: "mergeable",
    additions: 0,
    deletions: 0,
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
    viewerReviewRequested: false,
    labels: [],
    ...input,
  } as PullRequestListEntry;
}

describe("reviewPositionForLine", () => {
  it("addresses added, deleted, and unchanged lines the way GitHub expects", () => {
    const [context, deleted, added] = lineRows();
    expect(reviewPositionForLine(context!)).toEqual({
      kind: "context",
      oldLine: 1,
      newLine: 1,
      side: "right",
    });
    expect(reviewPositionForLine(deleted!)).toEqual({ kind: "deleted", oldLine: 2 });
    expect(reviewPositionForLine(added!)).toEqual({ kind: "added", newLine: 2 });
  });
});

describe("buildPullRequestInlineComments", () => {
  it("pins a thread under its line and a pending comment under the line it was written on", () => {
    const comments = buildPullRequestInlineComments({
      files: parsedFiles(),
      threads: [thread({})],
      pending: [
        {
          id: "p1",
          path: "src/app.ts",
          position: { kind: "deleted", oldLine: 2 },
          body: "Keep two",
        },
      ],
    });
    // Line rows are: context(1), delete(old 2), add(new 2), context(3).
    expect(comments.map((comment) => [comment.id, comment.endIndex])).toEqual([
      ["thread:t1", 2],
      ["pending:p1", 1],
    ]);
    expect(comments[0]!.sectionTitle).toBe("@octocat");
  });

  it("does not pin outdated threads or threads on files outside the diff", () => {
    const comments = buildPullRequestInlineComments({
      files: parsedFiles(),
      threads: [thread({ isOutdated: true }), thread({ id: "t2", path: "other.ts" })],
      pending: [],
    });
    expect(comments).toEqual([]);
  });
});

describe("threadsOnLine", () => {
  it("finds a thread by the side it was written on", () => {
    const [, deleted, added] = lineRows();
    const threads = [thread({}), thread({ id: "t2", side: "left" })];
    expect(threadsOnLine(threads, "src/app.ts", added!).map((item) => item.id)).toEqual(["t1"]);
    expect(threadsOnLine(threads, "src/app.ts", deleted!).map((item) => item.id)).toEqual(["t2"]);
  });
});

describe("parsePullRequestUrl", () => {
  it("reads host, repository, and number from a PR URL", () => {
    expect(parsePullRequestUrl("https://github.com/acme/app/pull/42/files")).toEqual({
      host: "github.com",
      repository: "acme/app",
      number: 42,
    });
    expect(parsePullRequestUrl("https://github.com/acme/app/issues/42")).toBeNull();
    expect(parsePullRequestUrl("not a url")).toBeNull();
  });
});

describe("groupPullRequestRows", () => {
  it("puts review requests first, then the reader's own, and lists a PR once", () => {
    const first = EnvironmentId.make("first");
    const second = EnvironmentId.make("second");
    const groups = groupPullRequestRows([
      {
        environmentId: first,
        viewers: { "github.com": "me" },
        entries: [
          entry({ number: 1, author: { login: "Me", name: null, avatarUrl: null } }),
          entry({ number: 2, viewerReviewRequested: true }),
        ],
      },
      {
        environmentId: second,
        viewers: {},
        entries: [entry({ number: 2, viewerReviewRequested: true }), entry({ number: 3 })],
      },
    ]);
    expect(
      groups.map((group) => [group.key, group.rows.map((row) => [row.number, row.environmentId])]),
    ).toEqual([
      ["review-requested", [[2, first]]],
      ["authored", [[1, first]]],
      ["others", [[3, second]]],
    ]);
  });
});
