import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { PullRequestInvolvement, PullRequestListState } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

import { pullRequestEnvironment } from "../../state/pull-requests";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { useWorkspaceState } from "../../state/workspace";
import {
  groupPullRequestRows,
  pullRequestRefOf,
  type PullRequestListGroup,
  type PullRequestTarget,
} from "./pullRequestReview.logic";

const LIST_LIMIT = 50;
/** Past this much patch the phone stops fetching further slices until asked. */
const AUTO_LOAD_PATCH_CHARACTERS = 4 * 1024 * 1024;
const FIRST_SLICE: ReadonlyArray<string | null> = [null];

function errorMessage(result: AsyncResult.AsyncResult<unknown, unknown>): string | null {
  if (result._tag !== "Failure") return null;
  const error = Cause.squash(result.cause);
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "The environment request failed.";
}

/** Every connected environment's open pull requests, merged and grouped. */
export function usePullRequestList(input: {
  readonly state: PullRequestListState;
  readonly involvement: PullRequestInvolvement;
}) {
  const registry = useContext(RegistryContext);
  const { environments } = useWorkspaceState();
  const environmentIds = useMemo(
    () =>
      environments
        .filter((environment) => environment.connectionState === "connected")
        .map((environment) => environment.environmentId),
    [environments],
  );
  const queries = useMemo(
    () =>
      environmentIds.map((environmentId) =>
        pullRequestEnvironment.list({
          environmentId,
          input: { state: input.state, involvement: input.involvement, limit: LIST_LIMIT },
        }),
      ),
    [environmentIds, input.involvement, input.state],
  );
  const results = useAtomValue(
    useMemo(() => Atom.make((get) => queries.map((query) => get(query))), [queries]),
  );
  const groups = useMemo<ReadonlyArray<PullRequestListGroup>>(
    () =>
      groupPullRequestRows(
        results.flatMap((result, index) => {
          const value = Option.getOrNull(AsyncResult.value(result));
          const environmentId = environmentIds[index];
          return value === null || environmentId === undefined
            ? []
            : [{ environmentId, entries: value.entries, viewers: value.viewers }];
        }),
      ),
    [environmentIds, results],
  );
  const errors = useMemo(
    () =>
      results.flatMap((result) => {
        const value = Option.getOrNull(AsyncResult.value(result));
        return [
          ...(errorMessage(result) === null ? [] : [errorMessage(result)!]),
          ...(value?.errors.map((error) => `${error.projectTitle}: ${error.message}`) ?? []),
          ...(value?.providers
            .filter((provider) => !provider.configured)
            .map((provider) => `${provider.host}: ${provider.detail ?? "not signed in"}`) ?? []),
        ];
      }),
    [results],
  );
  const invalidate = useAtomCommand(pullRequestEnvironment.invalidate, {
    label: "pull request list refresh",
    reportFailure: false,
  });
  const refresh = useCallback(async () => {
    // Forget the host's cached listing first, so a pull is a real re-read.
    await Promise.all(
      environmentIds.map((environmentId) => invalidate({ environmentId, input: {} })),
    );
    for (const query of queries) registry.refresh(query);
  }, [environmentIds, invalidate, queries, registry]);

  return {
    groups,
    errors,
    hasEnvironments: environmentIds.length > 0,
    isPending: results.some((result) => result._tag === "Initial" || result.waiting),
    refresh,
  };
}

export function usePullRequestDetail(target: PullRequestTarget | null) {
  const detail = useEnvironmentQuery(
    useMemo(
      () =>
        target === null
          ? null
          : pullRequestEnvironment.detail({
              environmentId: target.environmentId,
              input: pullRequestRefOf(target),
            }),
      [target],
    ),
  );
  const activity = useEnvironmentQuery(
    useMemo(
      () =>
        target === null
          ? null
          : pullRequestEnvironment.activity({
              environmentId: target.environmentId,
              input: pullRequestRefOf(target),
            }),
      [target],
    ),
  );
  const invalidate = useAtomCommand(pullRequestEnvironment.invalidate, {
    label: "pull request refresh",
    reportFailure: false,
  });
  const refreshDetail = detail.refresh;
  const refreshActivity = activity.refresh;
  const refresh = useCallback(async () => {
    if (target === null) return;
    await invalidate({
      environmentId: target.environmentId,
      input: { reference: pullRequestRefOf(target) },
    });
    refreshDetail();
    refreshActivity();
  }, [invalidate, refreshActivity, refreshDetail, target]);
  return { detail, activity, refresh, refreshActivity };
}

