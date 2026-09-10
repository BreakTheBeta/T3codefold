// @effect-diagnostics nodeBuiltinImport:off globalFetchInEffect:off - exercises the real local tracker HTTP boundary using a private fixture file.
import * as NodeFSP from "node:fs/promises";
import { expect, it } from "@effect/vitest";
import { ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { readSourcePage } from "./TaskSources.ts";
import { WorkStore, layer } from "./WorkStore.ts";

const fixturePath = process.env.T3_PITBOSS_TRACKER_FIXTURE;
const Fixture = Schema.Struct({
  baseUrl: Schema.String,
  token: Schema.String,
  updateToken: Schema.String,
  projectId: Schema.Int,
  taskId: Schema.Int,
});
const decodeFixture = Schema.decodeUnknownEffect(Schema.fromJsonString(Fixture));
it.effect.skipIf(!fixturePath)(
  "reads a real Vikunja task, reconciles Done, and retains T3 acceptance ownership",
  () =>
    Effect.gen(function* () {
      if (!fixturePath) return;
      const text = yield* Effect.promise(() => NodeFSP.readFile(fixturePath, "utf8"));
      const fixture = yield* decodeFixture(text);
      const config = {
        id: "live",
        kind: "vikunja" as const,
        baseUrl: fixture.baseUrl,
        tenantId: "local-live",
        remoteProjectId: String(fixture.projectId),
        projectId: ProjectId.make("tools"),
        enabled: true,
      };
      const store = yield* WorkStore;
      const first = yield* Effect.promise(() => readSourcePage(config, fixture.token, null));
      expect(first.observations.some((item) => item.source.itemId === String(fixture.taskId))).toBe(
        true,
      );
      yield* store.importSources(config, first.observations);
      const initial = yield* store.read();
      yield* store.importSources(config, first.observations);
      expect((yield* store.read()).revision).toBe(initial.revision);
      const response = yield* Effect.promise(() =>
        fetch(`${fixture.baseUrl}/api/v1/tasks/${fixture.taskId}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${fixture.updateToken}`,
            "Content-Type": "application/json",
          },
          body: '{"done":true}',
        }),
      );
      expect(response.ok).toBe(true);
      const second = yield* Effect.promise(() => readSourcePage(config, fixture.token, null));
      yield* store.importSources(config, second.observations);
      const task = (yield* store.read()).tasks.find(
        (item) => item.source?.itemId === String(fixture.taskId),
      );
      expect(task?.source?.status).toBe("Done");
      expect(task?.status).toBe("blocked");
      expect(task?.acceptedEvidenceId).toBeNull();
    }).pipe(Effect.provide(layer.pipe(Layer.provide(SqlitePersistenceMemory)))),
);
