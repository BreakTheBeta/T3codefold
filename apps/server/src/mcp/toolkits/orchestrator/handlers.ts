import { WorkStore } from "../../../pitboss/WorkStore.ts";
import {
  OrchestratorMcpFailure,
  OrchestratorMcpCapabilitiesResult,
  OrchestratorMcpCreatedThread,
  OrchestratorMcpThreadListResult,
  OrchestratorMcpThreadReadResult,
  OrchestratorMcpThreadSendResult,
  OrchestratorMcpThreadWaitResult,
  FleetProjectList,
  type FleetInvokeInput,
  type EnvironmentId,
  type ProjectId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { FleetRouter } from "../../FleetRouter.ts";
import { resolveRuntimeMode, resolveInteractionMode } from "../../OrchestratorMcpService.ts";
import type { McpInvocationScope } from "../../McpInvocationContext.ts";
import { OrchestratorToolkit } from "./tools.ts";
import * as Effect from "effect/Effect";

import { McpInvocationContext } from "../../McpInvocationContext.ts";
import { OrchestratorMcpService } from "../../OrchestratorMcpService.ts";
import { ThreadMetadataMcpService } from "../../ThreadMetadataMcpService.ts";

const decodeFleetProjectList = Schema.decodeUnknownEffect(FleetProjectList);
const decodeOrchestratorMcpCapabilitiesResult = Schema.decodeUnknownEffect(
  OrchestratorMcpCapabilitiesResult,
);
const decodeOrchestratorMcpCreatedThread = Schema.decodeUnknownEffect(OrchestratorMcpCreatedThread);
const decodeOrchestratorMcpThreadListResult = Schema.decodeUnknownEffect(
  OrchestratorMcpThreadListResult,
);
const decodeOrchestratorMcpThreadReadResult = Schema.decodeUnknownEffect(
  OrchestratorMcpThreadReadResult,
);
const decodeOrchestratorMcpThreadSendResult = Schema.decodeUnknownEffect(
  OrchestratorMcpThreadSendResult,
);
const decodeOrchestratorMcpThreadWaitResult = Schema.decodeUnknownEffect(
  OrchestratorMcpThreadWaitResult,
);

const shouldRoute = (
  scope: McpInvocationScope,
  input: { environmentId?: EnvironmentId | undefined; projectId?: ProjectId | undefined },
) =>
  input.projectId !== undefined ||
  (input.environmentId !== undefined && input.environmentId !== scope.environmentId);
const invalidResult = (error: { message: string }) =>
  new OrchestratorMcpFailure({
    code: "orchestration_error",
    message: `Destination returned an invalid result: ${error.message}`,
  });
const invoke = (input: FleetInvokeInput) =>
  Effect.gen(function* () {
    const scope = yield* McpInvocationContext;
    const service = yield* OrchestratorMcpService;
    const policy = yield* service.capabilities(scope);
    const router = yield* FleetRouter;
    return yield* router.invoke(input, scope.threadId, {
      runtimeMode: policy.runtimeMode,
      interactionMode: policy.interactionMode,
    });
  });

export const handlers = {
  work_read: () =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      return yield* (yield* WorkStore).read({ type: "agent", threadId: scope.threadId });
    }),
  work_command: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      return yield* (yield* WorkStore).command(input, { type: "agent", threadId: scope.threadId });
    }),
  t3_environment_list: () =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      yield* (yield* OrchestratorMcpService).capabilities(scope);
      return yield* (yield* FleetRouter).environments;
    }),
  t3_project_list: (input) =>
    Effect.gen(function* () {
      const result = yield* invoke({ ...input, operation: "t3_project_list", input: {} });
      return yield* decodeFleetProjectList(result).pipe(Effect.mapError(invalidResult));
    }),
  orchestrator_capabilities: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      const service = yield* OrchestratorMcpService;
      if (shouldRoute(scope, input)) {
        const result = yield* invoke({
          ...input,
          operation: "orchestrator_capabilities",
          input: {},
        });
        return yield* decodeOrchestratorMcpCapabilitiesResult(result).pipe(
          Effect.mapError(invalidResult),
        );
      }
      return yield* service.capabilities(scope);
    }),
  delegate_task: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      const service = yield* OrchestratorMcpService;
      return yield* service.delegateTask(scope, input);
    }),
  task_status: ({ taskId }) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      const service = yield* OrchestratorMcpService;
      return yield* service.taskStatus(scope, taskId);
    }),
  task_cancel: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      const service = yield* OrchestratorMcpService;
      return yield* service.cancelTask(scope, input);
    }),
  schedule_task: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      const service = yield* OrchestratorMcpService;
      return yield* service.scheduleTask(scope, input);
    }),
  list_scheduled_tasks: () =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      const service = yield* OrchestratorMcpService;
      return yield* service.listScheduledTasks(scope);
    }),
  update_scheduled_task: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      const service = yield* OrchestratorMcpService;
      return yield* service.updateScheduledTask(scope, input);
    }),
  delete_scheduled_task: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      const service = yield* OrchestratorMcpService;
      return yield* service.deleteScheduledTask(scope, input);
    }),
  create_threads: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      const service = yield* OrchestratorMcpService;
      return yield* service.createThreads(scope, input);
    }),
  t3_thread_start: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      const service = yield* OrchestratorMcpService;
      if (shouldRoute(scope, input)) {
        const capabilities = yield* service.capabilities(scope);
        const runtimeMode = yield* resolveRuntimeMode(capabilities.runtimeMode, input.runtimeMode);
        const interactionMode = yield* resolveInteractionMode(
          capabilities.interactionMode,
          input.interactionMode,
        );
        const result = yield* invoke({
          environmentId: input.environmentId,
          projectId: input.projectId,
          operation: "t3_thread_start",
          input: { ...input, runtimeMode, interactionMode },
        });
        return yield* decodeOrchestratorMcpCreatedThread(result).pipe(
          Effect.mapError(invalidResult),
        );
      }
      const result = yield* service.createThreads(scope, {
        ...(input.clientRequestId === undefined ? {} : { clientRequestId: input.clientRequestId }),
        threads: [
          {
            prompt: input.prompt,
            ...(input.title === undefined ? {} : { title: input.title }),
            ...(input.target === undefined ? {} : { target: input.target }),
            ...(input.runtimeMode === undefined ? {} : { runtimeMode: input.runtimeMode }),
            ...(input.interactionMode === undefined
              ? {}
              : { interactionMode: input.interactionMode }),
          },
        ],
      });
      return result.threads[0]!;
    }),
  t3_thread_list: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      const service = yield* OrchestratorMcpService;
      if (shouldRoute(scope, input)) {
        const result = yield* invoke({
          environmentId: input.environmentId,
          projectId: input.projectId,
          operation: "t3_thread_list",
          input,
        });
        return yield* decodeOrchestratorMcpThreadListResult(result).pipe(
          Effect.mapError(invalidResult),
        );
      }
      return yield* service.listThreads(scope, input);
    }),
  t3_thread_read: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      const service = yield* OrchestratorMcpService;
      if (shouldRoute(scope, input)) {
        const result = yield* invoke({
          environmentId: input.environmentId,
          projectId: input.projectId,
          operation: "t3_thread_read",
          input,
        });
        return yield* decodeOrchestratorMcpThreadReadResult(result).pipe(
          Effect.mapError(invalidResult),
        );
      }
      return yield* service.readThread(scope, input);
    }),
  t3_thread_update: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      const service = yield* ThreadMetadataMcpService;
      return yield* service.update(scope, input);
    }),
  t3_thread_send: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      const service = yield* OrchestratorMcpService;
      if (shouldRoute(scope, input)) {
        const result = yield* invoke({
          environmentId: input.environmentId,
          projectId: input.projectId,
          operation: "t3_thread_send",
          input,
        });
        return yield* decodeOrchestratorMcpThreadSendResult(result).pipe(
          Effect.mapError(invalidResult),
        );
      }
      return yield* service.sendToThread(scope, input);
    }),
  t3_thread_wait: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      const service = yield* OrchestratorMcpService;
      if (shouldRoute(scope, input)) {
        const result = yield* invoke({
          environmentId: input.environmentId,
          projectId: input.projectId,
          operation: "t3_thread_wait",
          input,
        });
        return yield* decodeOrchestratorMcpThreadWaitResult(result).pipe(
          Effect.mapError(invalidResult),
        );
      }
      return yield* service.waitForThread(scope, input);
    }),
  t3_thread_interrupt: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext;
      const service = yield* OrchestratorMcpService;
      return yield* service.interruptThread(scope, input);
    }),
} satisfies Parameters<typeof OrchestratorToolkit.toLayer>[0];

export const OrchestratorToolkitHandlersLive = OrchestratorToolkit.toLayer(handlers);
