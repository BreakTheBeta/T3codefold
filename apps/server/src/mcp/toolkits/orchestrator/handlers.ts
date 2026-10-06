import { OrchestratorToolkit } from "./tools.ts";
import {
  OrchestratorMcpCapabilitiesResult,
  OrchestratorMcpFailure,
  OrchestratorMcpThreadListResult,
  OrchestratorMcpThreadReadResult,
  OrchestratorMcpThreadSendResult,
  OrchestratorMcpThreadWaitResult,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { routeIfRemote } from "../../fleet/route.ts";
import { threadStartAsLaunch } from "../../FleetExecutor.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as OrchestratorMcpService from "../../OrchestratorMcpService.ts";
import * as ThreadMetadataMcpService from "../../ThreadMetadataMcpService.ts";
import { launchThread } from "../project/handlers.ts";
import { requireLedgerDelegation } from "../work/ledgerGuard.ts";

export const handlers = {
  orchestrator_capabilities: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const service = yield* OrchestratorMcpService.OrchestratorMcpService;
      return yield* service.capabilities(scope);
    }).pipe(routeIfRemote("orchestrator_capabilities", input, OrchestratorMcpCapabilitiesResult)),
  delegate_task: (input) =>
    Effect.gen(function* () {
      yield* requireLedgerDelegation("delegate_task");
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const service = yield* OrchestratorMcpService.OrchestratorMcpService;
      return yield* service.delegateTask(scope, input);
    }),
  task_status: ({ taskId }) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const service = yield* OrchestratorMcpService.OrchestratorMcpService;
      return yield* service.taskStatus(scope, taskId);
    }),
  task_cancel: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const service = yield* OrchestratorMcpService.OrchestratorMcpService;
      return yield* service.cancelTask(scope, input);
    }),
  schedule_task: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const service = yield* OrchestratorMcpService.OrchestratorMcpService;
      return yield* service.scheduleTask(scope, input);
    }),
  list_scheduled_tasks: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const service = yield* OrchestratorMcpService.OrchestratorMcpService;
      return yield* service.listScheduledTasks(scope, input);
    }),
  update_scheduled_task: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const service = yield* OrchestratorMcpService.OrchestratorMcpService;
      return yield* service.updateScheduledTask(scope, input);
    }),
  delete_scheduled_task: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const service = yield* OrchestratorMcpService.OrchestratorMcpService;
      return yield* service.deleteScheduledTask(scope, input);
    }),
  request_secret: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const service = yield* OrchestratorMcpService.OrchestratorMcpService;
      return yield* service.requestSecret(scope, input);
    }),
  create_threads: (input) =>
    Effect.gen(function* () {
      yield* requireLedgerDelegation("create_threads");
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const service = yield* OrchestratorMcpService.OrchestratorMcpService;
      return yield* service.createThreads(scope, input);
    }),
  t3_thread_start: (input) =>
    threadStartAsLaunch(input).pipe(
      Effect.flatMap((launch) => launchThread(launch, "t3_thread_start")),
    ),
  t3_thread_list: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const service = yield* OrchestratorMcpService.OrchestratorMcpService;
      return yield* service.listThreads(scope, input);
    }).pipe(routeIfRemote("t3_thread_list", input, OrchestratorMcpThreadListResult)),
  t3_thread_read: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const service = yield* OrchestratorMcpService.OrchestratorMcpService;
      return yield* service.readThread(scope, input);
    }).pipe(routeIfRemote("t3_thread_read", input, OrchestratorMcpThreadReadResult)),
  t3_thread_update: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const service = yield* ThreadMetadataMcpService.ThreadMetadataMcpService;
      return yield* service.update(scope, input);
    }),
  t3_thread_send: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const service = yield* OrchestratorMcpService.OrchestratorMcpService;
      return yield* service.sendToThread(scope, input);
    }).pipe(routeIfRemote("t3_thread_send", input, OrchestratorMcpThreadSendResult)),
  t3_thread_wait: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const service = yield* OrchestratorMcpService.OrchestratorMcpService;
      return yield* service.waitForThread(scope, input);
    }).pipe(routeIfRemote("t3_thread_wait", input, OrchestratorMcpThreadWaitResult)),
  t3_thread_interrupt: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      // Fleet does not relay interrupts; never let a remote id act on a local thread.
      if (input.environmentId !== undefined && input.environmentId !== scope.environmentId)
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: "t3_thread_interrupt acts only on threads in this environment.",
        });
      const service = yield* OrchestratorMcpService.OrchestratorMcpService;
      return yield* service.interruptThread(scope, input);
    }),
} satisfies Parameters<typeof OrchestratorToolkit.toLayer>[0];

export const layer = OrchestratorToolkit.toLayer(handlers);
