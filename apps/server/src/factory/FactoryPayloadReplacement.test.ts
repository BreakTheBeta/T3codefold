import { assert, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type FactoryAgent,
  type FactoryActionEnvelope,
  type FactoryCardBody,
} from "@t3tools/contracts";
import * as PlatformNodeCrypto from "@effect/platform-node/NodeCrypto";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import { ChildProcessSpawner } from "effect/process";
import * as Sqlite from "../persistence/Sqlite.ts";
import * as Store from "./FactoryStore.ts";
import * as Queue from "./WakeQueue.ts";
import * as Decisions from "./FactoryDecisions.ts";
import * as Actions from "./FactoryActions.ts";
import { enabledControl } from "./testControl.ts";
import { ProcessRunner } from "../processRunner.ts";
import { ProjectService } from "../project/ProjectService.ts";

const sha = Effect.fn("Fixture.sha")(function* (value: string) {
  const crypto = yield* Crypto.Crypto;
  const bytes = yield* crypto.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
});

const envelope: FactoryActionEnvelope = {
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
    body: "Exact approved comment",
  },
};
const owner: FactoryAgent = {
  id: "commander",
  version: 0,
  createdAt: 0,
  updatedAt: 0,
  environmentId: EnvironmentId.make("env"),
  projectId: ProjectId.make("project"),
  threadId: ThreadId.make("commander"),
  role: "commander",
  parentId: null,
  generation: 0,
  lifecycle: "active",
  capsule: "Coordinate",
  capsuleRevision: 1,
  needs: null,
  next: "Publish",
};
const body = (hash: string): FactoryCardBody => ({
  title: "Publish exact replacement?",
  kind: "decision",
  blocking: true,
  urgency: "now",
  context: {
    product: "Release notes",
    benefit: "Users see the tested fix",
    delivered: "Draft ready; publication pending",
    choice: "Publish unchanged action with the new owner?",
    authority: "outward",
    doing: "Replace a pre-dispatch failed route",
    whyNotMe: "Fresh exact user consent required",
    costOfWaiting: "Publication held",
  },
  options: ["A", "B"].map((id) => ({
    id,
    label: id === "A" ? "Publish" : "Hold",
    recommended: id === "A",
    nextStep: "Execute or hold",
    cost: "One comment",
    reversibility: "reversible",
    consequences: "Publish or retain draft",
  })),
  rationale: "Use the existing project worker with fresh exact consent",
  caveats: [],
  links: [{ kind: "code", ref: "fixture:evidence" }],
  action: { optionId: "A", payloadSha256: hash },
});

