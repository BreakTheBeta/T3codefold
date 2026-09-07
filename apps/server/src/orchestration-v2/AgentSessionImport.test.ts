import { assert, it } from "@effect/vitest";
import {
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2Command,
  OrchestrationV2DomainEvent,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { planAgentSessionImport } from "./AgentSessionImport.ts";
import { IdAllocatorV2, layer } from "./IdAllocator.ts";
import { applyToProjection, emptyProjection } from "./ProjectionStore.ts";

const date = DateTime.makeUnsafe("2026-09-01T00:00:00Z");
function command(
  provider: "codex" | "claudeAgent" = "codex",
): Extract<OrchestrationV2Command, { type: "thread.history.import" }> {
  const nativeId =
    provider === "codex" ? "native-codex-session" : "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const instanceId = ProviderInstanceId.make(provider);
  return {
    type: "thread.history.import",
    commandId: CommandId.make("import-attempt"),
    threadId: ThreadId.make(`import:${instanceId}:${nativeId}`),
    projectId: ProjectId.make("project"),
    expectedWorkspaceRoot: "/workspace",
    title: "Continue existing work",
    modelSelection: { instanceId, model: "test-model" },
    createdAt: date,
    source: {
      provider,
      providerInstanceId: instanceId,
      providerSessionId: nativeId,
      filePath: "/agent/session.jsonl",
      size: 100,
      mtimeMs: 1,
      device: 1,
      inode: 1,
      birthtimeMs: 1,
    },
    messages: [
      { role: "user", text: "Existing task", createdAt: date },
      { role: "assistant", text: "Verified progress", createdAt: date },
    ],
  };
}
const plan = (input: ReturnType<typeof command>) =>
  Effect.gen(function* () {
    const idAllocator = yield* IdAllocatorV2;
    return yield* planAgentSessionImport({ command: input, projection: null, idAllocator });
  });
function project(events: ReadonlyArray<OrchestrationV2DomainEvent>) {
  const first = events[0];
  if (!first || first.type !== "thread.created") throw new Error("Missing thread creation");
  return events.slice(1).reduce(applyToProjection, emptyProjection(first));
}
for (const provider of ["codex", "claudeAgent"] as const) {
  it.effect(
    `atomically imports ${provider} history and resume reference without launching work`,
    () =>
      Effect.gen(function* () {
        const input = command(provider);
        const result = yield* plan(input);
        for (const event of result.events)
          yield* Schema.decodeUnknownEffect(OrchestrationV2DomainEvent)(event);
        assert.deepEqual(result.effects, []);
        const projection = project(result.events);
        assert.deepEqual(
          projection.messages.map((m) => m.text),
          ["Existing task", "Verified progress"],
        );
        assert.equal(projection.runs.length, 0);
        assert.equal(
          projection.providerThreads[0]?.nativeThreadRef?.nativeId,
          input.source.providerSessionId,
        );
        assert.equal(projection.thread.activeProviderThreadId, projection.providerThreads[0]?.id);
        assert.deepEqual(projection.thread.importedAgentSessions, [input.source]);
        assert.equal(projection.thread.settledOverride, "settled");
      }).pipe(Effect.provide(layer)),
  );
}
it.effect("a retry records a new file cursor without replacing history or later edits", () =>
  Effect.gen(function* () {
    const input = command();
    const initial = project((yield* plan(input)).events);
    const projection = {
      ...initial,
      thread: { ...initial.thread, title: "Owner changed the title" },
    };
    const retry = yield* planAgentSessionImport({
      command: {
        ...input,
        source: { ...input.source, filePath: "/copy/session.jsonl" },
        messages: [],
      },
      projection,
      idAllocator: yield* IdAllocatorV2,
    });
    const updated = retry.events.reduce(applyToProjection, projection);
    assert.equal(updated.thread.title, "Owner changed the title");
    assert.deepEqual(updated.messages, initial.messages);
    assert.equal(updated.thread.importedAgentSessions?.length, 2);
    assert.deepEqual(retry.effects, []);
  }).pipe(Effect.provide(layer)),
);
it.effect("rejects collisions with another project or a non-imported owner", () =>
  Effect.gen(function* () {
    const input = command();
    const initial = project((yield* plan(input)).events);
    for (const thread of [
      { ...initial.thread, projectId: ProjectId.make("other") },
      { ...initial.thread, importedAgentSessions: [] },
    ]) {
      const result = yield* planAgentSessionImport({
        command: input,
        projection: { ...initial, thread },
        idAllocator: yield* IdAllocatorV2,
      }).pipe(Effect.result);
      assert.equal(result._tag, "Failure");
    }
  }).pipe(Effect.provide(layer)),
);
it.effect("rejects malformed Claude resume identifiers before creating any state", () =>
  Effect.gen(function* () {
    const input = command("claudeAgent");
    const result = yield* plan({
      ...input,
      threadId: ThreadId.make("import:claudeAgent:invalid"),
      source: { ...input.source, providerSessionId: "invalid" },
    }).pipe(Effect.result);
    assert.equal(result._tag, "Failure");
  }).pipe(Effect.provide(layer)),
);

// Exercise the real receipt, event store, and projection transaction as well as the planner.
import * as Layer from "effect/Layer";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { ProjectionProjectRepositoryLive } from "../persistence/Layers/ProjectionProjects.ts";
import { ProjectionProjectRepository } from "../persistence/Services/ProjectionProjects.ts";
import { makeLayer as registryLayer } from "./ProviderAdapterRegistry.ts";
import { makeOrchestratorV2ReplayLayerWithRegistry } from "./testkit/ProviderReplayHarness.ts";
import { OrchestratorV2 } from "./Orchestrator.ts";
const database = SqlitePersistenceMemory;
const integration = Layer.mergeAll(
  makeOrchestratorV2ReplayLayerWithRegistry({ name: "native-session-import" }, registryLayer([]), {
    databaseLayer: database,
    runEffectWorker: false,
  }),
  ProjectionProjectRepositoryLive.pipe(Layer.provide(database)),
);
it.layer(integration)("durable native session import", (it) => {
  const seedProject = Effect.gen(function* () {
    const projects = yield* ProjectionProjectRepository;
    yield* projects.upsert({
      projectId: ProjectId.make("project"),
      title: "Project",
      workspaceRoot: "/workspace",
      defaultModelSelection: null,
      defaultThreadEnvMode: null,
      autoPull: false,
      scripts: [],
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
      deletedAt: null,
    });
  });
  it.effect("persists native resume identity and history together, including receipt retries", () =>
    Effect.gen(function* () {
      yield* seedProject;
      const orchestrator = yield* OrchestratorV2;
      const input = command();
      const first = yield* orchestrator.dispatch(input);
      const replay = yield* orchestrator.dispatch(input);
      assert.equal(replay.sequence, first.sequence);
      const projection = yield* orchestrator.getThreadProjection(input.threadId);
      assert.equal(projection.messages.length, 2);
      assert.equal(
        projection.providerThreads[0]?.nativeThreadRef?.nativeId,
        input.source.providerSessionId,
      );
      assert.equal(projection.runs.length, 0);
      assert.equal(projection.thread.importedAgentSessions?.length, 1);
    }),
  );
  it.effect("rejects a project root changed after scanning without publishing a thread", () =>
    Effect.gen(function* () {
      yield* seedProject;
      const orchestrator = yield* OrchestratorV2;
      const input = {
        ...command("claudeAgent"),
        commandId: CommandId.make("stale-project"),
        expectedWorkspaceRoot: "/old-root",
      };
      const result = yield* orchestrator.dispatch(input).pipe(Effect.result);
      assert.equal(result._tag, "Failure");
      assert.equal(yield* orchestrator.getThreadShell(input.threadId), null);
    }),
  );
});
