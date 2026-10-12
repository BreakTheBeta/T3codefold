import { AuthOrchestrationOperateScope, WS_METHODS } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { requiredScopeForRpcMethod } from "./auth/RpcAuthorization.ts";

describe("Fold RPC authorization scopes", () => {
  it("requires permission to operate on a thread for realtime voice", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.providerRealtimeVoiceStart)).toBe(
      AuthOrchestrationOperateScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.providerRealtimeVoiceStop)).toBe(
      AuthOrchestrationOperateScope,
    );
  });
});
