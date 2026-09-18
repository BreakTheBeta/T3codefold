import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { CheckpointWorkspaceIsolation, layer } from "./CheckpointWorkspaceIsolation.ts";

it.effect("checks actual checkout ownership before allowing a file restore", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sql = yield* SqlClient.SqlClient;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-checkpoint-isolation-" });
    const worktree = path.join(root, "task");
    const nested = path.join(worktree, "src");
    const sibling = path.join(root, "task-other");
    yield* fs.makeDirectory(nested, { recursive: true });
    yield* fs.makeDirectory(sibling);
    yield* sql`CREATE TABLE projection_projects (project_id TEXT, workspace_root TEXT)`;
    yield* sql`CREATE TABLE orchestration_v2_projection_threads (thread_id TEXT, project_id TEXT, deleted_at TEXT, payload_json TEXT)`;
    yield* sql`CREATE TABLE orchestration_v2_projection_provider_sessions (thread_id TEXT, status TEXT, payload_json TEXT)`;
    yield* Effect.gen(function* () {
      const isolation = yield* CheckpointWorkspaceIsolation;
      const input = { threadId: ThreadId.make("target"), worktreePath: worktree, cwd: worktree };
      assert.isTrue(yield* isolation.isIsolated(input));
      assert.isFalse(yield* isolation.isIsolated({ ...input, worktreePath: null }));
      yield* sql`INSERT INTO orchestration_v2_projection_provider_sessions VALUES ('sibling', 'idle', json_object('cwd', ${sibling}))`;
      assert.isTrue(yield* isolation.isIsolated(input));
      yield* sql`UPDATE orchestration_v2_projection_provider_sessions SET payload_json = json_object('cwd', ${nested})`;
      assert.isFalse(yield* isolation.isIsolated(input));
      yield* sql`UPDATE orchestration_v2_projection_provider_sessions SET status = 'stopped'`;
      assert.isTrue(yield* isolation.isIsolated(input));
      yield* sql`INSERT INTO projection_projects VALUES ('project', ${worktree})`;
      yield* sql`INSERT INTO orchestration_v2_projection_threads VALUES ('local-thread', 'project', NULL, '{}')`;
      assert.isFalse(yield* isolation.isIsolated(input));
      yield* sql`UPDATE orchestration_v2_projection_threads SET deleted_at = '2026-09-18'`;
      assert.isTrue(yield* isolation.isIsolated(input));
    }).pipe(Effect.provide(layer));
  }).pipe(Effect.provide([NodeSqliteClient.layerMemory(), NodeServices.layer]), Effect.scoped),
);
