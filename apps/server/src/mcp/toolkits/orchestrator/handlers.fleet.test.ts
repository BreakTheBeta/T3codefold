import { assert, it } from "@effect/vitest";
import {
  CommandId,
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
import { WorkStore } from "../../../pitboss/WorkStore.ts";
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
const setup = (
  invoke: FleetRouter["Service"]["invoke"],
  runtimeMode: OrchestratorMcpCapabilitiesResult["runtimeMode"] = capabilities.runtimeMode,
) =>
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
      capabilities: () => Effect.succeed({ ...capabilities, runtimeMode }),
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
const electedAs = (roleThreadId: typeof threadId) =>
  Layer.mock(WorkStore)({
    read: () =>
      Effect.succeed({
        revision: 1,
        role: {
          threadId: roleThreadId,
          projectId: ProjectId.make("local-project"),
          generation: 1,
          paused: false,
          brief: {
            priorities: "Ship",
            quality: "Prove behavior",
            projectIds: [ProjectId.make("local-project")],
            maxWorkers: 1,
            maxAttempts: 1,
            workerModel: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
          },
        },
        tasks: [],
        messages: [],
      }),
  });
it.effect("keeps GLaDOS out of untracked delegation and leaves other threads alone", () =>
  Effect.gen(function* () {
    const refused = yield* handlers.delegate_task({ task: "Do bounded work" }).pipe(
      Effect.provide(
        Layer.merge(
          electedAs(threadId),
          setup(() => Effect.die("must not route")),
        ),
      ),
      Effect.match({ onFailure: (error) => error.message, onSuccess: () => "unexpected_success" }),
    );
    assert.match(refused, /work_command/);

    const otherThread = yield* handlers.delegate_task({ task: "Do bounded work" }).pipe(
      Effect.provide(
        Layer.merge(
          electedAs(ThreadId.make("some-other-glados")),
          setup(() => Effect.die("must not route")),
        ),
      ),
      Effect.matchCause({
        onFailure: (cause) => String(cause),
        onSuccess: () => "unexpected-success",
      }),
    );
    // Reaching the unimplemented delegation service proves the guard did not refuse it.
    assert.match(otherThread, /delegateTask/);
  }),
);

/** No elected role, so ledger delegation checks fall through to the routing behavior under test. */
const ledger = Layer.mock(WorkStore)({
  read: () => Effect.succeed({ revision: 0, role: null, tasks: [], messages: [] }),
});
it.effect("passes the authenticated caller runtime mode to durable work launches", () =>
  Effect.gen(function* () {
    const calls: Array<Parameters<WorkStore["Service"]["command"]>> = [];
    const work = Layer.mock(WorkStore)({
      command: (...args) => {
        calls.push(args);
        return Effect.succeed({ revision: 0, role: null, tasks: [], messages: [] });
      },
    });
    yield* handlers
      .work_command({
        commandId: CommandId.make("full-access-lead"),
        expectedRevision: 0,
        action: {
          type: "create-lead",
          leadId: "lead",
          projectId: ProjectId.make("project"),
          charter: "Own the project",
          model: { instanceId: ProviderInstanceId.make("codex"), model: "model" },
          maxWorkers: 1,
          runtimeMode: "full-access",
        },
      })
      .pipe(
        Effect.provide(
          Layer.merge(
            setup(() => Effect.die("must not route"), "full-access"),
            work,
          ),
        ),
      );
    assert.deepEqual(calls[0]?.[2], { runtimeMode: "full-access" });
    assert.deepEqual(calls[0]?.[1], { type: "agent", threadId });
  }),
);
it.effect("passes the authenticated caller runtime mode to managed result revisions", () =>
  Effect.gen(function* () {
    const calls: Array<Parameters<WorkStore["Service"]["command"]>> = [];
    const work = Layer.mock(WorkStore)({
      command: (...args) => {
        calls.push(args);
        return Effect.succeed({ revision: 1, role: null, tasks: [], messages: [] });
      },
    });
    yield* handlers
      .work_command({
        commandId: CommandId.make("revise-full-access-result"),
        expectedRevision: 0,
        action: {
          type: "revise-result",
          taskId: "retained-task",
          note: "Repair the focused failure",
          runtimeMode: "full-access",
        },
      })
      .pipe(
        Effect.provide(
          Layer.merge(
            setup(() => Effect.die("must not route"), "full-access"),
            work,
          ),
        ),
      );
    assert.deepEqual(calls[0]?.[2], { runtimeMode: "full-access" });
    assert.deepEqual(calls[0]?.[1], { type: "agent", threadId });
  }),
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
            Layer.merge(
              ledger,
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
        Effect.provide(
          Layer.merge(
            ledger,
            setup(() => Effect.die("must not route")),
          ),
        ),
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
