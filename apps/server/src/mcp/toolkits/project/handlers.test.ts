import {
  EnvironmentId,
  OrchestratorMcpCapabilitiesResult,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import type { Tool } from "effect/unstable/ai";

import { FleetRouter } from "../../FleetRouter.ts";
import { McpInvocationContext } from "../../McpInvocationContext.ts";
import { OrchestratorMcpService } from "../../OrchestratorMcpService.ts";
import { ThreadManagementService } from "../../../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../../../project/ProjectService.ts";
import { ProjectHandlersLive } from "./handlers.ts";
import { ProjectToolkit } from "./tools.ts";

const environmentId = EnvironmentId.make("environment-project-toolkit");
const threadId = ThreadId.make("thread-project-toolkit");
const scope = {
  environmentId,
  threadId,
  providerSessionId: "session-project-toolkit",
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities: new Set(["orchestration"] as const),
  issuedAt: 0,
};
const project = (id: string) => ({
  id: ProjectId.make(id),
  title: id,
  workspaceRoot: `/workspace/${id}`,
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
});
const caller = {
  id: threadId,
  projectId: ProjectId.make("one"),
  title: "Caller",
  providerInstanceId: ProviderInstanceId.make("codex"),
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  createdBy: "user",
  creationSource: "web",
  activeProviderThreadId: null,
  lineage: { rootThreadId: threadId, parentThreadId: null, relationshipToParent: null },
  forkedFrom: null,
  latestRunId: null,
  activeRunId: null,
  status: "idle",
  pendingRuntimeRequest: null,
  latestVisibleMessage: null,
  latestUserMessageAt: null,
  hasActionableProposedPlan: false,
  pendingBackgroundTasks: [],
  providerInstanceHistory: [],
  itemCount: 0,
  visibleItemCount: 0,
  createdAt: DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"),
  updatedAt: DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"),
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  deletedAt: null,
} satisfies OrchestrationV2ThreadShell;

const baseDependencies = Layer.mergeAll(
  Layer.mock(FleetRouter)({}),
  Layer.mock(ThreadManagementService)({
    getThreadShell: () => Effect.succeed(caller),
  }),
  Layer.mock(ProjectService.ProjectService)({
    snapshot: Effect.succeed({
      projects: [project("one"), project("two")],
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
  }),
  Layer.mock(OrchestratorMcpService)({
    capabilities: () =>
      Effect.succeed({
        parentThreadId: threadId,
        inheritedProviderInstanceId: ProviderInstanceId.make("codex"),
        inheritedModel: "gpt-5",
        runtimeMode: "full-access",
        interactionMode: "default",
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
      } satisfies OrchestratorMcpCapabilitiesResult),
  }),
);

const callWith = (
  dependencies: Layer.Layer<
    ThreadManagementService | ProjectService.ProjectService | OrchestratorMcpService | FleetRouter
  >,
) =>
  Effect.gen(function* () {
    const toolkit = yield* ProjectToolkit.pipe(
      Effect.provide(ProjectHandlersLive.pipe(Layer.provide(dependencies))),
    );
    return (input: Parameters<typeof toolkit.handle<"t3_project_list">>[1]) =>
      toolkit.handle("t3_project_list", input).pipe(
        Stream.unwrap,
        Stream.runCollect,
        Effect.map(
          (chunk) =>
            chunk.at(-1)!.result as Tool.Success<typeof ProjectToolkit.tools.t3_project_list>,
        ),
        Effect.provideService(McpInvocationContext, scope),
        Effect.provide(dependencies),
      );
  });

describe("project toolkit project listing", () => {
  it.effect("keeps local project rows paginated", () =>
    Effect.gen(function* () {
      const call = yield* callWith(baseDependencies);
      expect(yield* call({ cursor: 1, limit: 1 })).toEqual({
        environmentId,
        projects: [{ ...project("two"), projectId: ProjectId.make("two") }],
        nextCursor: null,
      });
    }),
  );

  it.effect("routes remote listings with policy and paginates the fleet result", () =>
    Effect.gen(function* () {
      const remote = EnvironmentId.make("environment-remote");
      let routed: { input: unknown; threadId: unknown; policy: unknown } | undefined;
      const dependencies = Layer.merge(
        baseDependencies,
        Layer.mock(FleetRouter)({
          invoke: (input, threadId, policy) =>
            Effect.sync(() => {
              routed = { input, threadId, policy };
              return {
                environmentId: remote,
                projects: [
                  {
                    projectId: ProjectId.make("remote-one"),
                    title: "Remote one",
                    workspaceRoot: "/remote/one",
                  },
                  {
                    projectId: ProjectId.make("remote-two"),
                    title: "Remote two",
                    workspaceRoot: "/remote/two",
                  },
                ],
              };
            }),
        }),
      );
      const call = yield* callWith(dependencies);
      expect(yield* call({ environmentId: remote, cursor: 1, limit: 1 })).toEqual({
        environmentId: remote,
        projects: [
          {
            projectId: ProjectId.make("remote-two"),
            title: "Remote two",
            workspaceRoot: "/remote/two",
          },
        ],
        nextCursor: null,
      });
      expect(routed).toMatchObject({
        input: { environmentId: remote, operation: "t3_project_list" },
        threadId,
        policy: { runtimeMode: "full-access", interactionMode: "default" },
      });
    }),
  );
});
