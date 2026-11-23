import { AuthOrchestrationOperateScope, WS_METHODS } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { requiredScopeForRpcMethod } from "./auth/RpcAuthorization.ts";

describe("Fold RPC authorization scopes", () => {
  it("requires permission to operate on a thread for realtime voice", () => {
    for (const method of [
      WS_METHODS.voiceCompanionStart,
      WS_METHODS.voiceCompanionStop,
      WS_METHODS.voiceCompanionSelect,
      WS_METHODS.voiceCompanionContext,
      WS_METHODS.voiceCompanionList,
      WS_METHODS.voiceCompanionEvents,
    ]) {
      expect(requiredScopeForRpcMethod(method)).toBe(AuthOrchestrationOperateScope);
    }
    expect(requiredScopeForRpcMethod(WS_METHODS.providerRealtimeVoiceStart)).toBe(
      AuthOrchestrationOperateScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.providerRealtimeVoiceStop)).toBe(
      AuthOrchestrationOperateScope,
    );
  });
});
