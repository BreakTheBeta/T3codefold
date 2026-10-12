import { expect, it } from "@effect/vitest";
import {
  AuthSessionId,
  ProviderRealtimeVoiceError,
  ThreadId,
  WS_METHODS,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { FleetBroker } from "./mcp/FleetBroker.ts";
import { FleetExecutor } from "./mcp/FleetExecutor.ts";
import { FleetRouter } from "./mcp/FleetRouter.ts";
import { OrchestratorProjectionError } from "./orchestration-v2/Orchestrator.ts";
import { ProviderSessionManagerV2 } from "./orchestration-v2/ProviderSessionManager.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { makeFoldWsHandlers } from "./ws.ts";

const threadId = ThreadId.make("missing");

const services = (threads: Partial<ThreadManagementService["Service"]>) =>
  Layer.mergeAll(
    Layer.mock(FleetBroker, {}),
    Layer.mock(FleetRouter, {}),
    Layer.mock(FleetExecutor, {}),
    Layer.mock(ThreadManagementService, threads),
    Layer.mock(ProviderSessionManagerV2, {}),
  );

it.effect("reports voice failures as typed voice errors for the operation", () =>
  Effect.gen(function* () {
    const fold = yield* makeFoldWsHandlers({ sessionId: AuthSessionId.make("session") });
    const start = yield* Effect.flip(
      fold[WS_METHODS.providerRealtimeVoiceStart]({ threadId, sdp: "v=0" }),
    );
    const stop = yield* Effect.flip(fold[WS_METHODS.providerRealtimeVoiceStop]({ threadId }));
    expect(start).toEqual(new ProviderRealtimeVoiceError({ threadId, operation: "start" }));
    expect(stop).toEqual(new ProviderRealtimeVoiceError({ threadId, operation: "stop" }));
  }).pipe(
    Effect.provide(
      services({
        getThreadProjection: (id) => Effect.fail(new OrchestratorProjectionError({ threadId: id })),
      }),
    ),
  ),
);
