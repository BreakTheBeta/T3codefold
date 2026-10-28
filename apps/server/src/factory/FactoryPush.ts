import { FactoryError, type FactoryActionEnvelope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { ProcessRunner, type ProcessRunOutput } from "../processRunner.ts";

type PushRequest = Extract<FactoryActionEnvelope["request"], { readonly type: "push" }>;
const complete = (result: ProcessRunOutput) =>
  !result.timedOut &&
  !result.stdoutTruncated &&
  !result.stderrTruncated &&
  !result.stdoutInvalidUtf8 &&
  !result.stderrInvalidUtf8;
const oid = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;

export const prepareFactoryPush = Effect.fn("FactoryActions.preparePush")(function* (
  input: Pick<FactoryActionEnvelope, "repository" | "target"> & { readonly request: PushRequest },
  cwd: string,
) {
  const runner = yield* ProcessRunner;
  const fs = yield* FileSystem.FileSystem;
  const { request, repository, target } = input;
  const invalid = () =>
    new FactoryError({
      code: "invalid",
      detail:
        "Push requires a clean approved local head, matching repository/ref and exact remote state; only fast-forwards or explicitly absent new refs are allowed.",
    });
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    target !== request.destinationRef ||
    !oid.test(request.newOid) ||
    (request.expectedOldOid !== null &&
      (!oid.test(request.expectedOldOid) || request.expectedOldOid === request.newOid)) ||
    !request.sourceRef.startsWith("refs/heads/") ||
    !request.destinationRef.startsWith("refs/heads/")
  )
    return yield* invalid();
  const run = Effect.fn("FactoryActions.pushRead")((args: readonly string[]) =>
    runner
      .run({
        command: "git",
        args: ["--no-replace-objects", ...args],
        cwd,
        timeout: "30 seconds",
        maxOutputBytes: 16_384,
        outputMode: "truncate",
        env: { GIT_NO_REPLACE_OBJECTS: "1" },
      })
      .pipe(Effect.mapError(() => invalid())),
  );
  const checked = Effect.fn("FactoryActions.pushCheckedRead")(function* (args: readonly string[]) {
    const result = yield* run(args);
    if (result.code !== 0 || !complete(result)) return yield* invalid();
    return result.stdout.trim();
  });
  yield* checked(["check-ref-format", request.sourceRef]);
  yield* checked(["check-ref-format", request.destinationRef]);
  const localHead = Effect.fn("FactoryActions.pushLocalHead")(function* () {
    if (
      (yield* checked(["symbolic-ref", "--quiet", "HEAD"])) !== request.sourceRef ||
      (yield* checked(["rev-parse", "--verify", "HEAD"])) !== request.newOid ||
      (yield* checked(["rev-parse", "--verify", request.sourceRef])) !== request.newOid ||
      (yield* checked(["cat-file", "-t", request.newOid])) !== "commit" ||
      (yield* checked(["status", "--porcelain=v1", "--untracked-files=normal"])) !== ""
    )
      return yield* invalid();
  });
  yield* localHead();
  const url = `https://github.com/${repository}.git`;
  const origin = yield* checked(["remote", "get-url", "--push", "origin"]);
  const originRepo =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^\s]+?)(?:\.git)?\/?$/.exec(
      origin,
    )?.[1];
  if (
    originRepo?.toLowerCase() !== repository.toLowerCase() ||
    (yield* checked(["ls-remote", "--get-url", url])) !== url
  )
    return yield* invalid();
  const graftPath = yield* checked([
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "info/grafts",
  ]);
  if (yield* fs.exists(graftPath).pipe(Effect.mapError(() => invalid()))) return yield* invalid();
  if (request.expectedOldOid !== null) {
    if ((yield* checked(["cat-file", "-t", request.expectedOldOid])) !== "commit")
      return yield* invalid();
    yield* checked(["merge-base", "--is-ancestor", request.expectedOldOid, request.newOid]);
  }
  const remoteHead = Effect.fn("FactoryActions.pushRemoteHead")(function* () {
    const result = yield* run(["ls-remote", "--refs", "--exit-code", url, request.destinationRef]);
    if (!complete(result)) return yield* invalid();
    if (result.code === 2 && result.stdout.trim() === "") return null;
    const lines = result.stdout.trim().split("\n");
    const [head, ref] = lines[0]?.split("\t") ?? [];
    if (
      result.code !== 0 ||
      lines.length !== 1 ||
      !head ||
      !oid.test(head) ||
      ref !== request.destinationRef
    )
      return yield* invalid();
    return head;
  });
  if ((yield* remoteHead()) !== request.expectedOldOid) return yield* invalid();
  yield* localHead();
  return {
    // The lease is a compare-and-swap guard; ancestry above forbids branch rewrites.
    args: [
      "--no-replace-objects",
      "push",
      "--porcelain",
      "--no-follow-tags",
      "--recurse-submodules=no",
      `--force-with-lease=${request.destinationRef}:${request.expectedOldOid ?? ""}`,
      "--",
      url,
      `${request.newOid}:${request.destinationRef}`,
    ],
    verify: remoteHead().pipe(Effect.map((head) => head === request.newOid)),
  };
});
