import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import {
  providerSessionEnvironment,
  setMcpProviderSession,
  clearMcpProviderSession,
  withAgentDeviceEnvironment,
} from "./McpProviderSession.ts";

describe("device CLI environment", () => {
  it("preserves provider credentials and commands while routing devices to the owned daemon", () => {
    const environment = withAgentDeviceEnvironment(
      { PATH: "/provider/bin:/usr/bin", PROVIDER_KEY: "fixture" },
      {
        agentDeviceEnvironment: {
          PATH: "/t3/device/bin",
          PATH_SEPARATOR: ":",
          AGENT_DEVICE_DAEMON_BASE_URL: "http://127.0.0.1:9000",
          AGENT_DEVICE_DAEMON_AUTH_TOKEN: "fixture-device",
        },
      },
    );
    expect(environment).toEqual({
      PATH: "/t3/device/bin:/provider/bin:/usr/bin",
      PROVIDER_KEY: "fixture",
      AGENT_DEVICE_DAEMON_BASE_URL: "http://127.0.0.1:9000",
      AGENT_DEVICE_DAEMON_AUTH_TOKEN: "fixture-device",
    });
  });

  it("does not grant CLI access when device access was not supplied", () => {
    const environment = { PATH: "/usr/bin", PROVIDER_KEY: "fixture" };
    expect(withAgentDeviceEnvironment(environment, undefined)).toBe(environment);
    expect(withAgentDeviceEnvironment(environment, {})).toBe(environment);
  });
});

describe("combined thread tooling environment", () => {
  it("keeps work authority thread-local while adding the device shim", () => {
    const threadId = ThreadId.make("combined-environment-test");
    setMcpProviderSession({
      threadId,
      environmentId: EnvironmentId.make("fixture-env"),
      providerSessionId: "fixture-session",
      providerInstanceId: ProviderInstanceId.make("codex"),
      endpoint: "http://localhost:9000/mcp",
      authorizationHeader: "Bearer fixture-work",
      browserToolsAvailable: false,
      capabilities: new Set(["device", "orchestration"]),
      agentDeviceEnvironment: {
        PATH: "/device/bin",
        AGENT_DEVICE_DAEMON_AUTH_TOKEN: "fixture-device",
      },
    });
    try {
      expect(
        providerSessionEnvironment({ PATH: "/usr/bin", PROVIDER_KEY: "fixture" }, threadId),
      ).toEqual({
        PATH: "/device/bin:/usr/bin",
        PROVIDER_KEY: "fixture",
        AGENT_DEVICE_DAEMON_AUTH_TOKEN: "fixture-device",
        T3_WORK_ENDPOINT: "http://localhost:9000/mcp",
        T3_WORK_AUTHORIZATION: "Bearer fixture-work",
      });
      expect(providerSessionEnvironment({ PATH: "/usr/bin" }, ThreadId.make("unrelated"))).toEqual({
        PATH: "/usr/bin",
      });
    } finally {
      clearMcpProviderSession(threadId);
    }
  });
});
