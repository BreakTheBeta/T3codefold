import * as Schema from "effect/Schema";
import { EnvironmentId, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderInteractionMode, RuntimeMode } from "./providerPolicy.ts";
import { OrchestratorMcpFailure } from "./orchestratorMcp.ts";

export const FleetEnvironment = Schema.Struct({
  environmentId: EnvironmentId,
  label: TrimmedNonEmptyString,
});
export type FleetEnvironment = typeof FleetEnvironment.Type;
export const FleetOperation = Schema.Literals([
  "orchestrator_capabilities",
  "t3_project_list",
  "t3_thread_start",
  "t3_thread_list",
  "t3_thread_read",
  "t3_thread_send",
  "t3_thread_wait",
]);
export type FleetOperation = typeof FleetOperation.Type;
export const FleetSource = Schema.Struct({
  environmentId: EnvironmentId,
  threadId: Schema.NullOr(ThreadId),
  runtimeMode: Schema.optional(RuntimeMode),
  interactionMode: Schema.optional(ProviderInteractionMode),
});
export const FleetExecuteInput = Schema.Struct({
  source: FleetSource,
  environmentId: EnvironmentId,
  projectId: Schema.optional(ProjectId),
  operation: FleetOperation,
  input: Schema.Unknown,
});
export type FleetExecuteInput = typeof FleetExecuteInput.Type;
export const FleetInvocation = Schema.Struct({
  requestId: TrimmedNonEmptyString,
  request: FleetExecuteInput,
});
export type FleetInvocation = typeof FleetInvocation.Type;
export const FleetConnectInput = Schema.Struct({
  clientId: TrimmedNonEmptyString,
  environments: Schema.Array(FleetEnvironment),
});
export type FleetConnectInput = typeof FleetConnectInput.Type;
export const FleetResponse = Schema.Struct({
  requestId: TrimmedNonEmptyString,
  result: Schema.Union([
    Schema.Struct({ ok: Schema.Literal(true), value: Schema.Unknown }),
    Schema.Struct({ ok: Schema.Literal(false), error: OrchestratorMcpFailure }),
  ]),
});
export type FleetResponse = typeof FleetResponse.Type;
export const FleetInvokeInput = Schema.Struct({
  environmentId: Schema.optional(EnvironmentId),
  projectId: Schema.optional(ProjectId),
  operation: FleetOperation,
  input: Schema.Unknown,
});
export type FleetInvokeInput = typeof FleetInvokeInput.Type;
export const FleetEnvironmentList = Schema.Struct({ environments: Schema.Array(FleetEnvironment) });
export type FleetEnvironmentList = typeof FleetEnvironmentList.Type;
export const FleetProjectList = Schema.Struct({
  environmentId: EnvironmentId,
  projects: Schema.Array(
    Schema.Struct({ projectId: ProjectId, title: Schema.String, workspaceRoot: Schema.String }),
  ),
});
