import {
  AgentSessionImportProjectChangedError,
  AgentSessionImportProjectNotFoundError,
  AgentSessionImportSource,
  AgentSessionScanError,
  CommandId,
  DEFAULT_MODEL,
  DEFAULT_MODEL_BY_PROVIDER,
  ThreadId,
  ProviderDriverKind,
  type AgentSessionImportInput,
  type AgentSessionImportResult,
} from "@t3tools/contracts";
import { normalizeProjectPathForComparison } from "@t3tools/shared/path";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { ThreadManagementService } from "../orchestration-v2/ThreadManagementService.ts";
import * as AgentSessionScanner from "./AgentSessionScanner.ts";

/** Import transcript text and its native resume reference through the serialized V2 command path. */

export const importRecentAgentThreads = Effect.fn("importRecentAgentThreads")(function* (
  input: AgentSessionImportInput,
) {
  const scanner = yield* AgentSessionScanner.AgentSessionScanner;
  const threads = yield* ThreadManagementService;
  const snapshots = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
  const crypto = yield* Crypto.Crypto;
  const sql = yield* SqlClient.SqlClient;
  const project = yield* snapshots.getProjectShellById(input.projectId).pipe(
    Effect.mapError((cause) => new AgentSessionScanError({ operation: "read-projects", cause })),
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(new AgentSessionImportProjectNotFoundError({ projectId: input.projectId })),
        onSome: Effect.succeed,
      }),
    ),
  );
  if (
    input.expectedWorkspaceRoot !== undefined &&
    normalizeProjectPathForComparison(project.workspaceRoot) !==
      normalizeProjectPathForComparison(input.expectedWorkspaceRoot)
  ) {
    return yield* new AgentSessionImportProjectChangedError({ projectId: input.projectId });
  }
  // Read just the discovery cursors: loading every transcript to discover unchanged files is unbounded.
  const rows = yield* sql<{ sources: string }>`
    SELECT json_extract(payload_json, '$.importedAgentSessions') AS sources
    FROM orchestration_v2_projection_threads
    WHERE project_id = ${input.projectId}
      AND json_type(payload_json, '$.importedAgentSessions') = 'array'
  `.pipe(
    Effect.mapError((cause) => new AgentSessionScanError({ operation: "read-projects", cause })),
  );
  const completed = yield* Effect.forEach(rows, (row) =>
    Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(AgentSessionImportSource)))(
      row.sources,
    ),
  ).pipe(
    Effect.mapError((cause) => new AgentSessionScanError({ operation: "read-projects", cause })),
  );
  let importedCount = 0;
  let skippedCount = 0;
  const importedIds = new Set<ThreadId>();
  yield* Stream.runForEach(
    scanner.recentThreads(project.workspaceRoot, completed.flat()),
    (outcome) =>
      Effect.gen(function* () {
        if (outcome._tag === "Skipped") {
          skippedCount += 1;
          return;
        }
        const source = outcome.source;
        const threadId = ThreadId.make(
          `import:${source.providerInstanceId}:${source.providerSessionId}`,
        );
        if (outcome._tag === "AlreadyImported") {
          importedIds.add(threadId);
          importedCount += 1;
          return;
        }
        if (outcome._tag === "Duplicate" && !importedIds.has(threadId)) return;
        const imported = yield* Effect.gen(function* () {
          const existing =
            outcome._tag === "Duplicate" ? yield* threads.getThreadProjection(threadId) : null;
          const transcript = outcome._tag === "Importable" ? outcome.thread : null;
          // Duplicate paths only append a source cursor to the already imported owner.
          yield* threads.dispatch({
            type: "thread.history.import",
            commandId: CommandId.make(yield* crypto.randomUUIDv4),
            threadId,
            projectId: input.projectId,
            expectedWorkspaceRoot: project.workspaceRoot,
            title: transcript?.title ?? existing?.thread.title ?? "Imported session",
            modelSelection: existing?.thread.modelSelection ?? {
              instanceId: source.providerInstanceId,
              model:
                transcript?.model ??
                DEFAULT_MODEL_BY_PROVIDER[ProviderDriverKind.make(source.provider)] ??
                DEFAULT_MODEL,
            },
            source,
            createdAt: transcript ? DateTime.makeUnsafe(transcript.createdAt) : yield* DateTime.now,
            messages:
              transcript?.messages.map((message) => ({
                ...message,
                createdAt: DateTime.makeUnsafe(message.createdAt),
              })) ?? [],
          });
          return true;
        }).pipe(
          Effect.catch((cause) =>
            Effect.logWarning("Could not import an agent session", {
              provider: source.provider,
              sessionId: source.providerSessionId,
              cause,
            }).pipe(Effect.as(false)),
          ),
        );
        if (imported) {
          if (outcome._tag !== "Duplicate") {
            importedIds.add(threadId);
            importedCount += 1;
          }
        } else skippedCount += 1;
      }),
  );
  return { importedCount, skippedCount } satisfies AgentSessionImportResult;
});
