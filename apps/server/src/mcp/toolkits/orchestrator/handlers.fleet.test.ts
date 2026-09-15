import { assert, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestratorMcpCapabilitiesResult,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FleetRouter } from "../../FleetRouter.ts";
import { McpInvocationContext } from "../../McpInvocationContext.ts";
import { OrchestratorMcpService } from "../../OrchestratorMcpService.ts";
import { handlers } from "./handlers.ts";
const environmentId = EnvironmentId.make("source");
const remote = EnvironmentId.make("destination");
const threadId = ThreadId.make("source-thread");
const capabilities: OrchestratorMcpCapabilitiesResult = {
  parentThreadId: threadId,
  inheritedProviderInstanceId: ProviderInstanceId.make("codex"),
  inheritedModel: "source-model",
  runtimeMode: "approval-required",
  interactionMode: "plan",
  providers: [],
  features: {
    appOwnedSubagents: true,
    asyncPolling: true,
    cancellation: true,
    batchThreadCreation: true,
    threadManagement: true,
    incrementalThreadRead: true,
    scheduledTasks: true,
    maxBatchThreads: 10,
  },
};
const setup = (invoke: FleetRouter["Service"]["invoke"]) =>
  Layer.mergeAll(
    Layer.succeed(McpInvocationContext, {
      environmentId,
      threadId,
      providerSessionId: "source-session",
      providerInstanceId: ProviderInstanceId.make("codex"),
      capabilities: new Set(["orchestration"] as const),
      issuedAt: 0,
    }),
    Layer.mock(OrchestratorMcpService)({
      capabilities: () => Effect.succeed(capabilities),
      listThreads: () =>
        Effect.succeed({
          projectId: ProjectId.make("local-project"),
          currentThreadId: threadId,
          threads: [],
          nextCursor: null,
          total: 0,
        }),
    }),
    Layer.mock(FleetRouter)({ invoke }),
  );
it.effect(
  "routes a main-task handoff with source policy and keeps provider defaults destination-local",
  () =>
    Effect.gen(function* () {
      const calls: Parameters<FleetRouter["Service"]["invoke"]>[] = [];
      const result = yield* handlers
        .t3_thread_start({
          environmentId: remote,
          projectId: ProjectId.make("destination-project"),
          prompt: "Continue from commit abc",
          clientRequestId: "retry",
        })
        .pipe(
          Effect.provide(
            setup((...args) => {
              calls.push(args);
              return Effect.succeed({
                environmentId: remote,
                projectId: ProjectId.make("destination-project"),
                threadId: ThreadId.make("created"),
                runId: null,
                status: "idle",
                title: "Work",
                createdBy: "agent",
                creationSource: "mcp",
                providerInstanceId: "destination-provider",
                model: "destination-model",
              });
            }),
          ),
        );
      assert.equal(result.environmentId, remote);
      assert.equal(calls[0]?.[1], threadId);
      assert.deepEqual(calls[0]?.[2], {
        runtimeMode: "approval-required",
        interactionMode: "plan",
      });
      assert.deepEqual(calls[0]?.[0].input, {
        environmentId: remote,
        projectId: "destination-project",
        prompt: "Continue from commit abc",
        clientRequestId: "retry",
        runtimeMode: "approval-required",
        interactionMode: "plan",
      });
    }),
);
it.effect("rejects mode escalation before routing and validates destination results", () =>
  Effect.gen(function* () {
    const denied = yield* handlers
      .t3_thread_start({
        environmentId: remote,
        projectId: ProjectId.make("remote-project"),
        prompt: "work",
        runtimeMode: "full-access",
      })
      .pipe(
        Effect.provide(setup(() => Effect.die("must not route"))),
        Effect.match({ onFailure: (e) => e.code, onSuccess: () => "unexpected_success" }),
      );
    assert.equal(denied, "runtime_mode_escalation_denied");
    const invalid = yield* handlers
      .t3_thread_list({ environmentId: remote, projectId: ProjectId.make("remote-project") })
      .pipe(
        Effect.provide(setup(() => Effect.succeed({ malformed: true }))),
        Effect.match({ onFailure: (e) => e.code, onSuccess: () => "unexpected_success" }),
      );
    assert.equal(invalid, "orchestration_error");
  }),
);
it.effect(
  "keeps the existing same-environment project scope without routing unless a project is selected",
  () =>
    Effect.gen(function* () {
      const result = yield* handlers
        .t3_thread_list({ environmentId })
        .pipe(Effect.provide(setup(() => Effect.die("must not route"))));
      assert.equal(result.projectId, "local-project");
    }),
);
