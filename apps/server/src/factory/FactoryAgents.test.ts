import { enabledControl } from "./testControl.ts";
import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type FactoryAgent,
  type FactorySpawn,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Sqlite from "../persistence/Sqlite.ts";
import * as Config from "../config.ts";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { ProjectService } from "../project/ProjectService.ts";
import { ProviderRegistry } from "../provider/ProviderRegistry.ts";
import { ThreadLaunchService } from "../orchestration-v2/ThreadLaunchService.ts";
import { ThreadManagementService } from "../orchestration-v2/ThreadManagementService.ts";
import * as Store from "./FactoryStore.ts";
import * as Queue from "./WakeQueue.ts";
import * as Agents from "./FactoryAgents.ts";

const persistence = Queue.layer.pipe(
  Layer.provideMerge(enabledControl),
  Layer.provideMerge(Store.layer),
  Layer.provideMerge(Sqlite.layerMemory),
);
const dependencies = Layer.mergeAll(
  NodeServices.layer,
  Config.layerTest(process.cwd(), { prefix: "factory-agent-close-" }).pipe(
    Layer.provide(NodeServices.layer),
  ),
  Layer.mock(ServerEnvironment)({ getEnvironmentId: Effect.succeed(EnvironmentId.make("test")) }),
  Layer.mock(ProjectService)({}),
  Layer.mock(ProviderRegistry)({}),
  Layer.mock(ThreadLaunchService)({}),
  Layer.mock(ThreadManagementService)({}),
);
const TestLayer = Agents.layer.pipe(Layer.provideMerge(persistence), Layer.provide(dependencies));
const owner: FactoryAgent = {
  id: "parent",
  version: 0,
  createdAt: 0,
  updatedAt: 0,
  environmentId: EnvironmentId.make("test"),
  projectId: ProjectId.make("project"),
  threadId: ThreadId.make("parent-thread"),
  role: "subcommander",
  parentId: "commander",
  generation: 1,
  lifecycle: "active",
  capsule: "Work",
  capsuleRevision: 1,
  needs: null,
  next: "",
};
const spawn: FactorySpawn = {
  id: "pending",
  version: 0,
  createdAt: 0,
  updatedAt: 0,
  parentId: owner.id,
  agentId: "future-child",
  threadId: ThreadId.make("future-thread"),
  projectId: owner.projectId,
  role: "worker",
  generation: 1,
  title: "Pending work",
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-6.1-sol" },
  prompt: "Work",
  capsule: "Work",
  workspace: "worktree",
  baseRef: "HEAD",
  state: "held",
  retryAt: 0,
  reservedAt: null,
};

it.layer(TestLayer)("Factory agent cleanup", (it) => {
  it.effect(
    "closing a subtree revokes wakes, cancels pending children and retains live job custody",
    () =>
      Effect.gen(function* () {
        const store = yield* Store.FactoryStore;
        const agents = yield* Agents.FactoryAgents;
        const queue = yield* Queue.WakeQueue;
        yield* store.transaction(
          Effect.gen(function* () {
            yield* store.put("agents", owner);
            yield* store.put("agents", {
              ...owner,
              id: "child",
              role: "worker",
              parentId: owner.id,
              threadId: ThreadId.make("child-thread"),
            });
            yield* store.put("spawns", spawn);
            yield* queue.enqueue({
              id: "child-wake",
              targetId: "child",
              text: "Work",
              refKind: "watch",
              refId: "pr",
              sourceId: "watch:pr",
            });
            yield* store.put("jobs", {
              id: "live-job",
              version: 0,
              createdAt: 0,
              updatedAt: 0,
              ownerId: "child",
              cwd: "/fixture",
              gitRoot: "/fixture/.git",
              argv: ["fixture"],
              lane: "heavy",
              priority: 0,
              timeoutMs: 60_000,
              frozenHead: null,
              startedAt: 0,
              state: "running",
              status: null,
              rc: null,
              outputPath: "/fixture/job",
              supervisor: "nonce",
            });
          }),
        );
        yield* agents.lifecycle({ kind: "user" }, owner.id, "closed");
        assert.equal((yield* store.get("agents", "child"))?.lifecycle, "closed");
        assert.equal((yield* store.get("spawns", spawn.id))?.state, "cancelled");
        assert.equal((yield* store.get("sources", "watch:pr"))?.state, "revoked");
        assert.equal((yield* store.get("wakes", "child-wake"))?.state, "cancelled");
        assert.equal((yield* store.get("jobs", "live-job"))?.state, "running");
        assert.isTrue((yield* store.get("jobs", "live-job"))?.cancelRequested);
        assert.equal((yield* agents.resume(spawn)).state, "cancelled");
      }),
  );
  it.effect("closing one target leaves a shared source authorised for other targets", () =>
    Effect.gen(function* () {
      const store = yield* Store.FactoryStore;
      const agents = yield* Agents.FactoryAgents;
      const queue = yield* Queue.WakeQueue;
      yield* store.transaction(
        Effect.gen(function* () {
          yield* store.put("agents", {
            ...owner,
            id: "shared-parent",
            threadId: ThreadId.make("shared-parent-thread"),
          });
          yield* store.put("agents", {
            ...owner,
            id: "outside",
            role: "worker",
            threadId: ThreadId.make("outside-thread"),
          });
          yield* queue.enqueue({
            id: "shared-a",
            targetId: "shared-parent",
            text: "A",
            refKind: "watch",
            refId: "shared",
            sourceId: "shared-source",
          });
          yield* queue.enqueue({
            id: "shared-b",
            targetId: "outside",
            text: "B",
            refKind: "watch",
            refId: "shared",
            sourceId: "shared-source",
          });
        }),
      );
      yield* agents.lifecycle({ kind: "user" }, "shared-parent", "closed");
      assert.equal((yield* store.get("sources", "shared-source"))?.state, "active");
      assert.equal((yield* store.get("wakes", "shared-a"))?.state, "cancelled");
      assert.equal((yield* store.get("wakes", "shared-b"))?.state, "queued");
      assert.equal((yield* store.get("wakes", "shared-b"))?.attempts, 0);
    }),
  );
});

