import { assert, it } from "@effect/vitest";
import { EnvironmentId, ProjectId, ThreadId, type FactoryAgent } from "@t3tools/contracts";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Sqlite from "../persistence/Sqlite.ts";
import * as Store from "./FactoryStore.ts";
import * as Queue from "./WakeQueue.ts";
import * as Triggers from "./FactoryTriggers.ts";
import { enabledControl } from "./testControl.ts";
import { ProcessRunner } from "../processRunner.ts";
import { ProjectService } from "../project/ProjectService.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { ThreadManagementService } from "../orchestration-v2/ThreadManagementService.ts";

const TestLayer = Triggers.layer.pipe(
  Layer.provide(
    Layer.mergeAll(
      NodeCrypto.layer,
      Layer.mock(ProcessRunner)({}),
      Layer.mock(ProjectService)({}),
      Layer.mock(ServerSettingsService)({}),
      Layer.mock(ThreadManagementService)({}),
    ),
  ),
  Layer.provideMerge(Queue.layer),
  Layer.provideMerge(enabledControl),
  Layer.provideMerge(Store.layer),
  Layer.provideMerge(Sqlite.layerMemory),
);

it.effect("stall checks do not reactivate assignments already reported done or blocked", () =>
  Effect.gen(function* () {
    const store = yield* Store.FactoryStore;
    const triggers = yield* Triggers.FactoryTriggers;
    const parent: FactoryAgent = {
      id: "parent",
      version: 0,
      createdAt: 0,
      updatedAt: 0,
      environmentId: EnvironmentId.make("env"),
      projectId: ProjectId.make("project"),
      threadId: ThreadId.make("parent-thread"),
      role: "commander",
      parentId: null,
      generation: 1,
      lifecycle: "active",
      capsule: "Lead",
      capsuleRevision: 1,
      needs: null,
      next: "Handle reports",
    };
    yield* store.transaction(
      Effect.gen(function* () {
        yield* store.put("agents", parent);
        for (const workState of ["done", "blocked"] as const)
          yield* store.put("agents", {
            ...parent,
            id: workState,
            threadId: ThreadId.make(workState),
            role: "worker",
            parentId: parent.id,
            workState,
          });
      }),
    );
    yield* triggers.upsert(
      { kind: "user" },
      {
        id: "stall",
        targetId: parent.id,
        intervalMs: 5000,
        check: { type: "builtin", name: "stall-watch" },
        prompt: "{{items}}",
        rearm: { type: "never" },
        enabled: true,
        shadow: false,
      },
    );
    const run = yield* triggers.run("stall");
    assert.equal(run.outcome, "quiet");
    assert.equal(run.itemCount, 0);
    assert.lengthOf(yield* store.list("wakes"), 0);
  }).pipe(Effect.provide(TestLayer)),
);
