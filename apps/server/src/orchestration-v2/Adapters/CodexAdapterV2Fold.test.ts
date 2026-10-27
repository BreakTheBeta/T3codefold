import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import {
  CodexSettings,
  EnvironmentId,
  type ModelSelection,
  ProviderInstanceId,
  ProviderSessionId,
  ThreadId,
} from "@t3tools/contracts";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as ProviderEventLoggers from "@t3tools/provider-core/server/ProviderEventLoggers";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import * as ServerConfig from "../../config.ts";
import * as CodexAdapterV2 from "./CodexAdapterV2.ts";
import { codexPermissionApprovalPrompt } from "./CodexAdapterV2Fold.ts";

const DEFAULT_CODEX_SETTINGS = Schema.decodeSync(CodexSettings)({});
const CODEX_TEST_MODEL_SELECTION = {
  instanceId: CodexAdapterV2.CODEX_DEFAULT_INSTANCE_ID,
  model: "gpt-5.4",
} satisfies ModelSelection;
const CODEX_TEST_RUNTIME_POLICY = ProviderAdapter.ProviderAdapterV2RuntimePolicy.make({
  runtimeMode: "full-access",
  interactionMode: "default",
  cwd: "/workspace",
});

describe("CodexAdapterV2 permission approvals", () => {
  it("prefers a nonblank reason, else names the requested paths", () => {
    const permissions = {
      fileSystem: { read: ["/workspace/notes.md"], write: ["/workspace/out"] },
    };
    assert.equal(
      codexPermissionApprovalPrompt({ reason: " Read notes. ", permissions }),
      "Read notes.",
    );
    assert.equal(
      codexPermissionApprovalPrompt({ reason: null, permissions }),
      "Access: /workspace/notes.md, /workspace/out",
    );
    assert.isUndefined(codexPermissionApprovalPrompt({ reason: " ", permissions: {} }));
  });
});
