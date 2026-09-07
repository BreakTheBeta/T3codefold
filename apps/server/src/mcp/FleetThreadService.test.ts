import { assert, it } from "@effect/vitest";
import {
  CommandId,
  MessageId,
  RunId,
  type OrchestrationV2Run,
  OrchestratorMcpCapabilitiesResult,
  ProviderDriverKind,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  EventId,
  type FleetExecuteInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as DateTime from "effect/DateTime";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { ProjectService } from "../project/ProjectService.ts";
import {
  ThreadLaunchService,
  type ThreadLaunchInput,
} from "../orchestration-v2/ThreadLaunchService.ts";
import { ThreadManagementService } from "../orchestration-v2/ThreadManagementService.ts";
import { emptyProjection } from "../orchestration-v2/ProjectionStore.ts";
import { makeProviderRegistryLayer } from "../provider/testUtils/providerRegistryMock.ts";
import * as Fleet from "./FleetThreadService.ts";

const decodeOrchestratorMcpCapabilitiesResult = Schema.decodeUnknownEffect(
  OrchestratorMcpCapabilitiesResult,
);

const destination = EnvironmentId.make("destination");
const projectId = ProjectId.make("destination-project");
const project = {
  id: projectId,
  title: "Destination",
  workspaceRoot: "/destination/repo",
  repositoryIdentity: null,
  faviconPath: null,
  defaultModelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.1-codex" },
  defaultThreadEnvMode: null,
  scripts: [],
  createdAt: "2026-06-20T00:00:00.000Z",
  updatedAt: "2026-06-20T00:00:00.000Z",
  deletedAt: null,
};
const request = (operation: FleetExecuteInput["operation"], input: unknown): FleetExecuteInput => ({
  source: {
    environmentId: EnvironmentId.make("remote-laptop"),
    threadId: ThreadId.make("remote-thread-not-present-here"),
    runtimeMode: "full-access",
    interactionMode: "default",
  },
  environmentId: destination,
  projectId,
  operation,
  input,
});
const projection = (input: ThreadLaunchInput) => {
  const id = input.threadId!;
  return emptyProjection({
    id: EventId.make(`created:${id}`),
    type: "thread.created",
    threadId: id,
    occurredAt: DateTime.makeUnsafe(project.createdAt),
    payload: {
      id,
      projectId: input.projectId,
      title: input.title,
      providerInstanceId: input.modelSelection.instanceId,
      modelSelection: input.modelSelection,
      createdBy: input.createdBy,
      creationSource: input.creationSource,
      runtimeMode: input.runtimeMode,
      interactionMode: input.interactionMode,
      branch: null,
      worktreePath: null,
      activeProviderThreadId: null,
      lineage: { rootThreadId: id, parentThreadId: null, relationshipToParent: null },
      forkedFrom: null,
      createdAt: DateTime.makeUnsafe(project.createdAt),
      updatedAt: DateTime.makeUnsafe(project.createdAt),
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
      deletedAt: null,
    },
  });
};
const deps = (
  launch: ThreadLaunchService["Service"]["launch"],
  management: Partial<ThreadManagementService["Service"]> = {},
) =>
  Layer.mergeAll(
    Layer.mock(ServerEnvironment)({ getEnvironmentId: Effect.succeed(destination) }),
    Layer.mock(ProjectService)({
      getById: (id) => Effect.succeed(id === projectId ? Option.some(project) : Option.none()),
      snapshot: Effect.succeed({ projects: [project], updatedAt: project.updatedAt }),
    }),
    makeProviderRegistryLayer([
      {
        instanceId: project.defaultModelSelection.instanceId,
        driver: ProviderDriverKind.make("codex"),
        enabled: true,
        installed: true,
        version: "test",
        status: "ready",
        auth: { status: "authenticated" },
        checkedAt: project.createdAt,
        slashCommands: [],
        skills: [],
        models: [
          {
            slug: project.defaultModelSelection.model,
            name: "Codex",
            isCustom: false,
            capabilities: null,
          },
        ],
      },
    ]),
    Layer.mock(ThreadLaunchService)({ launch }),
    Layer.mock(ThreadManagementService)(management),
  );

it.effect(
  "starts an independent destination main thread without loading the remote caller, and namespaces retries",
  () =>
    Effect.gen(function* () {
      const launches: ThreadLaunchInput[] = [];
      const service = yield* Fleet.make.pipe(
        Effect.provide(
          deps((input) => {
            launches.push(input);
            return Effect.succeed({
              threadId: input.threadId!,
              projection: projection(input),
              resumed: false,
            });
          }),
        ),
      );
      const start = request("t3_thread_start", {
        prompt: "Continue the work from commit abc",
        clientRequestId: "handoff",
      });
      const first = yield* service.execute(start);
      assert.deepEqual(yield* service.execute(start), first);
      yield* service.execute({
        ...start,
        source: { ...start.source, environmentId: EnvironmentId.make("another-laptop") },
      });
      assert.equal(launches[0]!.commandId, launches[1]!.commandId);
      assert.notEqual(launches[0]!.commandId, launches[2]!.commandId);
      assert.equal(launches[0]!.projectId, projectId);
      assert.deepEqual(launches[0]!.modelSelection, project.defaultModelSelection);
      assert.deepEqual(launches[0]!.workspaceStrategy, { type: "root" });
      assert.equal(launches[0]!.initialMessage?.text, "Continue the work from commit abc");
      assert.equal(projection(launches[0]!).thread.lineage.parentThreadId, null);
    }),
);

it.effect("rejects wrong destinations and cross-project thread access before mutations", () =>
  Effect.gen(function* () {
    const target = projection({
      commandId: CommandId.make("unused"),
      threadId: ThreadId.make("target"),
      projectId,
      title: "Target",
      modelSelection: project.defaultModelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      workspaceStrategy: { type: "root" },
      createdBy: "user",
      creationSource: "web",
    });
    const service = yield* Fleet.make.pipe(
      Effect.provide(
        deps(() => Effect.die("must not launch"), {
          getThreadProjection: () => Effect.succeed(target),
        }),
      ),
    );
    const send = request("t3_thread_send", { threadId: "target", message: "hello" });
    const escalation = yield* service
      .execute({ ...send, source: { ...send.source, runtimeMode: "approval-required" } })
      .pipe(
        Effect.match({ onFailure: (error) => error.code, onSuccess: () => "unexpected_success" }),
      );
    assert.equal(escalation, "runtime_mode_escalation_denied");
    const missingPolicy = yield* service
      .execute({
        ...send,
        source: { environmentId: send.source.environmentId, threadId: send.source.threadId },
      })
      .pipe(
        Effect.match({ onFailure: (error) => error.code, onSuccess: () => "unexpected_success" }),
      );
    assert.equal(missingPolicy, "invalid_request");
    const wrongDestination = yield* service
      .execute({ ...request("t3_project_list", {}), environmentId: EnvironmentId.make("wrong") })
      .pipe(
        Effect.match({ onFailure: (error) => error.code, onSuccess: () => "unexpected_success" }),
      );
    assert.equal(wrongDestination, "invalid_request");
    const wrongProject = yield* service
      .execute({
        ...request("t3_thread_send", { threadId: "target", message: "hello" }),
        projectId: ProjectId.make("other"),
      })
      .pipe(
        Effect.match({ onFailure: (error) => error.code, onSuccess: () => "unexpected_success" }),
      );
    assert.equal(wrongProject, "invalid_request");
    const missingProject = yield* service
      .execute({ ...request("t3_thread_start", { prompt: "hi" }), projectId: undefined })
      .pipe(
        Effect.match({ onFailure: (error) => error.code, onSuccess: () => "unexpected_success" }),
      );
    assert.equal(missingProject, "invalid_request");
  }),
);

it.effect("discovers destination projects and lists threads without a local caller thread", () =>
  Effect.gen(function* () {
    const requested: ProjectId[] = [];
    const service = yield* Fleet.make.pipe(
      Effect.provide(
        deps(() => Effect.die("must not launch"), {
          listProjectThreads: ({ projectId }) => {
            requested.push(projectId);
            return Effect.succeed([]);
          },
        }),
      ),
    );
    const capabilityResult = yield* service.execute({
      ...request("orchestrator_capabilities", {}),
      projectId: undefined,
    });
    const decoded = yield* decodeOrchestratorMcpCapabilitiesResult(capabilityResult);
    assert.isNull(decoded.parentThreadId);
    assert.equal(
      decoded.providers[0]?.providerInstanceId,
      project.defaultModelSelection.instanceId,
    );
    assert.deepEqual(yield* service.execute(request("t3_project_list", {})), {
      environmentId: destination,
      projects: [{ projectId, title: project.title, workspaceRoot: project.workspaceRoot }],
    });
    assert.deepEqual(yield* service.execute(request("t3_thread_list", {})), {
      environmentId: destination,
      projectId,
      currentThreadId: null,
      threads: [],
      nextCursor: null,
      total: 0,
    });
    assert.deepEqual(requested, [projectId]);
    const invalid = yield* service
      .execute(request("t3_thread_send", {}))
      .pipe(
        Effect.match({ onFailure: (error) => error.code, onSuccess: () => "unexpected_success" }),
      );
    assert.equal(invalid, "invalid_request");
  }),
);

it.effect("reads and waits on the destination thread without resolving a source thread", () =>
  Effect.gen(function* () {
    const target = projection({
      commandId: CommandId.make("fixture"),
      threadId: ThreadId.make("destination-thread"),
      projectId,
      title: "Target",
      modelSelection: project.defaultModelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      workspaceStrategy: { type: "root" },
      createdBy: "user",
      creationSource: "web",
    });
    const reads: ThreadId[] = [];
    const waits: Array<{ projectId: ProjectId; threadId: ThreadId; timeoutMs: number }> = [];
    const service = yield* Fleet.make.pipe(
      Effect.provide(
        deps(() => Effect.die("must not launch"), {
          getThreadProjection: (threadId) => {
            reads.push(threadId);
            return Effect.succeed(target);
          },
          waitForThread: (input) => {
            waits.push(input);
            return Effect.succeed({ threadId: input.threadId, run: null, timedOut: false });
          },
        }),
      ),
    );
    const read = yield* service.execute(request("t3_thread_read", { threadId: target.thread.id }));
    assert.propertyVal(read, "projectId", projectId);
    assert.deepEqual(
      yield* service.execute(request("t3_thread_wait", { threadId: target.thread.id })),
      {
        environmentId: destination,
        projectId,
        threadId: target.thread.id,
        runId: null,
        status: "idle",
        timedOut: false,
      },
    );
    assert.deepEqual(reads, [target.thread.id, target.thread.id]);
    assert.equal(waits[0]?.timeoutMs, 120000);
    yield* service.execute(
      request("t3_thread_wait", { threadId: target.thread.id, timeoutMs: 3600000 }),
    );
    assert.equal(waits[1]?.timeoutMs, 120000);
    yield* service.execute(
      request("t3_thread_wait", { threadId: target.thread.id, timeoutMs: 1000 }),
    );
    assert.equal(waits[2]?.timeoutMs, 1000);
    assert.equal(waits[0]?.projectId, projectId);
    assert.equal(waits[0]?.threadId, target.thread.id);
  }),
);

it("does not conflate send retries for separate destination threads", () => {
  const first = request("t3_thread_send", { threadId: "one", message: "hi" });
  const second = request("t3_thread_send", { threadId: "two", message: "hi" });
  assert.notEqual(Fleet.fleetMutationKey(first, "retry"), Fleet.fleetMutationKey(second, "retry"));
});

it.effect("a start retry returns its initial run and persisted model after later turns", () =>
  Effect.gen(function* () {
    const savedSelection = {
      instanceId: ProviderInstanceId.make("saved-provider"),
      model: "saved-model",
    };
    const service = yield* Fleet.make.pipe(
      Effect.provide(
        deps((input) => {
          const saved = projection({ ...input, modelSelection: savedSelection });
          const initial: OrchestrationV2Run = {
            id: RunId.make("initial-run"),
            threadId: saved.thread.id,
            ordinal: 1,
            providerInstanceId: savedSelection.instanceId,
            modelSelection: savedSelection,
            providerThreadId: null,
            userMessageId: input.initialMessage!.messageId!,
            rootNodeId: null,
            activeAttemptId: null,
            status: "completed",
            requestedAt: saved.thread.createdAt,
            startedAt: saved.thread.createdAt,
            completedAt: saved.thread.createdAt,
            checkpointId: null,
            contextHandoffId: null,
          };
          return Effect.succeed({
            threadId: saved.thread.id,
            resumed: true,
            projection: {
              ...saved,
              runs: [
                initial,
                {
                  ...initial,
                  id: RunId.make("later-run"),
                  ordinal: 2,
                  userMessageId: MessageId.make("later-message"),
                  status: "running",
                  modelSelection: { ...savedSelection, model: "later-model" },
                },
              ],
            },
          });
        }),
      ),
    );
    const result = yield* service.execute(
      request("t3_thread_start", { prompt: "original work", clientRequestId: "retry-original" }),
    );
    assert.propertyVal(result, "runId", "initial-run");
    assert.propertyVal(result, "status", "completed");
    assert.propertyVal(result, "providerInstanceId", "saved-provider");
    assert.propertyVal(result, "model", "saved-model");
  }),
);
