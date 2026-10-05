import {
  type EnvironmentId,
  type FleetOperation,
  OrchestratorMcpFailure,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { FleetRouter } from "../FleetRouter.ts";
import { McpInvocationContext } from "../McpInvocationContext.ts";
import { readCaller, readMutationCaller } from "../threadAccess.ts";

/** Operations that change the destination; their source must be allowed to mutate. */
const MUTATIONS: ReadonlySet<FleetOperation> = new Set([
  "t3_thread_launch",
  "t3_thread_start",
  "t3_thread_send",
]);

const invalidResult = (error: Schema.SchemaError) =>
  new OrchestratorMcpFailure({
    code: "orchestration_error",
    message: `Destination returned an invalid result: ${error.message}`,
  });

/**
 * Runs a fleet-routable MCP tool on another environment when its input names
 * one, and otherwise runs the local handler untouched. Only an explicit
 * `environmentId` different from the caller's environment routes; a
 * `projectId` alone always means a local project. Use it data-last at the end
 * of a handler: `Effect.gen(...).pipe(routeIfRemote("t3_thread_read", input, Result))`.
 *
 * The destination enforces the caller's limits: a thread caller sends its own
 * thread's modes, a client caller its approved ceiling.
 */
export const routeIfRemote =
  <S extends Schema.Top>(
    operation: FleetOperation,
    input: { readonly environmentId?: EnvironmentId | undefined },
    success: S,
  ) =>
  <A, E, R>(local: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      const environmentId = input.environmentId;
      if (environmentId === undefined || environmentId === scope.environmentId) return yield* local;
      const { limits } = MUTATIONS.has(operation)
        ? yield* readMutationCaller()
        : yield* readCaller();
      const router = yield* FleetRouter;
      const value = yield* router.invoke({ scope, limits }, { environmentId, operation, input });
      return yield* Schema.decodeUnknownEffect(success)(value).pipe(Effect.mapError(invalidResult));
    }).pipe(Effect.withSpan("mcp.fleet.routeIfRemote", { attributes: { operation } }));
