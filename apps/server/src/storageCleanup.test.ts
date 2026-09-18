import { assert, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { hasLiveWorktreeResources } from "./storageCleanup.ts";

const threadId = ThreadId.make("deleted-thread");

for (const scenario of [
  { name: "nested cwd", cwd: "/work/task/packages/web", status: "idle", expected: true },
  { name: "normalized cwd", cwd: "/work/task/packages/../src", status: "idle", expected: true },
  { name: "same cwd", cwd: "/work/task", status: "running", expected: true },
  {
    name: "sibling with matching prefix",
    cwd: "/work/task-other",
    status: "idle",
    expected: false,
  },
  { name: "stopped nested session", cwd: "/work/task/src", status: "stopped", expected: false },
]) {
  it.effect(`cleanup protects live sessions: ${scenario.name}`, () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`CREATE TABLE orchestration_v2_projection_provider_sessions (thread_id TEXT, status TEXT, payload_json TEXT)`;
      yield* sql`CREATE TABLE orchestration_v2_effect_outbox (thread_id TEXT, status TEXT)`;
      yield* sql`INSERT INTO orchestration_v2_projection_provider_sessions VALUES ('other-thread', ${scenario.status}, json_object('cwd', ${scenario.cwd}))`;
      assert.equal(yield* hasLiveWorktreeResources(threadId, "/work/task"), scenario.expected);
      yield* sql`INSERT INTO orchestration_v2_effect_outbox VALUES (${threadId}, 'pending')`;
      assert.equal(yield* hasLiveWorktreeResources(threadId, "/work/task"), true);
      yield* sql`UPDATE orchestration_v2_effect_outbox SET status = 'completed'`;
      assert.equal(yield* hasLiveWorktreeResources(threadId, "/work/task"), scenario.expected);
    }).pipe(Effect.provide([NodeSqliteClient.layerMemory(), Path.layer])),
  );
}