it.effect.each([
  "claimed",
  "unknown",
  "executing",
  "succeeded",
  "outside",
  "became-unknown",
  "source-won",
] as const)("owner-safe legacy replacement: %s", (scenario) =>
  Effect.gen(function* () {
    const store = yield* Store.FactoryStore;
    const decisions = yield* Decisions.FactoryDecisions;
    const actions = yield* Actions.FactoryActions;
    const worker = {
      ...owner,
      id: "worker",
      role: "worker" as const,
      parentId: owner.id,
      generation: 1,
      threadId: ThreadId.make("worker"),
      projectId: ProjectId.make(scenario === "outside" ? "outside" : "project"),
    };
    const stranger = {
      ...worker,
      id: "stranger",
      parentId: null,
      threadId: ThreadId.make("stranger"),
    };
    yield* store.transaction(
      Effect.gen(function* () {
        for (const agent of [owner, worker, stranger]) yield* store.put("agents", agent);
      }),
    );
    const oldActor = { kind: "agent", threadId: owner.threadId } as const;
    const actor = { kind: "agent", threadId: worker.threadId } as const;
    const hash = yield* sha(Decisions.canonicalAction(envelope));
    const legacy = {
      id: hash,
      sha256: hash,
      ownerId: owner.id,
      envelope,
      version: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    const savedLegacy = yield* store.transaction(store.put("payloads", legacy));
    const oldCard = yield* decisions.file(oldActor, { id: "original", body: body(hash) });
    yield* decisions.answer(
      { kind: "user" },
      { cardId: oldCard.id, revision: oldCard.revision, optionId: "A" },
    );
    const oldExecution = {
      id: `exec:${yield* sha(`${oldCard.id}:${oldCard.revision}:A:${hash}`)}`,
      version: 0,
      createdAt: 0,
      updatedAt: 0,
      cardId: oldCard.id,
      cardRevision: oldCard.revision,
      optionId: "A",
      payloadSha256: hash,
      state: (["unknown", "executing", "succeeded"].includes(scenario) ? scenario : "claimed") as
        | "claimed"
        | "unknown"
        | "executing"
        | "succeeded",
      result: "",
    };
    yield* store.transaction(store.put("executions", oldExecution));
    assert.isTrue(
      Exit.isFailure(
        yield* decisions
          .payload({ kind: "agent", threadId: stranger.threadId }, envelope)
          .pipe(Effect.exit),
      ),
    );
    assert.equal(yield* decisions.payload(actor, envelope), hash);
    assert.equal(yield* decisions.payload(actor, envelope), hash);
    assert.deepEqual(yield* store.get("payloads", hash), savedLegacy);
    assert.isTrue(Exit.isFailure(yield* actions.execute(actor, oldCard.id).pipe(Effect.exit)));
    const replacement = yield* decisions.file(actor, { id: "replacement", body: body(hash) });
    assert.isTrue(Exit.isFailure(yield* actions.execute(actor, replacement.id).pipe(Effect.exit)));
    yield* decisions.answer(
      { kind: "user" },
      { cardId: replacement.id, revision: replacement.revision, yourCall: true },
    );
    assert.isTrue(Exit.isFailure(yield* actions.execute(actor, replacement.id).pipe(Effect.exit)));
    const explicit = yield* decisions.file(actor, {
      id: "replacement-explicit",
      body: body(hash),
    });
    yield* decisions.answer(
      { kind: "user" },
      { cardId: explicit.id, revision: explicit.revision, optionId: "A" },
    );
    if (scenario === "became-unknown") {
      const current = (yield* store.get("executions", oldExecution.id))!;
      yield* store.transaction(store.put("executions", { ...current, state: "unknown" }));
    }
    if (scenario === "source-won") {
      assert.equal((yield* actions.execute(oldActor, oldCard.id)).state, "succeeded");
    }
    if (scenario !== "claimed") {
      assert.isTrue(Exit.isFailure(yield* actions.execute(actor, explicit.id).pipe(Effect.exit)));
      const retained = yield* store.get("executions", oldExecution.id);
      assert.equal(retained?.supersededBy, undefined);
      assert.deepEqual(yield* store.get("payloads", hash), savedLegacy);
      return;
    }
    assert.equal((yield* actions.execute(actor, explicit.id)).state, "succeeded");
    const retained = yield* store.get("executions", oldExecution.id);
    assert.equal(retained?.state, "claimed");
    assert.isString(retained?.supersededBy);
    assert.equal(retained?.cardId, oldCard.id);
    assert.equal((yield* actions.execute(oldActor, oldCard.id)).state, "claimed");
    assert.equal((yield* actions.execute(actor, explicit.id)).state, "succeeded");
    assert.lengthOf(
      (yield* store.list("executions")).filter((x) => x.state === "succeeded"),
      1,
    );
    assert.deepEqual(yield* store.get("payloads", hash), savedLegacy);
  }).pipe(Effect.provide(testLayer())),
);

const testLayer = () => {
  let writes = 0;
  return Layer.mergeAll(Actions.layer, Decisions.layer).pipe(
    Layer.provideMerge(
      Queue.layer.pipe(
        Layer.provideMerge(enabledControl),
        Layer.provideMerge(Store.layer),
        Layer.provideMerge(Sqlite.layerMemory),
      ),
    ),
    Layer.provideMerge(PlatformNodeCrypto.layer),
    Layer.provide(FileSystem.layerNoop({ realPath: (path) => Effect.succeed(path) })),
    Layer.provide(
      Layer.mock(ProjectService)({
        getById: (id) =>
          Effect.succeedSome({
            id: ProjectId.make("project"),
            title: "Fixture",
            workspaceRoot: id === "outside" ? "/unrelated" : "/fixture",
            defaultModelSelection: null,
            scripts: [],
            createdAt: "2026-10-29T00:00:00.000Z",
            updatedAt: "2026-10-29T00:00:00.000Z",
            deletedAt: null,
          }),
      }),
    ),
    Layer.provide(
      Layer.mock(ProcessRunner)({
        run: (input) =>
          Effect.sync(() => {
            if (input.command === "git")
              return {
                stdout: "",
                stderr: "not a repository",
                code: ChildProcessSpawner.ExitCode(128),
                timedOut: false,
                stdoutTruncated: false,
                stderrTruncated: false,
                stdoutInvalidUtf8: false,
                stderrInvalidUtf8: false,
              };
            assert.equal(input.command, "gh");
            assert.equal(++writes, 1, "no old claim or identical retry may publish again");
            return {
              stdout: "{}",
              stderr: "",
              code: ChildProcessSpawner.ExitCode(0),
              timedOut: false,
              stdoutTruncated: false,
              stderrTruncated: false,
              stdoutInvalidUtf8: false,
              stderrInvalidUtf8: false,
            };
          }),
      }),
    ),
  );
};
