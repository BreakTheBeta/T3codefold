import { CommandId } from "@t3tools/contracts";
import { ThreadManagementService } from "../orchestration-v2/ThreadManagementService.ts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Factory } from "./Factory.ts";
import { FactoryStore } from "./FactoryStore.ts";
import * as Scheduler from "../scheduling/Scheduler.ts";

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const factory = yield* Factory;
    const store = yield* FactoryStore;
    const threads = yield* ThreadManagementService;
    const scheduler = yield* Scheduler.Scheduler;
    yield* factory.actions.recover;
    yield* scheduler.register("factory-wakes", factory.wakes.drain);
    yield* scheduler.register("factory-triggers", factory.triggers.runDue);
    yield* scheduler.register("factory-lanes", factory.lanes.tick);
    yield* scheduler.register(
      "factory-closed-agents",
      Effect.gen(function* () {
        for (const agent of (yield* store.list("agents")).filter((a) => a.lifecycle === "closed")) {
          yield* Effect.gen(function* () {
            const shell = yield* threads.getThreadShell(agent.threadId);
            if (shell?.activeRunId || shell?.pendingRuntimeRequest)
              yield* threads.dispatch({
                type: "thread.stop",
                threadId: agent.threadId,
                commandId: CommandId.make(`factory:close:${agent.id}:${agent.version}`),
                stopDelegatedTasks: true,
              });
          }).pipe(
            Effect.catch((cause) =>
              Effect.logWarning("Factory close cleanup remains pending", {
                agentId: agent.id,
                cause,
              }),
            ),
          );
        }
      }),
    );
    yield* scheduler.register(
      "factory-spawns",
      Effect.gen(function* () {
        const now = DateTime.toEpochMillis(yield* DateTime.now);
        for (const spawn of yield* store.list("spawns"))
          if (!["launched", "cancelled"].includes(spawn.state) && spawn.retryAt <= now)
            yield* factory.agents.resume(spawn).pipe(
              Effect.catch((cause) =>
                Effect.logWarning("Factory spawn recovery failed", {
                  spawnId: spawn.id,
                  category: cause.code,
                }),
              ),
            );
      }),
    );
  }),
);
