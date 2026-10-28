import { assert, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type FactoryActionEnvelope,
  type FactoryCardBody,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { ChildProcessSpawner } from "effect/process";
import * as Processes from "../processRunner.ts";
import { ProjectService } from "../project/ProjectService.ts";
import * as Sqlite from "../persistence/Sqlite.ts";
import * as Store from "./FactoryStore.ts";
import * as Queue from "./WakeQueue.ts";
import * as Actions from "./FactoryActions.ts";
import * as Decisions from "./FactoryDecisions.ts";
import { enabledControl } from "./testControl.ts";

const output = (stdout: string, code = 0, timedOut = false): Processes.ProcessRunOutput => ({
  stdout,
  stderr: "",
  code: ChildProcessSpawner.ExitCode(code),
  timedOut,
  stdoutTruncated: false,
  stderrTruncated: false,
  stdoutInvalidUtf8: false,
  stderrInvalidUtf8: false,
});
const body: FactoryCardBody = {
  title: "Publish the tested preview improvement?",
  kind: "decision",
  blocking: true,
  urgency: "today",
  context: {
    product: "Preview setup",
    benefit: "Avoid unnecessary installs",
    delivered: "Tested locally; publication pending",
    choice: "Push this exact reviewed commit or hold?",
    authority: "outward",
    doing: "Prepare the reviewed change",
    whyNotMe: "Only you authorize publication",
    costOfWaiting: "The local change stays ready",
  },
  options: ["A", "B"].map((id) => ({
    id,
    label: id === "A" ? "Push" : "Hold",
    recommended: id === "A",
    nextStep: "Retain the exact reviewed change",
    cost: "None",
    reversibility: "reversible",
    consequences: "Publish only the explicitly selected action",
  })),
  rationale: "The bounded patch is tested",
  caveats: [],
  links: [{ kind: "code", ref: "src/preview.ts" }],
};
const persistence = Queue.layer.pipe(
  Layer.provideMerge(enabledControl),
  Layer.provideMerge(Store.layer),
  Layer.provideMerge(Sqlite.layerMemory),
);
const cases = [
  "fast-forward",
  "new-ref",
  "new-ref-exists",
  "new-ref-race",
  "wrong-source-ref",
  "stale-remote",
  "non-fast-forward",
  "graft-disguise",
  "replacement-disguise",
  "wrong-repository",
  "wrong-ref",
  "dirty",
  "head-moved",
  "defaulted",
  "stale-consent",
  "stale-revision",
  "no-op",
  "race",
  "unknown",
  "verification-mismatch",
] as const;

it.live.each(cases)("ordinary push: %s", (scenario) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const real = yield* Processes.ProcessRunner;
    const gitEnv = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
    const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "factory-push-" });
    const git = Effect.fn("test.pushGit")(function* (args: readonly string[]) {
      const result = yield* real.run({ command: "git", args, cwd, env: gitEnv });
      assert.equal(result.code, 0, result.stderr);
      return result.stdout.trim();
    });
    yield* git(["init", "-b", "main"]);
    const commit = (message: string) =>
      git([
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "--allow-empty",
        "-m",
        message,
      ]);
    yield* commit("base");
    const a = yield* git(["rev-parse", "HEAD"]);
    yield* commit("approved");
    const b = yield* git(["rev-parse", "HEAD"]);
    yield* git(["checkout", "-b", "alternate", a]);
    yield* commit("diverged");
    const c = yield* git(["rev-parse", "HEAD"]);
    yield* git(["checkout", "main"]);
    yield* git(["remote", "add", "origin", "https://github.com/acme/app.git"]);
    let remote: string | null = ["new-ref", "new-ref-race"].includes(scenario)
      ? null
      : ["non-fast-forward", "graft-disguise", "replacement-disguise"].includes(scenario)
        ? c
        : scenario === "stale-remote"
          ? b
          : a;
    let pushes = 0;
    let postRead = false;
    let revoke: Effect.Effect<void, never> | undefined;
    const intercepted: Processes.ProcessRunner["Service"] = {
      run: (input) =>
        Effect.gen(function* () {
          assert.equal(input.command, "git");
          if (input.args.includes("ls-remote") && !input.args.includes("--get-url")) {
            if (revoke) yield* revoke;
            if (postRead && scenario === "verification-mismatch")
              return output(`${a}\trefs/heads/main\n`);
            return remote === null ? output("", 2) : output(`${remote}\trefs/heads/main\n`);
          }
          if (input.args.includes("push")) {
            pushes++;
            assert.include(input.args, "--no-follow-tags");
            assert.include(input.args, "--recurse-submodules=no");
            assert.include(input.args, "https://github.com/acme/app.git");
            assert.include(input.args, `${b}:refs/heads/main`);
            assert.notInclude(input.args, "--force");
            const expected = scenario.startsWith("new-ref") ? "" : a;
            assert.include(input.args, `--force-with-lease=refs/heads/main:${expected}`);
            postRead = true;
            if (["race", "new-ref-race"].includes(scenario)) remote = c;
            if (remote !== (expected || null)) return output("stale lease", 1);
            remote = b;
            return output("updated", 0, scenario === "unknown");
          }
          return yield* real.run({ ...input, env: { ...gitEnv, ...input.env } });
        }),
    };
    const projectId = ProjectId.make("project");
    const threadId = ThreadId.make("worker");
    const actor = { kind: "agent", threadId } as const;
    const layer = Layer.mergeAll(Actions.layer, Decisions.layer).pipe(
      Layer.provideMerge(persistence),
      Layer.provide(Layer.succeed(Processes.ProcessRunner, intercepted)),
      Layer.provide(
        Layer.mock(ProjectService)({
          getById: () =>
            Effect.succeedSome({
              id: projectId,
              title: "Fixture",
              workspaceRoot: cwd,
              defaultModelSelection: null,
              scripts: [],
              createdAt: "2026-10-28T00:00:00.000Z",
              updatedAt: "2026-10-28T00:00:00.000Z",
              deletedAt: null,
            }),
        }),
      ),
    );
    yield* Effect.gen(function* () {
      const store = yield* Store.FactoryStore;
      const decisions = yield* Decisions.FactoryDecisions;
      const actions = yield* Actions.FactoryActions;
      yield* store.transaction(
        store.put("agents", {
          id: "worker",
          version: 0,
          createdAt: 0,
          updatedAt: 0,
          environmentId: EnvironmentId.make("env"),
          projectId,
          threadId,
          role: "worker",
          parentId: null,
          generation: 1,
          lifecycle: "active",
          capsule: "Publish exact reviewed change",
          capsuleRevision: 1,
          needs: null,
          next: "Publish",
        }),
      );
      const request = {
        type: "push" as const,
        sourceRef: scenario === "wrong-source-ref" ? "refs/heads/alternate" : "refs/heads/main",
        destinationRef: "refs/heads/main",
        newOid: b,
        expectedOldOid: scenario.startsWith("new-ref")
          ? null
          : scenario === "no-op"
            ? b
            : ["non-fast-forward", "graft-disguise", "replacement-disguise"].includes(scenario)
              ? c
              : a,
      };
      if (scenario === "no-op") remote = b;
      const envelope: FactoryActionEnvelope = {
        version: 1,
        kind: "push",
        repository: scenario === "wrong-repository" ? "other/app" : "acme/app",
        target: scenario === "wrong-ref" ? "refs/heads/other" : "refs/heads/main",
        cwd,
        count: 1,
        request,
      };
      const sha = yield* decisions.payload(actor, envelope);
      const card = yield* decisions.file(actor, {
        id: "push",
        body: { ...body, action: { optionId: "A", payloadSha256: sha } },
      });
      yield* decisions.answer(
        { kind: "user" },
        {
          cardId: card.id,
          revision: card.revision,
          ...(scenario === "defaulted" ? { yourCall: true } : { optionId: "A" }),
        },
      );
      if (scenario === "graft-disguise")
        yield* fs.writeFileString(`${cwd}/.git/info/grafts`, `${b} ${c}\n`);
      if (scenario === "replacement-disguise") yield* git(["replace", b, c]);
      if (scenario === "dirty") yield* fs.writeFileString(`${cwd}/unreviewed.txt`, "unreviewed");
      if (scenario === "head-moved") yield* git(["update-ref", "refs/heads/main", c]);
      if (scenario === "stale-consent")
        revoke = decisions.withdraw(actor, card.id).pipe(Effect.asVoid, Effect.orDie);
      if (scenario === "stale-revision")
        revoke = store
          .transaction(
            Effect.gen(function* () {
              const current = (yield* store.get("cards", card.id))!;
              yield* store.put("cards", { ...current, revision: current.revision + 1 });
            }),
          )
          .pipe(Effect.orDie);
      const result = yield* actions.execute(actor, card.id).pipe(Effect.exit);
      if (["fast-forward", "new-ref"].includes(scenario)) {
        assert.isTrue(Exit.isSuccess(result));
        if (Exit.isSuccess(result)) assert.equal(result.value.state, "succeeded");
        assert.equal(remote, b);
        yield* actions.execute(actor, card.id);
        assert.equal(pushes, 1);
      } else if (["race", "new-ref-race", "unknown", "verification-mismatch"].includes(scenario)) {
        assert.isTrue(Exit.isSuccess(result));
        if (Exit.isSuccess(result)) assert.equal(result.value.state, "unknown");
        yield* actions.execute(actor, card.id);
        assert.equal(pushes, 1);
        if (["race", "new-ref-race"].includes(scenario)) assert.equal(remote, c);
      } else {
        assert.isTrue(Exit.isFailure(result), scenario);
        assert.equal(pushes, 0);
      }
    }).pipe(Effect.provide(layer));
  }).pipe(
    Effect.scoped,
    Effect.provide(Processes.layer.pipe(Layer.provideMerge(NodeServices.layer))),
  ),
);
