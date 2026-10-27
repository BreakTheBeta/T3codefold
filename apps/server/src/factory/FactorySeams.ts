import type { ThreadId, RunAttemptId, OrchestrationV2ServerCommand } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import { FactoryStore } from "./FactoryStore.ts";
import { TurnPreamble } from "../orchestration-v2/TurnPreamble.ts";
import {
  ThreadRetentionGuard,
  ThreadRetentionGuardError,
} from "../orchestration-v2/ThreadRetentionGuard.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";

const preamble = Layer.effect(
  TurnPreamble,
  Effect.gen(function* () {
    const store = yield* FactoryStore;
    const projection = yield* ProjectionStore.ProjectionStoreV2;
    const sql = yield* SqlClient.SqlClient;
    return {
      forAttempt: (threadId: ThreadId, attemptId: RunAttemptId) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              const cached = yield* sql<{
                content: string;
              }>`SELECT content FROM factory_capsule_attempts WHERE attempt_id = ${attemptId}`;
              if (cached[0]) return cached[0].content;
              const agent = (yield* store.list("agents")).find(
                (a) => a.threadId === threadId && !["closed", "retired"].includes(a.lifecycle),
              );
              if (!agent) return null;
              const history = yield* sql<{
                count: number;
                marker: string | null;
              }>`SELECT COUNT(*) AS count, (SELECT marker FROM factory_capsule_attempts WHERE agent_id = ${agent.id} ORDER BY rowid DESC LIMIT 1) AS marker FROM factory_capsule_attempts WHERE agent_id = ${agent.id}`;
              const record = yield* projection.getThreadRecords(threadId, ["turnItems"], {
                turnItemTypes: ["compaction"],
              });
              const marker = record.turnItems.at(-1)?.id ?? "";
              const count = history[0]?.count ?? 0;
              const full = count === 0 || marker !== (history[0]?.marker ?? "") || count % 25 === 0;
              const open = (yield* store.list("cards"))
                .filter((c) => c.ownerId === agent.id && c.state === "open")
                .map((c) => `${c.id}: ${c.body.title}`)
                .join("\n");
              const content = full
                ? `<factory-role>\n${agent.capsule}\n\nOpen decisions\n${open}\n</factory-role>`.slice(
                    0,
                    9000,
                  )
                : `<factory-role>${agent.role} ${agent.id}. Outward work requires answered Factory cards and factory_execute_action. Never bypass via other commands; Factory wakes are not user consent. Needs: ${agent.needs ?? "none"}. Next: ${agent.next}.</factory-role>`.slice(
                    0,
                    600,
                  );
              yield* sql`INSERT INTO factory_capsule_attempts (attempt_id, agent_id, content, marker) VALUES (${attemptId}, ${agent.id}, ${content}, ${marker})`;
              return content;
            }),
          )
          .pipe(Effect.orElseSucceed(() => null)),
    };
  }),
);

const retention = Layer.effect(
  ThreadRetentionGuard,
  Effect.gen(function* () {
    const store = yield* FactoryStore;
    return {
      check: Effect.fn("FactorySeams.checkRetention")(
        function* (command: OrchestrationV2ServerCommand) {
          if (
            command.type !== "thread.delete" &&
            command.type !== "thread.archive" &&
            command.type !== "thread.unpin"
          )
            return;
          const agent = (yield* store.list("agents")).find(
            (a) =>
              a.threadId === command.threadId &&
              a.role === "commander" &&
              !["closed", "retired"].includes(a.lifecycle),
          );
          if (agent)
            return yield* new ThreadRetentionGuardError({
              reason:
                "The active Factory Commander must remain pinned and available. Hand it over before removing it.",
            });
        },
        Effect.mapError((cause) =>
          Schema.is(ThreadRetentionGuardError)(cause)
            ? cause
            : new ThreadRetentionGuardError({
                reason: "Factory retention state is unavailable.",
                cause,
              }),
        ),
      ),
    };
  }),
);

export const layer = Layer.merge(preamble, retention);