/**
 * The whole patch, a slice at a time. Slices keep arriving until the diff is whole or it is
 * large enough that a phone should stop and ask.
 */
export function usePullRequestDiff(target: PullRequestTarget | null) {
  const registry = useContext(RegistryContext);
  const scope =
    target === null ? "" : JSON.stringify([target.environmentId, pullRequestRefOf(target)]);
  const [cursorState, setCursorState] = useState<{
    readonly scope: string;
    readonly cursors: ReadonlyArray<string | null>;
  }>({ scope, cursors: FIRST_SLICE });
  const cursors = cursorState.scope === scope ? cursorState.cursors : FIRST_SLICE;
  const queries = useMemo(
    () =>
      target === null
        ? []
        : cursors.map((cursor) =>
            pullRequestEnvironment.diff({
              environmentId: target.environmentId,
              input: { ...pullRequestRefOf(target), ...(cursor === null ? {} : { cursor }) },
            }),
          ),
    [cursors, target],
  );
  const results = useAtomValue(
    useMemo(() => Atom.make((get) => queries.map((query) => get(query))), [queries]),
  );
  const slices = useMemo(
    () =>
      results.flatMap((result) => {
        const value = Option.getOrNull(AsyncResult.value(result));
        return value === null ? [] : [value];
      }),
    [results],
  );
  const patch = useMemo(() => slices.map((slice) => slice.patch).join("\n"), [slices]);
  const last = results.at(-1);
  const lastValue = last === undefined ? null : Option.getOrNull(AsyncResult.value(last));
  const nextCursor = lastValue?.nextCursor ?? null;
  const complete = slices.length === results.length && nextCursor === null;
  const loadMore = useCallback(() => {
    if (nextCursor === null) return;
    setCursorState({ scope, cursors: [...cursors, nextCursor] });
  }, [cursors, nextCursor, scope]);
  const shouldAutoLoad =
    nextCursor !== null &&
    !cursors.includes(nextCursor) &&
    patch.length < AUTO_LOAD_PATCH_CHARACTERS;
  useEffect(() => {
    if (shouldAutoLoad) loadMore();
  }, [loadMore, shouldAutoLoad]);
  const refresh = useCallback(() => {
    setCursorState({ scope, cursors: FIRST_SLICE });
    const first = queries[0];
    if (first) registry.refresh(first);
  }, [queries, registry, scope]);
  const failure = results.find((result) => result._tag === "Failure");

  return {
    patch,
    complete,
    truncated: slices.some((slice) => slice.truncated),
    omittedFileStats: slices.flatMap((slice) => slice.omittedFileStats ?? []),
    canLoadMore: nextCursor !== null && !cursors.includes(nextCursor),
    loadMore,
    refresh,
    error: failure === undefined ? null : errorMessage(failure),
    isPending: results.some((result) => result._tag === "Initial" || result.waiting),
  };
}

/** Which files the reader has marked viewed on the host, and the way to mark one. */
export function usePullRequestFilesViewed(target: PullRequestTarget | null) {
  const viewed = useEnvironmentQuery(
    useMemo(
      () =>
        target === null
          ? null
          : pullRequestEnvironment.filesViewed({
              environmentId: target.environmentId,
              input: pullRequestRefOf(target),
            }),
      [target],
    ),
  );
  // Presses show at once; the host's answer replaces them when the read comes back.
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());
  const setFilesViewed = useAtomCommand(pullRequestEnvironment.setFilesViewed, "mark file viewed");
  const refreshViewed = viewed.refresh;
  const viewedPaths = useMemo(() => {
    const paths = new Set(
      (viewed.data?.files ?? []).filter((file) => file.state === "viewed").map((file) => file.path),
    );
    for (const [path, isViewed] of overrides) {
      if (isViewed) paths.add(path);
      else paths.delete(path);
    }
    return Array.from(paths);
  }, [overrides, viewed.data]);
  const toggleViewed = useCallback(
    async (path: string) => {
      if (target === null) return;
      const next = !viewedPaths.includes(path);
      setOverrides((current) => new Map(current).set(path, next));
      const result = await setFilesViewed({
        environmentId: target.environmentId,
        input: { ...pullRequestRefOf(target), files: [{ path, viewed: next }] },
      });
      if (result._tag === "Success") refreshViewed();
      setOverrides((current) => {
        const updated = new Map(current);
        updated.delete(path);
        return updated;
      });
    },
    [refreshViewed, setFilesViewed, target, viewedPaths],
  );
  return { viewedPaths, toggleViewed };
}
