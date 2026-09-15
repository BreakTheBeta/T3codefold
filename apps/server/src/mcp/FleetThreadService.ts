import * as NodeCrypto from "node:crypto";
import {
  CommandId,
  MessageId,
  ThreadId,
  OrchestratorMcpFailure,
  OrchestratorMcpThreadStartInput,
  OrchestratorMcpThreadListInput,
  OrchestratorMcpThreadReadInput,
  OrchestratorMcpThreadSendInput,
  OrchestratorMcpThreadWaitInput,
  type FleetExecuteInput,
  type ProjectId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { ProjectService } from "../project/ProjectService.ts";
import { ProviderRegistry } from "../provider/Services/ProviderRegistry.ts";
import { ThreadLaunchService } from "../orchestration-v2/ThreadLaunchService.ts";
import { ThreadManagementService, latestRun } from "../orchestration-v2/ThreadManagementService.ts";
import { isBuiltInProviderAdapterDriverV2 } from "../orchestration-v2/builtInProviderAdapterDrivers.ts";
import {
  listItemFromShell,
  providerConstraints,
  resolveFleetModelTarget,
  resolveRuntimeMode,
  resolveInteractionMode,
  threadDetail,
  threadRun,
  timelineItem,
} from "./OrchestratorMcpService.ts";

const decodeOrchestratorMcpThreadStartInput = Schema.decodeUnknownEffect(
  OrchestratorMcpThreadStartInput,
);
const decodeOrchestratorMcpThreadListInput = Schema.decodeUnknownEffect(
  OrchestratorMcpThreadListInput,
);
const decodeOrchestratorMcpThreadReadInput = Schema.decodeUnknownEffect(
  OrchestratorMcpThreadReadInput,
);
const decodeOrchestratorMcpThreadSendInput = Schema.decodeUnknownEffect(
  OrchestratorMcpThreadSendInput,
);
const decodeOrchestratorMcpThreadWaitInput = Schema.decodeUnknownEffect(
  OrchestratorMcpThreadWaitInput,
);
const isOrchestratorMcpFailure = Schema.is(OrchestratorMcpFailure);

const invalid = (message: string) =>
  new OrchestratorMcpFailure({ code: "invalid_request", message });
const orchestrationFailure = (error: unknown) =>
  isOrchestratorMcpFailure(error)
    ? error
    : new OrchestratorMcpFailure({
        code: "orchestration_error",
        message: error instanceof Error ? error.message : String(error),
      });

/** Destination and caller identity namespace retries without treating a remote thread as a local parent. */
export function fleetMutationKey(request: FleetExecuteInput, clientRequestId: string): string {
  return NodeCrypto.createHash("sha256")
    .update(
      JSON.stringify([
        request.source.environmentId,
        request.source.threadId,
        request.environmentId,
        request.projectId ?? null,
        request.operation,
        typeof request.input === "object" && request.input !== null && "threadId" in request.input
          ? request.input.threadId
          : null,
        clientRequestId,
      ]),
    )
    .digest("hex");
}

export class FleetThreadService extends Context.Service<
  FleetThreadService,
  {
    readonly execute: (
      request: FleetExecuteInput,
    ) => Effect.Effect<unknown, OrchestratorMcpFailure>;
  }
>()("t3/mcp/FleetThreadService") {}

export const make = Effect.gen(function* () {
  const environment = yield* ServerEnvironment;
  const projects = yield* ProjectService;
  const providers = yield* ProviderRegistry;
  const threads = yield* ThreadManagementService;
  const launch = yield* ThreadLaunchService;
  const localId = yield* environment.getEnvironmentId;
  const project = (id: ProjectId | undefined) =>
    Effect.gen(function* () {
      if (id === undefined)
        return yield* invalid("Select a destination projectId first using t3_project_list.");
      const found = yield* projects.getById(id);
      if (Option.isNone(found))
        return yield* invalid(`Project ${id} does not exist in this environment.`);
      return found.value;
    });
  const targetThread = (request: FleetExecuteInput, id: ThreadId) =>
    Effect.gen(function* () {
      const target = yield* threads.getThreadProjection(id);
      if (request.projectId !== undefined && target.thread.projectId !== request.projectId) {
        return yield* invalid("The target thread belongs to another destination project.");
      }
      yield* project(target.thread.projectId);
      return target;
    });
  return FleetThreadService.of({
    execute: (request) =>
      Effect.gen(function* () {
        if (request.environmentId !== localId)
          return yield* invalid("The request destination does not match this environment.");
        switch (request.operation) {
          case "t3_project_list": {
            const snapshot = yield* projects.snapshot;
            return {
              environmentId: localId,
              projects: snapshot.projects.map((p) => ({
                projectId: p.id,
                title: p.title,
                workspaceRoot: p.workspaceRoot,
              })),
            };
          }
          case "orchestrator_capabilities": {
            const selected =
              request.projectId === undefined ? undefined : yield* project(request.projectId);
            return {
              environmentId: localId,
              ...(selected === undefined ? {} : { projectId: selected.id }),
              defaultModelSelection: selected?.defaultModelSelection ?? null,
              parentThreadId: null,
              inheritedProviderInstanceId: selected?.defaultModelSelection?.instanceId ?? null,
              inheritedModel: selected?.defaultModelSelection?.model ?? null,
              runtimeMode: request.source.runtimeMode ?? "full-access",
              interactionMode: request.source.interactionMode ?? "default",
              providers: (yield* providers.getProviders).map((provider) => ({
                providerInstanceId: provider.instanceId,
                driverKind: provider.driver,
                displayName: provider.displayName ?? null,
                canRunChildTask: false,
                canRunCrossProviderChildTask: false,
                models: provider.models.map((model) => ({
                  id: model.slug,
                  label: model.name ?? null,
                  options: model.capabilities?.optionDescriptors,
                })),
                constraints: providerConstraints(
                  provider,
                  isBuiltInProviderAdapterDriverV2(provider.driver),
                ),
              })),
              features: {
                appOwnedSubagents: false,
                asyncPolling: true,
                cancellation: false,
                batchThreadCreation: false,
                threadManagement: true,
                incrementalThreadRead: true,
                scheduledTasks: false,
                maxBatchThreads: 1,
              },
            };
          }
          case "t3_thread_start": {
            const input = yield* decodeOrchestratorMcpThreadStartInput(request.input).pipe(
              Effect.mapError((error) => invalid(error.message)),
            );
            const selected = yield* project(request.projectId);
            const available = yield* providers.getProviders;
            const fallback = available.find(
              (p) =>
                providerConstraints(p, isBuiltInProviderAdapterDriverV2(p.driver)).length === 0 &&
                p.models.length > 0,
            );
            const defaults =
              selected.defaultModelSelection ??
              (fallback?.models[0]
                ? { instanceId: fallback.instanceId, model: fallback.models[0].slug }
                : undefined);
            if (defaults === undefined)
              return yield* new OrchestratorMcpFailure({
                code: "provider_unavailable",
                message: "This destination has no available provider model.",
              });
            const resolved = yield* resolveFleetModelTarget({
              defaultModelSelection: defaults,
              target: input.target,
              providers: available,
            });
            if (
              request.source.threadId !== null &&
              (request.source.runtimeMode === undefined ||
                request.source.interactionMode === undefined)
            ) {
              return yield* invalid(
                "Agent fleet mutations require the source thread runtime and interaction modes.",
              );
            }
            const runtimeMode = yield* resolveRuntimeMode(
              request.source.runtimeMode ?? "full-access",
              input.runtimeMode,
            );
            const interactionMode = yield* resolveInteractionMode(
              request.source.interactionMode ?? "default",
              input.interactionMode,
            );
            const key = fleetMutationKey(request, input.clientRequestId ?? NodeCrypto.randomUUID());
            const result = yield* launch.launch({
              commandId: CommandId.make(`fleet:start:${key}`),
              threadId: ThreadId.make(`fleet:${key}`),
              projectId: selected.id,
              title: input.title ?? "New thread",
              modelSelection: resolved.modelSelection,
              runtimeMode,
              interactionMode,
              workspaceStrategy: { type: "root" },
              initialMessage: {
                messageId: MessageId.make(`fleet:${key}`),
                text: input.prompt,
                attachments: [],
              },
              createdBy: "agent",
              creationSource: "mcp",
            });
            const run = result.projection.runs.find(
              (candidate) => candidate.userMessageId === MessageId.make(`fleet:${key}`),
            );
            const modelSelection = run?.modelSelection ?? result.projection.thread.modelSelection;
            return {
              environmentId: localId,
              projectId: selected.id,
              threadId: result.threadId,
              runId: run?.id ?? null,
              status: run?.status ?? "idle",
              title: result.projection.thread.title,
              createdBy: result.projection.thread.createdBy,
              creationSource: result.projection.thread.creationSource,
              providerInstanceId: modelSelection.instanceId,
              model: modelSelection.model,
            };
          }
          case "t3_thread_list": {
            const input = yield* decodeOrchestratorMcpThreadListInput(request.input).pipe(
              Effect.mapError((error) => invalid(error.message)),
            );
            const selected = yield* project(request.projectId);
            const all = yield* threads.listProjectThreads({
              projectId: selected.id,
              includeSubagents: input.includeSubagents !== false,
            });
            const matching = all.filter(
              (t) =>
                (!input.statuses || input.statuses.includes(t.activityRunStatus ?? t.status)) &&
                (!input.titleContains ||
                  t.title.toLocaleLowerCase().includes(input.titleContains.toLocaleLowerCase())),
            );
            const cursor = input.cursor ?? 0;
            const page = matching.slice(cursor, cursor + (input.limit ?? 50));
            return {
              projectId: selected.id,
              environmentId: localId,
              currentThreadId: null,
              threads: page.map(listItemFromShell),
              nextCursor: cursor + page.length < matching.length ? cursor + page.length : null,
              total: matching.length,
            };
          }
          case "t3_thread_read": {
            const input = yield* decodeOrchestratorMcpThreadReadInput(request.input).pipe(
              Effect.mapError((error) => invalid(error.message)),
            );
            const target = yield* targetThread(request, input.threadId);
            const matching = target.visibleTurnItems
              .filter((row) => row.position > (input.afterPosition ?? -1))
              .filter(
                (row) =>
                  input.view === "activity" ||
                  row.item.type === "user_message" ||
                  row.item.type === "assistant_message" ||
                  row.item.type === "proposed_plan",
              );
            const page = matching.slice(0, input.limit ?? 50);
            const sourceIds = [
              ...new Set(
                page
                  .filter(
                    (row) =>
                      row.item.type === "user_message" || row.item.type === "assistant_message",
                  )
                  .map((row) => row.sourceThreadId)
                  .filter((id) => id !== target.thread.id),
              ),
            ];
            const sources = yield* Effect.forEach(
              sourceIds,
              (threadId) =>
                threads.getProjectThread({ projectId: target.thread.projectId, threadId }),
              { concurrency: 8 },
            );
            const messagesByThreadId = new Map([
              [target.thread.id, target.messages],
              ...sources.map((p) => [p.thread.id, p.messages] as const),
            ]);
            return {
              environmentId: localId,
              projectId: target.thread.projectId,
              thread: threadDetail(target),
              recentRuns: target.runs
                .toSorted((a, b) => b.ordinal - a.ordinal)
                .slice(0, input.runLimit ?? 10)
                .map(threadRun),
              items: page.map((row) =>
                timelineItem({ row, maxChars: input.maxCharsPerItem ?? 20000, messagesByThreadId }),
              ),
              nextPosition: page.at(-1)?.position ?? null,
              hasMore: page.length < matching.length,
            };
          }
          case "t3_thread_send": {
            const input = yield* decodeOrchestratorMcpThreadSendInput(request.input).pipe(
              Effect.mapError((error) => invalid(error.message)),
            );
            const target = yield* targetThread(request, input.threadId);
            if (
              request.source.threadId !== null &&
              (request.source.runtimeMode === undefined ||
                request.source.interactionMode === undefined)
            ) {
              return yield* invalid(
                "Agent fleet mutations require the source thread runtime and interaction modes.",
              );
            }
            yield* resolveRuntimeMode(
              request.source.runtimeMode ?? "full-access",
              target.thread.runtimeMode,
            );
            yield* resolveInteractionMode(
              request.source.interactionMode ?? "default",
              target.thread.interactionMode,
            );

            const key = fleetMutationKey(request, input.clientRequestId ?? NodeCrypto.randomUUID());
            const messageId = MessageId.make(`fleet:${key}`);
            const result = yield* threads.sendToThread({
              projectId: target.thread.projectId,
              threadId: input.threadId,
              commandId: CommandId.make(`fleet:send:${key}`),
              messageId,
              text: input.message,
              attachments: [],
              mode: input.mode ?? "auto",
              createdBy: "agent",
              creationSource: "mcp",
            });
            return {
              environmentId: localId,
              projectId: target.thread.projectId,
              threadId: input.threadId,
              messageId,
              runId: result.run.id,
              status: result.run.status,
              delivery: result.delivery,
            };
          }
          case "t3_thread_wait": {
            const input = yield* decodeOrchestratorMcpThreadWaitInput(request.input).pipe(
              Effect.mapError((error) => invalid(error.message)),
            );
            const target = yield* targetThread(request, input.threadId);
            const result = yield* threads.waitForThread({
              projectId: target.thread.projectId,
              threadId: input.threadId,
              ...(input.runId ? { runId: input.runId } : {}),
              timeoutMs: Math.min(120000, Math.max(1, input.timeoutMs ?? 120000)),
            });
            return {
              environmentId: localId,
              projectId: target.thread.projectId,
              threadId: input.threadId,
              runId: result.run?.id ?? null,
              status: result.run?.status ?? "idle",
              timedOut: result.timedOut,
            };
          }
        }
      }).pipe(Effect.mapError(orchestrationFailure)),
  });
});
export const layer = Layer.effect(FleetThreadService, make);
