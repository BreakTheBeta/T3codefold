import { assert, it } from "@effect/vitest";
import { ChildProcessSpawner } from "effect/process";
import type { ProcessRunOutput } from "../processRunner.ts";
import { EnvironmentId, ProjectId, ThreadId, type FactoryAgent } from "@t3tools/contracts";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Sqlite from "../persistence/Sqlite.ts";
import * as Store from "./FactoryStore.ts";
import * as Queue from "./WakeQueue.ts";
import * as Decisions from "./FactoryDecisions.ts";
import * as Actions from "./FactoryActions.ts";
import { enabledControl } from "./testControl.ts";
import { ProcessRunner } from "../processRunner.ts";
import { ProjectService } from "../project/ProjectService.ts";
import { factoryActionOutcome } from "./FactoryActions.ts";

const output = (stdout: string, overrides: Partial<ProcessRunOutput> = {}): ProcessRunOutput => ({
  stdout,
  stderr: "",
  code: ChildProcessSpawner.ExitCode(0),
  timedOut: false,
  stdoutTruncated: false,
  stderrTruncated: false,
  stdoutInvalidUtf8: false,
  stderrInvalidUtf8: false,
  ...overrides,
});
it("requires an affirmative host merge receipt, even after a zero exit status", () => {
  assert.equal(
    factoryActionOutcome("merge", output('{"merged":false,"message":"Head changed"}')),
    "failed",
  );
  assert.equal(factoryActionOutcome("merge", output('{"merged":true}')), "succeeded");
  assert.equal(factoryActionOutcome("merge", output("not-json")), "unknown");
});
it("keeps timed out, truncated and unsuccessful outward actions uncertain", () => {
  for (const overrides of [
    { timedOut: true },
    { stdoutTruncated: true },
    { stdoutInvalidUtf8: true },
    { code: ChildProcessSpawner.ExitCode(1) },
  ])
    assert.equal(factoryActionOutcome("merge", output('{"merged":true}', overrides)), "unknown");
  assert.equal(factoryActionOutcome("force-push", output("")), "succeeded");
});

it.effect(
  "defaulted consent cannot execute while explicit choices on either option remain executable",
  () =>
    Effect.gen(function* () {
      const store = yield* Store.FactoryStore;
      const decisions = yield* Decisions.FactoryDecisions;
      const actions = yield* Actions.FactoryActions;
      const owner: FactoryAgent = {
        id: "owner",
        version: 0,
        createdAt: 0,
        updatedAt: 0,
        environmentId: EnvironmentId.make("test"),
        projectId: ProjectId.make("project"),
        threadId: ThreadId.make("worker"),
        role: "worker",
        parentId: null,
        generation: 1,
        lifecycle: "active",
        capsule: "Deliver",
        capsuleRevision: 1,
        needs: null,
        next: "Publish reviewed change",
      };
      yield* store.transaction(store.put("agents", owner));
      const actor = { kind: "agent", threadId: owner.threadId } as const;
      const sha256 = yield* decisions.payload(actor, {
        version: 1,
        kind: "external-post",
        repository: "acme/app",
        target: "issue:1",
        cwd: "/fixture",
        count: 1,
        request: {
          type: "external-post",
          adapter: "github-comment",
          issueNumber: 1,
          body: "Release evidence",
        },
      });
      const card = yield* decisions.file(actor, {
        id: "publish",
        body: {
          title: "Publish release evidence?",
          kind: "decision",
          blocking: true,
          urgency: "today",
          context: {
            product: "Release notes",
            benefit: "Users see the fix",
            delivered: "Draft ready; publication pending",
            choice: "Publish or hold?",
            authority: "outward",
            doing: "Explain the tested fix to users",
            whyNotMe: "Posting requires your exact approval",
            costOfWaiting: "The local fix remains ready",
          },
          options: ["A", "B"].map((id) => ({
            id,
            label: id === "A" ? "Publish" : "Hold",
            recommended: id === "A",
            nextStep: "Keep evidence",
            cost: "None",
            reversibility: "reversible",
            consequences: "Users see release evidence only after approval",
          })),
          rationale: "The reviewed fix is ready",
          caveats: [],
          links: [{ kind: "code", ref: "src/fix.ts" }],
          action: { optionId: "A", payloadSha256: sha256 },
        },
      });
      yield* decisions.answer(
        { kind: "user" },
        { cardId: card.id, revision: card.revision, yourCall: true },
      );
      const result = yield* actions.execute(actor, card.id).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(result));
      assert.lengthOf(yield* store.list("executions"), 0);
      for (const option of ["A", "B"]) {
        const explicit = yield* decisions.file(actor, {
          id: `explicit-${option}`,
          body: { ...card.body, action: { optionId: option, payloadSha256: sha256 } },
        });
        const chosen = yield* decisions.answer(
          { kind: "user" },
          { cardId: explicit.id, revision: explicit.revision, optionId: option },
        );
        assert.equal(chosen.outcome, option === "A" ? "CHOSE" : "CHOSE-against");
        assert.equal((yield* actions.execute(actor, explicit.id)).state, "succeeded");
        assert.equal((yield* actions.execute(actor, explicit.id)).state, "succeeded");
      }
      assert.lengthOf(yield* store.list("executions"), 2);
      const outside = yield* decisions.payload(actor, {
        version: 1,
        kind: "external-post",
        repository: "acme/app",
        target: "issue:1",
        cwd: "/other-project/worktree",
        count: 1,
        request: {
          type: "external-post",
          adapter: "github-comment",
          issueNumber: 1,
          body: "Release evidence",
        },
      });
      const outsideCard = yield* decisions.file(actor, {
        id: "outside-workspace",
        body: { ...card.body, action: { optionId: "A", payloadSha256: outside } },
      });
      yield* decisions.answer(
        { kind: "user" },
        { cardId: outsideCard.id, revision: outsideCard.revision, optionId: "A" },
      );
      assert.isTrue(
        Exit.isFailure(yield* actions.execute(actor, outsideCard.id).pipe(Effect.exit)),
      );
      const refused = (yield* store.list("executions")).find(
        (execution) => execution.cardId === outsideCard.id,
      )!;
      assert.equal(refused.state, "failed");
      assert.include(refused.result, "before external dispatch");
      assert.equal((yield* actions.execute(actor, outsideCard.id)).state, "failed");
      assert.lengthOf(yield* store.list("executions"), 3);
    }).pipe(Effect.provide(ActionTestLayer)),
);

