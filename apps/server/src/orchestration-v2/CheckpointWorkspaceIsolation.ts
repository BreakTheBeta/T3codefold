import { ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export class CheckpointWorkspaceIsolation extends Context.Reference<{
  readonly isIsolated: (input: {
    threadId: ThreadId;
    worktreePath: string | null;
    cwd: string;
  }) => Effect.Effect<boolean>;
}>("t3/CheckpointWorkspaceIsolation", {
  defaultValue: () => ({ isIsolated: () => Effect.succeed(false) }),
}) {}

/** Whole-checkout restores must never overwrite a sibling's or a local thread's work. */
export const layer = Layer.effect(
  CheckpointWorkspaceIsolation,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sql = yield* SqlClient.SqlClient;
    const isIsolated = (input: { threadId: ThreadId; worktreePath: string | null; cwd: string }) =>
      Effect.gen(function* () {
        if (input.worktreePath === null) return false;
        const cwd = yield* fs.realPath(input.cwd);
        if ((yield* fs.realPath(input.worktreePath)) !== cwd) return false;
        const rows = yield* sql`
      SELECT COALESCE(json_extract(t.payload_json, '$.worktreePath'), p.workspace_root) AS cwd
      FROM orchestration_v2_projection_threads t LEFT JOIN projection_projects p ON t.project_id = p.project_id
      WHERE t.deleted_at IS NULL AND t.thread_id != ${input.threadId}
      UNION SELECT json_extract(s.payload_json, '$.cwd') AS cwd FROM orchestration_v2_projection_provider_sessions s
      WHERE s.thread_id != ${input.threadId} AND s.status != 'stopped'
    `;
        const owners = yield* Schema.decodeUnknownEffect(
          Schema.Array(Schema.Struct({ cwd: Schema.NullOr(Schema.String) })),
        )(rows);
        const contains = (parent: string, child: string) => {
          const relative = path.relative(parent, child);
          return (
            relative === "" ||
            (!path.isAbsolute(relative) &&
              relative !== ".." &&
              !relative.startsWith(`..${path.sep}`))
          );
        };
        for (const owner of owners) {
          if (owner.cwd === null) return false;
          const other = yield* fs
            .realPath(owner.cwd)
            .pipe(
              Effect.catch((error) =>
                error.reason._tag === "NotFound" ? Effect.succeed(null) : Effect.fail(error),
              ),
            );
          if (other !== null && (contains(cwd, other) || contains(other, cwd))) return false;
        }
        return true;
      }).pipe(
        Effect.catch((error) =>
          Effect.logWarning("Could not establish checkpoint workspace isolation", { error }).pipe(
            Effect.as(false),
          ),
        ),
      );
    return { isIsolated };
  }),
);
