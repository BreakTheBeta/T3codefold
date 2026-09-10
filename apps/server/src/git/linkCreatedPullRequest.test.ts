import {
  ProjectId,
  type GitRunStackedActionResult,
  type OrchestrationProjectShell,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { createdPullRequestKey } from "./linkCreatedPullRequest.ts";

const PROJECT_ID = ProjectId.make("project-1");

const project: OrchestrationProjectShell = {
  id: PROJECT_ID,
  title: "Project",
  workspaceRoot: "/workspace/project",
  defaultModelSelection: null,
  scripts: [],
  repositoryIdentity: {
    canonicalKey: "github.acme.test/platform/api",
    locator: {
      source: "git-remote",
      remoteName: "origin",
      remoteUrl: "git@github.acme.test:Platform/API.git",
    },
    provider: "github",
    displayName: "Platform/API",
    owner: "Platform",
    name: "API",
  },
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function prResult(pr: GitRunStackedActionResult["pr"]): Pick<GitRunStackedActionResult, "pr"> {
  return { pr };
}

describe("createdPullRequestKey", () => {
  it("reads host and repository from the URL when it is recognisable", () => {
    expect(
      createdPullRequestKey(
        prResult({
          status: "created",
          number: 12,
          url: "https://github.com/Other/Fork/pull/12",
        }),
        project,
      ),
    ).toEqual({
      host: "github.com",
      repository: "other/fork",
      number: 12,
      url: "https://github.com/Other/Fork/pull/12",
    });
  });

  it("falls back to the project's host and repository for an unreadable URL", () => {
    expect(
      createdPullRequestKey(
        prResult({ status: "opened_existing", number: 3, url: "https://ghe.internal/x/3" }),
        project,
      ),
    ).toEqual({
      host: "github.acme.test",
      repository: "platform/api",
      number: 3,
      url: "https://ghe.internal/x/3",
    });
    expect(
      createdPullRequestKey(
        prResult({ status: "created", number: 3, url: "https://ghe.internal/x/3" }),
        undefined,
      ),
    ).toBeNull();
  });

  it("yields nothing when no pull request came out of the action", () => {
    expect(
      createdPullRequestKey(prResult({ status: "skipped_not_requested" }), project),
    ).toBeNull();
    expect(
      createdPullRequestKey(
        prResult({ status: "created", url: "https://github.com/a/b/pull/1" }),
        project,
      ),
    ).toBeNull();
    expect(createdPullRequestKey(prResult({ status: "created", number: 1 }), project)).toBeNull();
  });
});
