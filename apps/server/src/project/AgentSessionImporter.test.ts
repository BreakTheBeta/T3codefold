import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ProjectId, ProviderInstanceId, type OrchestrationV2Command } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { ThreadManagementService } from "../orchestration-v2/ThreadManagementService.ts";
import { OrchestratorDispatchError } from "../orchestration-v2/Orchestrator.ts";
import { AgentSessionScanner, type AgentSessionRecentThread } from "./AgentSessionScanner.ts";
import { importRecentAgentThreads } from "./AgentSessionImporter.ts";

const projectId = ProjectId.make("project");
const workspaceRoot = "/workspace/import";
const date = "2026-09-01T00:00:00Z";
const item: Extract<AgentSessionRecentThread, { _tag: "Importable" }> = {
  _tag: "Importable",
  source: {
    provider: "codex",
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerSessionId: "native",
    filePath: "/codex/session.jsonl",
    size: 100,
    mtimeMs: 1,
    device: 1,
    inode: 1,
    birthtimeMs: 1,
  },
  thread: {
    source: "codex",
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerSessionId: "native",
    title: "Current work",
    model: null,
    createdAt: date,
    updatedAt: date,
    messages: [{ role: "user", text: "Finish this task", createdAt: date }],
  },
};
const projectLayer = Layer.mock(ProjectionSnapshotQuery)({
  getProjectShellById: () =>
    Effect.succeed(
      Option.some({
        id: projectId,
        title: "Workspace",
        workspaceRoot,
        defaultModelSelection: null,
        scripts: [],
        createdAt: date,
        updatedAt: date,
      }),
    ),
});
const run = (input: {
  outcomes?: ReadonlyArray<AgentSessionRecentThread>;
  commands: Array<OrchestrationV2Command>;
  scanned: Array<string>;
  expectedWorkspaceRoot?: string;
  fail?: boolean;
}) =>
  importRecentAgentThreads({
    projectId,
    expectedWorkspaceRoot: input.expectedWorkspaceRoot ?? workspaceRoot,
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.mock(AgentSessionScanner)({
          recentThreads: (root) => {
            input.scanned.push(root);
            return Stream.fromIterable(input.outcomes ?? [item]);
          },
        }),
        Layer.mock(ThreadManagementService)({
          dispatch: (command) => {
            input.commands.push(command);
            return input.fail
              ? Effect.fail(
                  new OrchestratorDispatchError({
                    commandId: command.commandId,
                    commandType: command.type,
                  }),
                )
              : Effect.succeed({ sequence: input.commands.length, storedEvents: [] });
          },
        }),
        projectLayer,
      ),
    ),
  );
it.layer(Layer.mergeAll(NodeServices.layer, SqlitePersistenceMemory))(
  "AgentSessionImporter V2",
  (it) => {
    it.effect("resolves the project root and submits one atomic history/resume import", () =>
      Effect.gen(function* () {
        const commands: Array<OrchestrationV2Command> = [];
        const scanned: Array<string> = [];
        assert.deepEqual(yield* run({ commands, scanned }), { importedCount: 1, skippedCount: 0 });
        assert.deepEqual(scanned, [workspaceRoot]);
        assert.equal(commands.length, 1);
        const command = commands[0];
        assert.equal(command?.type, "thread.history.import");
        if (command?.type !== "thread.history.import") throw new Error("Missing import");
        assert.equal(command.source.providerSessionId, "native");
        assert.equal(command.expectedWorkspaceRoot, workspaceRoot);
        assert.equal(command.messages[0]?.text, "Finish this task");
      }),
    );
    it.effect("rejects a changed project before scanning or dispatch", () =>
      Effect.gen(function* () {
        const commands: Array<OrchestrationV2Command> = [];
        const scanned: Array<string> = [];
        const result = yield* run({ commands, scanned, expectedWorkspaceRoot: "/different" }).pipe(
          Effect.result,
        );
        assert.equal(result._tag, "Failure");
        assert.deepEqual(commands, []);
        assert.deepEqual(scanned, []);
      }),
    );
    it.effect("counts skipped and unchanged sources without dispatching", () =>
      Effect.gen(function* () {
        const commands: Array<OrchestrationV2Command> = [];
        assert.deepEqual(
          yield* run({
            commands,
            scanned: [],
            outcomes: [{ _tag: "Skipped" }, { _tag: "AlreadyImported", source: item.source }],
          }),
          { importedCount: 1, skippedCount: 1 },
        );
        assert.deepEqual(commands, []);
      }),
    );
    it.effect("a rejected import is skipped and the next attempt receives a fresh command ID", () =>
      Effect.gen(function* () {
        const commands: Array<OrchestrationV2Command> = [];
        assert.deepEqual(yield* run({ commands, scanned: [], fail: true }), {
          importedCount: 0,
          skippedCount: 1,
        });
        assert.deepEqual(yield* run({ commands, scanned: [] }), {
          importedCount: 1,
          skippedCount: 0,
        });
        assert.notEqual(commands[0]?.commandId, commands[1]?.commandId);
      }),
    );
  },
);
