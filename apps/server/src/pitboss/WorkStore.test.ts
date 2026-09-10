import { expect, it } from "@effect/vitest";
import { CommandId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { WorkStore, layer } from "./WorkStore.ts";
const database = SqlitePersistenceMemory;
const services = layer.pipe(Layer.provideMerge(database));
const election = {
  commandId: CommandId.make("elect"),
  expectedRevision: 0,
  action: {
    type: "elect" as const,
    threadId: ThreadId.make("boss"),
    projectId: ProjectId.make("tools"),
    brief: {
      priorities: "Tools reliability",
      quality: "Prove behavior",
      projectIds: [ProjectId.make("tools")],
      maxWorkers: 1,
      maxAttempts: 3,
      workerModel: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    },
  },
};
it.effect("persists one election and one dispatch intent when the reply is lost and retried", () =>
  Effect.gen(function* () {
    const store = yield* WorkStore;
    const first = yield* store.command(election, { type: "user" });
    const retry = yield* store.command(election, { type: "user" });
    expect(retry.revision).toBe(first.revision);
    expect((yield* store.effects()).map((effect) => effect.operation_id)).toEqual(["elect"]);
    const conflict = yield* store
      .command(
        { ...election, action: { ...election.action, threadId: ThreadId.make("other") } },
        { type: "user" },
      )
      .pipe(Effect.flip);
    expect(conflict.code).toBe("conflict");
    expect((yield* store.read()).role?.threadId).toBe("boss");
  }).pipe(Effect.provide(services)),
);

it.effect("does not expose the portfolio or role controls to an unrelated agent", () =>
  Effect.gen(function* () {
    const store = yield* WorkStore;
    yield* store.command(election, { type: "user" });
    const actor = { type: "agent" as const, threadId: ThreadId.make("stranger") };
    const readError = yield* store.read(actor).pipe(Effect.flip);
    expect(readError.code).toBe("forbidden");
    const error = yield* store
      .command(
        {
          commandId: CommandId.make("pause"),
          expectedRevision: 1,
          action: { type: "pause", paused: true },
        },
        actor,
      )
      .pipe(Effect.flip);
    expect(error.code).toBe("forbidden");
    expect((yield* store.read()).role?.paused).toBe(false);
  }).pipe(Effect.provide(services)),
);

it.effect(
  "deduplicates tracker refreshes and keeps external Done separate from accepted work",
  () =>
    Effect.gen(function* () {
      const store = yield* WorkStore;
      const config = {
        id: "local",
        kind: "vikunja" as const,
        baseUrl: "http://localhost:18456",
        tenantId: "pilot",
        remoteProjectId: "2",
        projectId: ProjectId.make("tools"),
        enabled: true,
      };
      const observation = {
        title: "Tracker task",
        outcome: "Prove behavior",
        source: {
          kind: "vikunja" as const,
          tenantId: "pilot",
          itemId: "1",
          key: "#1",
          url: "http://localhost:18456/tasks/1",
          status: "Open",
          priority: "3",
          observedAt: "2026-09-10T00:00:00.000Z",
        },
      };
      yield* store.importSources(config, [observation]);
      const initial = yield* store.read();
      yield* store.importSources(config, [
        {
          ...observation,
          source: { ...observation.source, observedAt: "2026-09-10T00:01:00.000Z" },
        },
      ]);
      expect((yield* store.read()).revision).toBe(initial.revision);
      yield* store.importSources(config, [
        { ...observation, source: { ...observation.source, status: "Done" } },
      ]);
      const result = yield* store.read();
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0]?.source?.status).toBe("Done");
      expect(result.tasks[0]?.status).toBe("blocked");
      expect(result.tasks[0]?.acceptedEvidenceId).toBeNull();
    }).pipe(Effect.provide(services)),
);

it.effect("rebuilds the disposable projection from the durable journal", () =>
  Effect.gen(function* () {
    const store = yield* WorkStore;
    const expected = yield* store.command(election, { type: "user" });
    const sql = yield* SqlClient.SqlClient;
    yield* sql`DELETE FROM pitboss_state`;
    expect(yield* store.read()).toEqual(expected);
    expect(yield* store.rebuild()).toEqual(expected);
    expect((yield* store.effects()).map((effect) => effect.operation_id)).toEqual(["elect"]);
  }).pipe(Effect.provide(services)),
);

it.effect(
  "reuses a recorded context packet after brief changes and rejects cross-thread reuse",
  () =>
    Effect.gen(function* () {
      const store = yield* WorkStore;
      yield* store.command(election, { type: "user" });
      const first = yield* store.context(ThreadId.make("boss"), "turn-one");
      yield* store.command(
        {
          commandId: CommandId.make("pause-context"),
          expectedRevision: 1,
          action: { type: "pause", paused: true },
        },
        { type: "user" },
      );
      expect(yield* store.context(ThreadId.make("boss"), "turn-one")).toBe(first);
      expect(yield* store.context(ThreadId.make("boss"), "turn-two")).toContain("paused");
      const error = yield* store.context(ThreadId.make("stranger"), "turn-one").pipe(Effect.flip);
      expect(error.code).toBe("conflict");
    }).pipe(Effect.provide(services)),
);

it.effect("keeps a failed dispatch visible as an unresolved obligation after recovery", () =>
  Effect.gen(function* () {
    const store = yield* WorkStore;
    yield* store.command(election, { type: "user" });
    yield* store.finishEffect("elect", "Thread is unavailable; choose another pitboss.");
    yield* store.finishEffect("elect", "Thread is unavailable; choose another pitboss.");
    const state = yield* store.read();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.kind).toBe("question");
    expect(state.messages[0]?.acknowledged).toBe(false);
    expect(state.messages[0]?.text).toContain("Thread is unavailable");
    expect(yield* store.rebuild()).toEqual(state);
  }).pipe(Effect.provide(services)),
);

it.effect("keeps projects outside the elected brief out of agent reads and injected context", () =>
  Effect.gen(function* () {
    const store = yield* WorkStore;
    yield* store.importSources(
      {
        id: "old-scope",
        kind: "vikunja",
        baseUrl: "http://tracker.test",
        tenantId: "old-company",
        remoteProjectId: "1",
        projectId: ProjectId.make("other-project"),
        enabled: true,
      },
      [
        {
          title: "Outside portfolio",
          outcome: "Private outside-scope details",
          source: {
            kind: "vikunja",
            tenantId: "old-company",
            itemId: "1",
            key: "#1",
            url: "http://tracker.test/tasks/1",
            status: "Open",
            priority: "1",
            observedAt: "2026-09-10T00:00:00Z",
          },
        },
      ],
    );
    yield* store.command(
      { ...election, expectedRevision: (yield* store.read()).revision },
      { type: "user" },
    );
    expect((yield* store.read()).tasks).toHaveLength(1);
    expect(
      (yield* store.read({ type: "agent", threadId: ThreadId.make("boss") })).tasks,
    ).toHaveLength(0);
    expect(yield* store.context(ThreadId.make("boss"), "scoped-packet")).not.toContain(
      "Outside portfolio",
    );
  }).pipe(Effect.provide(services)),
);
