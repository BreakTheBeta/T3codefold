import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE pitboss_peers (id TEXT PRIMARY KEY, config_json TEXT NOT NULL, view_json TEXT NOT NULL, last_seen_at TEXT, error TEXT)`;
});
