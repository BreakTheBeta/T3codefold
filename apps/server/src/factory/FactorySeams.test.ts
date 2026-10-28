import { assert, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  CommandId,
  RunAttemptId,
  type FactoryAgent,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Sqlite from "../persistence/Sqlite.ts";
import { ThreadActivityGuard } from "../orchestration-v2/ThreadActivityGuard.ts";
import { ThreadRetentionGuard } from "../orchestration-v2/ThreadRetentionGuard.ts";
import * as Store from "./FactoryStore.ts";
import * as Control from "./FactoryControl.ts";
import { TurnPreamble } from "../orchestration-v2/TurnPreamble.ts";
import * as Seams from "./FactorySeams.ts";

const TestLayer = Seams.layer.pipe(
  Layer.provideMerge(Control.layer),
  Layer.provideMerge(Store.layer),
  Layer.provideMerge(Sqlite.layerMemory),
);
const agent: FactoryAgent = {
  id: "commander",
  version: 0,
  createdAt: 0,
  updatedAt: 0,
  threadId: ThreadId.make("factory-thread"),
  projectId: ProjectId.make("factory-project"),
  environmentId: EnvironmentId.make("env"),
  role: "commander",
  parentId: null,
  generation: 1,
  lifecycle: "active",
  capsule:
    "Mission source: thread:original; tracker /shared/tasks/initiative/work.md; code paths are checkout-relative.",
  capsuleRevision: 1,
  needs: null,
  next: "Work",
};

it.effect("disabled Factory blocks its provider work while ordinary threads remain usable", () =>
  Effect.gen(function* () {
    const store = yield* Store.FactoryStore;
    const control = yield* Control.FactoryControl;
    const guard = yield* ThreadActivityGuard;
    const retention = yield* ThreadRetentionGuard;
    yield* store.transaction(store.put("agents", agent));
    const calls = yield* Ref.make(0);
    const providerStart = Ref.update(calls, (n) => n + 1);
    assert.isTrue(Exit.isFailure(yield* guard.check(agent.threadId).pipe(Effect.exit)));
    assert.isTrue(
      Exit.isFailure(yield* guard.admit(agent.threadId, providerStart).pipe(Effect.exit)),
    );
    assert.equal(yield* Ref.get(calls), 0);
    yield* guard.admit(ThreadId.make("ordinary-thread"), providerStart);
    assert.equal(yield* Ref.get(calls), 1);
    yield* retention.check({
      type: "thread.unpin",
      threadId: agent.threadId,
      commandId: CommandId.make("unpin"),
    });
    yield* control.setEnabled(true);
    yield* guard.admit(agent.threadId, providerStart);
    assert.equal(yield* Ref.get(calls), 2);
    assert.isTrue(
      Exit.isFailure(
        yield* retention
          .check({
            type: "thread.unpin",
            threadId: agent.threadId,
            commandId: CommandId.make("unpin-on"),
          })
          .pipe(Effect.exit),
      ),
    );
  }).pipe(Effect.provide(TestLayer)),
);

it.effect(
  "new turns recover current needs and deliverable while retries keep their original context",
  () =>
    Effect.gen(function* () {
      const store = yield* Store.FactoryStore;
      yield* (yield* Control.FactoryControl).setEnabled(true);
      yield* store.transaction(
        store.put("agents", {
          ...agent,
          needs: "review decision",
          next: "Validate the prepared patch",
        }),
      );
      const preamble = yield* TurnPreamble;
      const attempt = RunAttemptId.make("first");
      const first = yield* preamble.forAttempt(agent.threadId, attempt);
      assert.include(first ?? "", "review decision");
      assert.include(first ?? "", "Validate the prepared patch");
      const current = (yield* store.get("agents", agent.id))!;
      yield* store.transaction(
        store.put("agents", { ...current, needs: null, next: "Prepare the release evidence" }),
      );
      assert.equal(yield* preamble.forAttempt(agent.threadId, attempt), first);
      const next = yield* preamble.forAttempt(agent.threadId, RunAttemptId.make("second"));
      assert.include(next ?? "", "Prepare the release evidence");
      assert.include(next ?? "", "thread:original");
      assert.include(next ?? "", "/shared/tasks/initiative/work.md");
      assert.include(next ?? "", "DEFAULTED");
      assert.isAtMost((next ?? "").length, 12000);
      assert.notInclude(next ?? "", "review decision");
    }).pipe(
      Effect.provide(
        Seams.layer.pipe(
          Layer.provideMerge(Control.layer),
          Layer.provideMerge(Store.layer),
          Layer.provideMerge(Sqlite.layerMemory),
        ),
      ),
    ),
);

it.effect(
  "existing Commander capsules receive the current coordination policy without replacing their mission",
  () =>
    Effect.gen(function* () {
      const store = yield* Store.FactoryStore;
      yield* (yield* Control.FactoryControl).setEnabled(true);
      const legacy = {
        ...agent,
        capsule:
          "Legacy mission: coordinate preview delivery; tracker /shared/tasks/preview/work.md",
        capsuleRevision: 1,
      };
      yield* store.transaction(store.put("agents", legacy));
      const preamble = yield* TurnPreamble;
      const text =
        (yield* preamble.forAttempt(agent.threadId, RunAttemptId.make("legacy-commander-next"))) ??
        "";
      assert.include(text, "Commander coordination policy");
      assert.include(text, "Do not edit code, run tests/builds or repair local tooling");
      assert.include(text, "Reuse the existing responsible owner");
      assert.include(text, "3 runnable delivery assignments");
      assert.include(text, "Legacy mission: coordinate preview delivery");
      assert.include(text, "/shared/tasks/preview/work.md");
      assert.equal((yield* store.get("agents", agent.id))?.capsule, legacy.capsule);
      assert.equal((yield* store.get("agents", agent.id))?.capsuleRevision, 1);
    }).pipe(Effect.provide(TestLayer)),
);

it.effect("Commander policy is not assigned to workers and full legacy context stays bounded", () =>
  Effect.gen(function* () {
    const store = yield* Store.FactoryStore;
    yield* (yield* Control.FactoryControl).setEnabled(true);
    yield* store.transaction(
      Effect.gen(function* () {
        yield* store.put("agents", { ...agent, capsule: "x".repeat(6000) });
        yield* store.put("agents", {
          ...agent,
          id: "worker",
          threadId: ThreadId.make("worker-policy"),
          role: "worker",
          parentId: agent.id,
        });
      }),
    );
    const preamble = yield* TurnPreamble;
    const commanderText =
      (yield* preamble.forAttempt(agent.threadId, RunAttemptId.make("long-policy"))) ?? "";
    assert.include(commanderText, "Commander coordination policy");
    assert.isAtMost(commanderText.length, 12000);
    const workerText =
      (yield* preamble.forAttempt(
        ThreadId.make("worker-policy"),
        RunAttemptId.make("worker-policy-attempt"),
      )) ?? "";
    assert.notInclude(workerText, "Commander coordination policy");
    assert.include(workerText, "DEFAULTED");
  }).pipe(Effect.provide(TestLayer)),
);
