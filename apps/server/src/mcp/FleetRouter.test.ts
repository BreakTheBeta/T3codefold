import { it } from "@effect/vitest";
import {
  EnvironmentId,
  ThreadId,
  OrchestratorMcpFailure,
  type FleetExecuteInput,
  type ExecutionEnvironmentDescriptor,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { expect } from "vite-plus/test";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { FleetBroker } from "./FleetBroker.ts";
import { FleetThreadService } from "./FleetThreadService.ts";
import { FleetRouter, layer } from "./FleetRouter.ts";

const localId = EnvironmentId.make("laptop");
const remoteId = EnvironmentId.make("server");
function fixture(remoteFails = false) {
  const localCalls: FleetExecuteInput[] = [];
  const remoteCalls: FleetExecuteInput[] = [];
  const dependencies = Layer.mergeAll(
    Layer.succeed(ServerEnvironment, {
      getEnvironmentId: Effect.succeed(localId),
      getDescriptor: Effect.succeed({
        environmentId: localId,
        label: "Work laptop",
        platform: { os: "darwin", arch: "arm64" },
        serverVersion: "test",
        capabilities: { repositoryIdentity: true },
      } satisfies ExecutionEnvironmentDescriptor),
    }),
    Layer.succeed(FleetBroker, {
      connect: () => Effect.die("unused"),
      environments: Effect.succeed([
        { environmentId: localId, label: "stale label" },
        { environmentId: remoteId, label: "Home server" },
      ]),
      invoke: (request) =>
        Effect.gen(function* () {
          remoteCalls.push(request);
          if (remoteFails)
            return yield* new OrchestratorMcpFailure({
              code: "orchestration_error",
              message: "Remote disconnected",
            });
          return { routed: "remote" };
        }),
      respond: () => Effect.die("unused"),
    }),
    Layer.succeed(FleetThreadService, {
      execute: (request) =>
        Effect.sync(() => {
          localCalls.push(request);
          return { routed: "local" };
        }),
    }),
  );
  return { localCalls, remoteCalls, layer: layer.pipe(Layer.provide(dependencies)) };
}

it.effect(
  "uses the authoritative local descriptor once, plus connected remote environments",
  () => {
    const f = fixture();
    return Effect.gen(function* () {
      const router = yield* FleetRouter;
      expect(yield* router.environments).toEqual({
        environments: [
          { environmentId: localId, label: "Work laptop" },
          { environmentId: remoteId, label: "Home server" },
        ],
      });
    }).pipe(Effect.provide(f.layer));
  },
);
it.effect("defaults CLI requests to local execution and stamps the source server", () => {
  const f = fixture();
  return Effect.gen(function* () {
    const router = yield* FleetRouter;
    expect(yield* router.invoke({ operation: "t3_thread_list", input: {} })).toEqual({
      routed: "local",
    });
    expect(f.localCalls).toEqual([
      {
        operation: "t3_thread_list",
        input: {},
        environmentId: localId,
        source: { environmentId: localId, threadId: null },
      },
    ]);
    expect(f.remoteCalls).toEqual([]);
  }).pipe(Effect.provide(f.layer));
});
it.effect("forwards agent source and policy only to the exact selected environment", () => {
  const f = fixture();
  return Effect.gen(function* () {
    const router = yield* FleetRouter;
    const threadId = ThreadId.make("source-thread");
    const input = { prompt: "continue", runtimeMode: "full-access", clientRequestId: "retry-key" };
    yield* router.invoke(
      { environmentId: remoteId, operation: "t3_thread_start", input },
      threadId,
      { runtimeMode: "approval-required", interactionMode: "plan" },
    );
    expect(f.remoteCalls).toEqual([
      {
        environmentId: remoteId,
        operation: "t3_thread_start",
        input,
        source: {
          environmentId: localId,
          threadId,
          runtimeMode: "approval-required",
          interactionMode: "plan",
        },
      },
    ]);
    expect(f.localCalls).toEqual([]);
  }).pipe(Effect.provide(f.layer));
});
it.effect("never falls back to local execution when a remote route fails", () => {
  const f = fixture(true);
  return Effect.gen(function* () {
    const router = yield* FleetRouter;
    const result = yield* Effect.result(
      router.invoke({
        environmentId: remoteId,
        operation: "t3_thread_send",
        input: { threadId: "remote-thread", message: "continue" },
      }),
    );
    expect(result._tag === "Failure" && result.failure.message).toBe("Remote disconnected");
    expect(f.remoteCalls).toHaveLength(1);
    expect(f.localCalls).toEqual([]);
  }).pipe(Effect.provide(f.layer));
});
it.effect(
  "explicit local selection retains provider policy without involving the client bridge",
  () => {
    const f = fixture();
    return Effect.gen(function* () {
      const router = yield* FleetRouter;
      const threadId = ThreadId.make("source-thread");
      yield* router.invoke(
        {
          environmentId: localId,
          operation: "t3_thread_read",
          input: { threadId: "target-thread" },
        },
        threadId,
        { runtimeMode: "approval-required", interactionMode: "default" },
      );
      expect(f.localCalls[0]?.source).toEqual({
        environmentId: localId,
        threadId,
        runtimeMode: "approval-required",
        interactionMode: "default",
      });
      expect(f.remoteCalls).toEqual([]);
    }).pipe(Effect.provide(f.layer));
  },
);
