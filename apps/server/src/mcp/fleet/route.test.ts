import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as ThreadManagement from "../../orchestration-v2/ThreadManagementService.ts";
import { FleetRouter, type FleetCaller, type FleetRemoteRequest } from "../FleetRouter.ts";
import { McpInvocationContext } from "../McpInvocationContext.ts";
import { routeIfRemote } from "./route.ts";

const localId = EnvironmentId.make("laptop");
const remoteId = EnvironmentId.make("server");
const threadId = ThreadId.make("source-thread");
const providerInstanceId = ProviderInstanceId.make("codex");
const Result = Schema.Struct({ value: Schema.String });

function fixture(
  options: { readonly activeRunId?: string | null; readonly remote?: unknown } = {},
) {
  const routed: Array<[FleetCaller | undefined, FleetRemoteRequest]> = [];
  const caller = {
    id: threadId,
    projectId: ProjectId.make("project"),
    providerInstanceId,
    runtimeMode: "auto-accept-edits",
    interactionMode: "plan",
    activeRunId: options.activeRunId === undefined ? "run" : options.activeRunId,
    archivedAt: null,
    deletedAt: null,
  } as OrchestrationV2ThreadShell;
  const layer = Layer.mergeAll(
    Layer.succeed(McpInvocationContext, {
      environmentId: localId,
      capabilities: new Set(["orchestration" as const]),
      issuedAt: 0,
      requestNamespace: "session",
      thread: { threadId, providerSessionId: "session", providerInstanceId },
      client: undefined,
    }),
    Layer.mock(ThreadManagement.ThreadManagementService)({
      getThreadShell: () => Effect.succeed(caller),
    }),
    Layer.mock(FleetRouter)({
      invoke: (fleetCaller, request) =>
        Effect.sync(() => {
          routed.push([fleetCaller, request]);
          return options.remote ?? { value: "remote" };
        }),
    }),
  );
  return { routed, layer };
}

const local = Effect.succeed({ value: "local" });

it.effect("runs the local handler unless another environment is named", () => {
  const f = fixture();
  return Effect.gen(function* () {
    expect(yield* local.pipe(routeIfRemote("t3_thread_read", {}, Result))).toEqual({
      value: "local",
    });
    expect(
      yield* local.pipe(routeIfRemote("t3_thread_read", { environmentId: localId }, Result)),
    ).toEqual({ value: "local" });
    expect(f.routed).toEqual([]);
  }).pipe(Effect.provide(f.layer));
});

it.effect("routes a named environment with the calling thread's modes as limits", () => {
  const f = fixture();
  return Effect.gen(function* () {
    const input = { environmentId: remoteId, threadId: ThreadId.make("remote-thread") };
    const result = yield* local.pipe(routeIfRemote("t3_thread_read", input, Result));
    expect(result).toEqual({ value: "remote" });
    expect(f.routed).toHaveLength(1);
    const [caller, request] = f.routed[0]!;
    expect(caller?.scope.thread?.threadId).toBe(threadId);
    expect(caller?.limits).toEqual({ runtimeMode: "auto-accept-edits", interactionMode: "plan" });
    expect(request).toEqual({ environmentId: remoteId, operation: "t3_thread_read", input });
  }).pipe(Effect.provide(f.layer));
});

it.effect("needs a live calling run before routing a mutation", () => {
  const f = fixture({ activeRunId: null });
  return Effect.gen(function* () {
    const input = { environmentId: remoteId, threadId: ThreadId.make("remote"), message: "hi" };
    const failure = yield* Effect.flip(local.pipe(routeIfRemote("t3_thread_send", input, Result)));
    expect(failure.code).toBe("parent_not_active");
    // Reads stay available to a thread whose turn ended.
    yield* local.pipe(routeIfRemote("t3_thread_read", input, Result));
    expect(f.routed).toHaveLength(1);
  }).pipe(Effect.provide(f.layer));
});

it.effect("rejects a destination result that does not match the tool's schema", () => {
  const f = fixture({ remote: { value: 42 } });
  return Effect.gen(function* () {
    const failure = yield* Effect.flip(
      local.pipe(routeIfRemote("t3_thread_read", { environmentId: remoteId }, Result)),
    );
    expect(failure.code).toBe("orchestration_error");
    expect(failure.message).toContain("Destination returned an invalid result");
  }).pipe(Effect.provide(f.layer));
});