it.effect("a completed assignment retains its next owner and wakes the parent exactly once", () =>
  Effect.gen(function* () {
    const store = yield* Store.FactoryStore;
    const agents = yield* Agents.FactoryAgents;
    const child = {
      ...owner,
      id: "reporter",
      threadId: ThreadId.make("reporter-thread"),
      role: "worker" as const,
      parentId: owner.id,
    };
    yield* store.transaction(
      Effect.gen(function* () {
        yield* store.put("agents", owner);
        yield* store.put("agents", child);
      }),
    );
    const actor = { kind: "agent", threadId: child.threadId } as const;
    const report = {
      requestId: "patch-tested",
      outcome: "done" as const,
      summary: "Local patch and focused tests passed; evidence: /shared/tasks/result.md",
      next: "Parent: inspect the patch and assign the remaining release preflight",
    };
    const saved = yield* agents.report(actor, report);
    assert.equal(saved.workState, "done");
    assert.isNull(saved.needs);
    assert.equal(saved.next, report.next);
    assert.equal((yield* store.get("agents", owner.id))?.lifecycle, "active");
    assert.equal((yield* agents.report(actor, report)).version, saved.version);
    const wakes = yield* store.list("wakes");
    assert.lengthOf(wakes, 1);
    assert.equal(wakes[0]?.targetId, owner.id);
    assert.include(wakes[0]!.text, report.summary);
    assert.include(wakes[0]!.text, report.next);
    assert.isTrue(
      Exit.isFailure(
        yield* agents.report(actor, { ...report, summary: "Different result" }).pipe(Effect.exit),
      ),
    );
    assert.lengthOf(yield* store.list("wakes"), 1);
    yield* agents.report(actor, { ...report, requestId: "next-deliverable-tested" });
    const reports = yield* store.list("wakes");
    assert.lengthOf(reports, 2);
    assert.deepEqual(reports.map((wake) => wake.refId).sort(), [
      "next-deliverable-tested",
      "patch-tested",
    ]);
  }).pipe(Effect.provide(TestLayer)),
);

it.effect(
  "blocked reports require a named dependency and retain responsibility without closing the worker",
  () =>
    Effect.gen(function* () {
      const store = yield* Store.FactoryStore;
      const agents = yield* Agents.FactoryAgents;
      const child = {
        ...owner,
        id: "blocked-reporter",
        threadId: ThreadId.make("blocked-thread"),
        role: "worker" as const,
        parentId: owner.id,
      };
      yield* store.transaction(
        Effect.gen(function* () {
          yield* store.put("agents", owner);
          yield* store.put("agents", child);
        }),
      );
      const actor = { kind: "agent", threadId: child.threadId } as const;
      const report = {
        requestId: "blocked-release",
        outcome: "blocked" as const,
        summary: "Reviewed patch is ready locally",
        next: "Parent: prepare the exact publication decision",
      };
      assert.isTrue(Exit.isFailure(yield* agents.report(actor, report).pipe(Effect.exit)));
      assert.lengthOf(yield* store.list("wakes"), 0);
      const saved = yield* agents.report(actor, {
        ...report,
        needs: "User choice on the publication action",
      });
      assert.equal(saved.workState, "blocked");
      assert.equal(saved.lifecycle, "active");
      assert.equal(saved.needs, "User choice on the publication action");
      yield* agents.update(actor, {
        agentId: child.id,
        workState: "working",
        needs: null,
        next: "Collect the release evidence",
      });
      assert.equal((yield* store.get("agents", child.id))?.workState, "working");
    }).pipe(Effect.provide(TestLayer)),
);