it.effect("only an unknown outcome can be resolved, and only once", () =>
  Effect.gen(function* () {
    const store = yield* Store.FactoryStore;
    const actions = yield* Actions.FactoryActions;
    const execution = {
      id: "exec:stuck",
      version: 0,
      createdAt: 0,
      updatedAt: 0,
      cardId: "publish",
      cardRevision: 1,
      optionId: "A",
      payloadSha256: "sha",
      state: "unknown" as const,
      result: "remote rejected",
    };
    yield* store.transaction(store.put("executions", execution));
    const resolved = yield* actions.resolve(execution.id, "failed");
    assert.equal(resolved.state, "failed");
    assert.include(resolved.result, "remote rejected");
    assert.include(resolved.result, "Resolved by the user as failed.");
    const again = yield* actions.resolve(execution.id, "succeeded").pipe(Effect.exit);
    assert.isTrue(Exit.isFailure(again));
    assert.equal((yield* store.get("executions", execution.id))?.state, "failed");
  }).pipe(Effect.provide(ActionTestLayer)),
);

const actionPersistence = Queue.layer.pipe(
  Layer.provideMerge(enabledControl),
  Layer.provideMerge(Store.layer),
  Layer.provideMerge(Sqlite.layerMemory),
);
const ActionTestLayer = Layer.mergeAll(Actions.layer, Decisions.layer).pipe(
  Layer.provideMerge(actionPersistence),
  Layer.provide(NodeCrypto.layer),
  Layer.provide(FileSystem.layerNoop({ realPath: (path) => Effect.succeed(path) })),
  Layer.provide(
    Layer.mock(ProjectService)({
      getById: () =>
        Effect.succeedSome({
          id: ProjectId.make("project"),
          title: "Fixture",
          workspaceRoot: "/fixture",
          defaultModelSelection: null,
          scripts: [],
          createdAt: "2026-10-28T00:00:00.000Z",
          updatedAt: "2026-10-28T00:00:00.000Z",
          deletedAt: null,
        }),
    }),
  ),
  Layer.provide(
    Layer.mock(ProcessRunner)({
      run: (input) =>
        Effect.sync(() => {
          if (input.command === "git")
            return output("", { code: ChildProcessSpawner.ExitCode(128) });
          assert.equal(input.command, "gh");
          assert.include(input.args ?? [], "repos/acme/app/issues/1/comments");
          return output("{}");
        }),
    }),
  ),
);
