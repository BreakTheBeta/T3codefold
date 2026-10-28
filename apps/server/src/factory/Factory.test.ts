import { assert, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type FactoryAgent,
  type FactoryCard,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Store from "./FactoryStore.ts";
import * as Sqlite from "../persistence/Sqlite.ts";
import * as Factory from "./Factory.ts";
import { enabledControl } from "./testControl.ts";
import { FactoryAgents } from "./FactoryAgents.ts";
import { FactoryDecisions } from "./FactoryDecisions.ts";
import { FactoryActions } from "./FactoryActions.ts";
import { FactoryTriggers } from "./FactoryTriggers.ts";
import { WakeDelivery } from "./WakeDelivery.ts";
import { CommandLanes } from "./CommandLanes.ts";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { ThreadManagementService } from "../orchestration-v2/ThreadManagementService.ts";

const TestLayer = Factory.layer.pipe(
  Layer.provide(
    Layer.mergeAll(
      enabledControl,
      Layer.mock(FactoryAgents)({}),
      Layer.mock(FactoryDecisions)({}),
      Layer.mock(FactoryActions)({}),
      Layer.mock(FactoryTriggers)({}),
      Layer.mock(WakeDelivery)({}),
      Layer.mock(CommandLanes)({}),
      Layer.mock(ThreadManagementService)({}),
      Layer.mock(ServerEnvironment)({
        getEnvironmentId: Effect.succeed(EnvironmentId.make("env")),
      }),
    ),
  ),
  Layer.provideMerge(Store.layer),
  Layer.provideMerge(Sqlite.layerMemory),
);

it.effect(
  "workers can recover ancestor choices without exposing sibling work or transferring ownership",
  () =>
    Effect.gen(function* () {
      const store = yield* Store.FactoryStore;
      const factory = yield* Factory.Factory;
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
        needs: "product-choice",
        next: "Resolve the design tradeoff",
      };
      const worker = {
        ...parent,
        id: "worker",
        threadId: ThreadId.make("worker-thread"),
        role: "worker" as const,
        parentId: parent.id,
      };
      const card = (id: string, ownerId: string): FactoryCard => ({
        id,
        ownerId,
        authorId: ownerId,
        version: 0,
        createdAt: 0,
        updatedAt: 0,
        revision: 3,
        state: "answered",
        outcome: "DEFAULTED",
        optionId: "A",
        note: "",
        answeredAt: 0,
        body: {
          title: "Require reconnects after uncertain recovery?",
          kind: "decision",
          blocking: true,
          urgency: "today",
          context: {
            doing: "Recover connections",
            whyNotMe: "User owns the policy",
            costOfWaiting: "Implementation waits",
          },
          options: [],
          rationale: "",
          caveats: [],
          links: [],
        },
      });
      yield* store.transaction(
        Effect.gen(function* () {
          yield* store.put("agents", parent);
          yield* store.put("agents", worker);
          yield* store.put("agents", {
            ...worker,
            id: "sibling",
            threadId: ThreadId.make("sibling-thread"),
          });
          yield* store.put("cards", card("product-choice", parent.id));
          yield* store.put("cards", card("private-sibling", "sibling"));
        }),
      );
      const board = yield* factory.board({ kind: "agent", threadId: worker.threadId });
      assert.deepEqual(
        board.agents.map((a) => a.id),
        [worker.id],
      );
      assert.deepEqual(
        board.cards.map((c) => c.id),
        ["product-choice"],
      );
      assert.equal(board.cards[0]?.outcome, "DEFAULTED");
      assert.equal(board.cards[0]?.ownerId, parent.id);
      assert.equal(board.cards[0]?.revision, 3);
      assert.lengthOf(board.executions, 0);
    }).pipe(Effect.provide(TestLayer)),
);
