import {
  type FleetInvokeInput,
  type ThreadId,
  type RuntimeMode,
  type ProviderInteractionMode,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { FleetBroker } from "./FleetBroker.ts";
import { FleetThreadService } from "./FleetThreadService.ts";

const make = Effect.gen(function* () {
  const serverEnvironment = yield* ServerEnvironment;
  const broker = yield* FleetBroker;
  const local = yield* FleetThreadService;
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
    input: FleetInvokeInput,
    threadId: ThreadId | null = null,
    policy?: { runtimeMode: RuntimeMode; interactionMode: ProviderInteractionMode },
  ) {
    const sourceEnvironmentId = yield* serverEnvironment.getEnvironmentId;
    const environmentId = input.environmentId ?? sourceEnvironmentId;
    const request = {
      ...input,
      environmentId,
      source: { environmentId: sourceEnvironmentId, threadId, ...policy },
    };
    return yield* environmentId === sourceEnvironmentId
      ? local.execute(request)
      : broker.invoke(request);
  });
  return { environments, invoke };
});
export class FleetRouter extends Context.Service<FleetRouter, Effect.Success<typeof make>>()(
  "t3/mcp/FleetRouter",
) {}
export const layer = Layer.effect(FleetRouter, make);
