import { it } from "@effect/vitest";
import {
  EnvironmentId,
  ProviderInstanceId,
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
import { FleetRouter, layer } from "./FleetRouter.ts";
import type { McpInvocationScope } from "./McpInvocationContext.ts";

const localId = EnvironmentId.make("laptop");
const remoteId = EnvironmentId.make("server");
// The results are `unknown`, so flipping them would put `unknown` in the error channel.
const failureOf = <E>(effect: Effect.Effect<unknown, E>) => Effect.flip(Effect.asVoid(effect));

function fixture(remoteFails = false) {
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
  );
  return { remoteCalls, layer: layer.pipe(Layer.provide(dependencies)) };
}

const threadScope = (threadId: ThreadId): McpInvocationScope => ({
  environmentId: localId,
  capabilities: new Set(["orchestration"]),
  issuedAt: 0,
  requestNamespace: "session",
  thread: {
    threadId,
    providerSessionId: "session",
    providerInstanceId: ProviderInstanceId.make("codex"),
  },
  client: undefined,
});

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

it.effect("forwards the calling thread and its limits to the selected environment", () => {
  const f = fixture();
  return Effect.gen(function* () {
    const router = yield* FleetRouter;
    const threadId = ThreadId.make("source-thread");
    const input = { title: "Handoff", message: "continue", clientRequestId: "retry-key" };
    yield* router.invoke(
      {
        scope: threadScope(threadId),
        limits: { runtimeMode: "approval-required", interactionMode: "plan" },
      },
      { environmentId: remoteId, operation: "t3_thread_launch", input },
    );
    expect(f.remoteCalls).toEqual([
      {
        environmentId: remoteId,
        operation: "t3_thread_launch",
        input,
        source: {
          environmentId: localId,
          threadId,
          runtimeMode: "approval-required",
          interactionMode: "plan",
        },
      },
    ]);
  }).pipe(Effect.provide(f.layer));
});

it.effect("stamps CLI requests with no source thread and no limits", () => {
  const f = fixture();
  return Effect.gen(function* () {
    const router = yield* FleetRouter;
    yield* router.invoke(undefined, {
      environmentId: remoteId,
      operation: "t3_thread_list",
      input: {},
    });
    expect(f.remoteCalls[0]?.source).toEqual({ environmentId: localId, threadId: null });
  }).pipe(Effect.provide(f.layer));
});

it.effect("never sends a request for this environment through a client", () => {
  const f = fixture();
  return Effect.gen(function* () {
    const router = yield* FleetRouter;
    const failure = yield* failureOf(
      router.invoke(undefined, { environmentId: localId, operation: "t3_thread_list", input: {} }),
    );
    expect(failure.code).toBe("invalid_request");
    expect(f.remoteCalls).toEqual([]);
  }).pipe(Effect.provide(f.layer));
});

it.effect("surfaces a failed remote route instead of falling back", () => {
  const f = fixture(true);
  return Effect.gen(function* () {
    const router = yield* FleetRouter;
    const failure = yield* failureOf(
      router.invoke(undefined, {
        environmentId: remoteId,
        operation: "t3_thread_send",
        input: { threadId: "remote-thread", message: "continue" },
      }),
    );
    expect(failure.message).toBe("Remote disconnected");
    expect(f.remoteCalls).toHaveLength(1);
  }).pipe(Effect.provide(f.layer));
});
