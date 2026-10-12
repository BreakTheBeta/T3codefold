import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

// GLaDOS now runs on native threads and delegated tasks; its old work ledger has no reader.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  for (const table of [
    "pitboss_state",
    "pitboss_events",
    "pitboss_effects",
    "pitboss_sources",
    "pitboss_context_packets",
    "pitboss_peers",
    "pitboss_mail",
  ]) {
    yield* sql.unsafe(`DROP TABLE IF EXISTS ${table}`);
  }
});
