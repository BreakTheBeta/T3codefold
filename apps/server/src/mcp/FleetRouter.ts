import {
  type EnvironmentId,
  type FleetOperation,
  FleetSource,
  OrchestratorMcpFailure,
  type ProjectId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { FleetBroker } from "./FleetBroker.ts";
import type { McpInvocationScope } from "./McpInvocationContext.ts";
import type { CallerLimits } from "./threadAccess.ts";

/** The MCP caller a routed request acts for; absent for the admin `t3 fleet` CLI. */
export interface FleetCaller {
  readonly scope: McpInvocationScope;
  readonly limits: CallerLimits;
}

export interface FleetRemoteRequest {
  readonly environmentId: EnvironmentId;
  readonly projectId?: ProjectId | undefined;
  readonly operation: FleetOperation;
  readonly input: unknown;
}

/**
 * The source side of fleet: which environments this server can reach, and
 * dispatch of a request to one of them through a connected client. Local
 * execution is FleetExecutor's job, so MCP handlers can depend on the router
 * without a layer cycle through the executor.
 */
const make = Effect.gen(function* () {
  const serverEnvironment = yield* ServerEnvironment;
  const broker = yield* FleetBroker;
  const environments = Effect.gen(function* () {
    const descriptor = yield* serverEnvironment.getDescriptor;
    const advertised = yield* broker.environments;
    return {
      environments: [
        { environmentId: descriptor.environmentId, label: descriptor.label },
        ...advertised.filter((item) => item.environmentId !== descriptor.environmentId),
      ],
    };
  });
  const invoke = Effect.fn("FleetRouter.invoke")(function* (
    caller: FleetCaller | undefined,
    request: FleetRemoteRequest,
  ) {
    const sourceEnvironmentId = yield* serverEnvironment.getEnvironmentId;
    // Never loop back through a client: a local target must run locally.
    if (request.environmentId === sourceEnvironmentId)
      return yield* new OrchestratorMcpFailure({
        code: "invalid_request",
        message: "The selected environment is this environment; run the operation locally.",
      });
    const source: typeof FleetSource.Type = {
      environmentId: sourceEnvironmentId,
      threadId: caller?.scope.thread?.threadId ?? null,
      ...(caller === undefined
        ? {}
        : {
            runtimeMode: caller.limits.runtimeMode,
            interactionMode: caller.limits.interactionMode,
          }),
    };
    return yield* broker.invoke({
      source,
      environmentId: request.environmentId,
      ...(request.projectId === undefined ? {} : { projectId: request.projectId }),
      operation: request.operation,
      input: request.input,
    });
  });
  return { environments, invoke };
});
export class FleetRouter extends Context.Service<FleetRouter, Effect.Success<typeof make>>()(
  "t3/mcp/FleetRouter",
) {}
export const layer = Layer.effect(FleetRouter, make);
