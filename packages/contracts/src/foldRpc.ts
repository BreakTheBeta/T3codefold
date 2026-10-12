/**
 * Fold-only WebSocket RPCs: fleet routing and realtime voice. `rpc.ts` spreads
 * `FOLD_WS_METHODS` into `WS_METHODS` and merges `FoldRpcGroup` into
 * `WsRpcGroup`, so upstream syncs touch only those lines there.
 */
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";

import { EnvironmentAuthorizationError } from "./auth.ts";
import {
  FleetConnectInput,
  FleetEnvironmentList,
  FleetExecuteInput,
  FleetInvocation,
  FleetInvokeInput,
  FleetResponse,
} from "./fleet.ts";
import { OrchestratorMcpFailure } from "./orchestratorMcp.ts";
import {
  ProviderRealtimeVoiceContextInput,
  ProviderRealtimeVoiceError,
  ProviderRealtimeVoiceEvent,
  ProviderRealtimeVoiceListResult,
  ProviderRealtimeVoiceStartInput,
  ProviderRealtimeVoiceStartResult,
  ProviderRealtimeVoiceStopInput,
} from "./realtimeVoice.ts";

export const FOLD_WS_METHODS = {
  // Fleet: orchestration across a client's connected environments
  fleetConnect: "fleet.connect",
  fleetRespond: "fleet.respond",
  fleetExecute: "fleet.execute",
  fleetInvoke: "fleet.invoke",
  fleetEnvironments: "fleet.environments",

  // Realtime voice (live Codex calls)
  providerRealtimeVoiceStart: "provider.realtimeVoice.start",
  providerRealtimeVoiceStop: "provider.realtimeVoice.stop",
  providerRealtimeVoiceList: "provider.realtimeVoice.list",
  providerRealtimeVoiceContext: "provider.realtimeVoice.context",
  providerRealtimeVoiceEvents: "provider.realtimeVoice.events",
} as const;

const FleetRpcError = Schema.Union([OrchestratorMcpFailure, EnvironmentAuthorizationError]);
const RealtimeVoiceRpcError = Schema.Union([
  ProviderRealtimeVoiceError,
  EnvironmentAuthorizationError,
]);

const WsFleetConnectRpc = Rpc.make(FOLD_WS_METHODS.fleetConnect, {
  payload: FleetConnectInput,
  success: FleetInvocation,
  error: FleetRpcError,
  stream: true,
});
const WsFleetRespondRpc = Rpc.make(FOLD_WS_METHODS.fleetRespond, {
  payload: FleetResponse,
  error: FleetRpcError,
});
const WsFleetExecuteRpc = Rpc.make(FOLD_WS_METHODS.fleetExecute, {
  payload: FleetExecuteInput,
  success: Schema.Unknown,
  error: FleetRpcError,
});
const WsFleetInvokeRpc = Rpc.make(FOLD_WS_METHODS.fleetInvoke, {
  payload: FleetInvokeInput,
  success: Schema.Unknown,
  error: FleetRpcError,
});
const WsFleetEnvironmentsRpc = Rpc.make(FOLD_WS_METHODS.fleetEnvironments, {
  payload: Schema.Struct({}),
  success: FleetEnvironmentList,
  error: EnvironmentAuthorizationError,
});

const WsProviderRealtimeVoiceStartRpc = Rpc.make(FOLD_WS_METHODS.providerRealtimeVoiceStart, {
  payload: ProviderRealtimeVoiceStartInput,
  success: ProviderRealtimeVoiceStartResult,
  error: RealtimeVoiceRpcError,
});
const WsProviderRealtimeVoiceStopRpc = Rpc.make(FOLD_WS_METHODS.providerRealtimeVoiceStop, {
  payload: ProviderRealtimeVoiceStopInput,
  error: RealtimeVoiceRpcError,
});
const WsProviderRealtimeVoiceListRpc = Rpc.make(FOLD_WS_METHODS.providerRealtimeVoiceList, {
  payload: ProviderRealtimeVoiceStopInput,
  success: ProviderRealtimeVoiceListResult,
  error: RealtimeVoiceRpcError,
});
const WsProviderRealtimeVoiceContextRpc = Rpc.make(FOLD_WS_METHODS.providerRealtimeVoiceContext, {
  payload: ProviderRealtimeVoiceContextInput,
  error: RealtimeVoiceRpcError,
});
const WsProviderRealtimeVoiceEventsRpc = Rpc.make(FOLD_WS_METHODS.providerRealtimeVoiceEvents, {
  payload: ProviderRealtimeVoiceStopInput,
  success: ProviderRealtimeVoiceEvent,
  stream: true,
  error: RealtimeVoiceRpcError,
});

export const FoldRpcGroup = RpcGroup.make(
  WsFleetConnectRpc,
  WsFleetRespondRpc,
  WsFleetExecuteRpc,
  WsFleetInvokeRpc,
  WsFleetEnvironmentsRpc,
  WsProviderRealtimeVoiceStartRpc,
  WsProviderRealtimeVoiceStopRpc,
  WsProviderRealtimeVoiceListRpc,
  WsProviderRealtimeVoiceContextRpc,
  WsProviderRealtimeVoiceEventsRpc,
);
