import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE pitboss_mail (peer_id TEXT NOT NULL, direction TEXT NOT NULL, message_id TEXT NOT NULL, payload_json TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(peer_id, direction, message_id))`;
});
