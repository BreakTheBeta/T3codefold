import {
  FactoryAgent,
  type ThreadId,
  type RunAttemptId,
  type OrchestrationV2ServerCommand,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import { FactoryControl, factoryIsEnabled } from "./FactoryControl.ts";
import {
  ThreadActivityGuard,
  ThreadActivityGuardError,
} from "../orchestration-v2/ThreadActivityGuard.ts";
import { FactoryStore } from "./FactoryStore.ts";
import { TurnPreamble } from "../orchestration-v2/TurnPreamble.ts";
import {
  ThreadRetentionGuard,
  ThreadRetentionGuardError,
} from "../orchestration-v2/ThreadRetentionGuard.ts";
import { inSubtree } from "./access.ts";
import { FACTORY_AUTHORITY, FACTORY_COMMANDER_POLICY } from "./FactoryPrompts.ts";

const isThreadActivityGuardError = Schema.is(ThreadActivityGuardError);
const isThreadRetentionGuardError = Schema.is(ThreadRetentionGuardError);

const decodeAgent = Schema.decodeEffect(Schema.fromJsonString(FactoryAgent));
const factoryThreadAgent = Effect.fn("FactorySeams.threadAgent")(function* (threadId: ThreadId) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{
    payload_json: string;
  }>`SELECT payload_json FROM factory_agents WHERE json_extract(payload_json, '$.threadId') = ${threadId}`;
  return rows[0] ? yield* decodeAgent(rows[0].payload_json) : undefined;
});

const preamble = Layer.effect(
  TurnPreamble,
  Effect.gen(function* () {
    const store = yield* FactoryStore;
    const sql = yield* SqlClient.SqlClient;
    return {
      forAttempt: Effect.fn("FactorySeams.forAttempt")(
        (threadId: ThreadId, attemptId: RunAttemptId) =>
          sql
            .withTransaction(
              Effect.gen(function* () {
                if (!(yield* factoryIsEnabled)) return null;
                const cached = yield* sql<{
                  content: string;
                }>`SELECT content FROM factory_capsule_attempts WHERE attempt_id = ${attemptId}`;
                if (cached[0]) return cached[0].content;
                const agent = (yield* store.list("agents")).find(
                  (a) => a.threadId === threadId && !["closed", "retired"].includes(a.lifecycle),
                );
                if (!agent) return null;
                const all = yield* store.list("agents");
                const owners = new Set(
                  all
                    .filter((a) => inSubtree(agent, a, all) || inSubtree(a, agent, all))
                    .map((a) => a.id),
                );
                const cards = (yield* store.list("cards"))
                  .filter(
                    (c) => owners.has(c.ownerId) && !["withdrawn", "superseded"].includes(c.state),
                  )
                  .sort(
                    (a, b) =>
                      Number(b.state === "open") - Number(a.state === "open") ||
                      b.updatedAt - a.updatedAt ||
                      a.id.localeCompare(b.id),
                  );
                const pending = (yield* store.list("wakes")).filter(
                  (w) => w.targetId === agent.id && !["acked", "cancelled"].includes(w.state),
                );
                const cardLines = cards
                  .slice(0, 8)
                  .map(
                    (c) =>
                      `${c.id} r${c.revision} owner=${c.ownerId} ${c.state}/${c.outcome ?? "unanswered"} option=${c.optionId ?? "none"}: ${c.body.title.slice(0, 80)}`,
                  )
                  .join("\n");
                const wakeLines = pending
                  .slice(0, 8)
                  .map((w) => `${w.id}: ${w.refKind}:${w.refId} (${w.state})`)
                  .join("\n");
                const marker = "";
                const snapshot = `
${FACTORY_AUTHORITY}
Identity: ${agent.role} ${agent.id}; parent: ${agent.parentId ?? "none"}; project: ${agent.projectId}.
Assignment: ${agent.workState ?? "unreported"}. Needs: ${(agent.needs ?? "none").slice(0, 500)}
Next deliverable/owner: ${agent.next.slice(0, 500)}
Ancestor cards are read-only context; ownership and execution authority do not transfer.
Decisions (${cards.length}; open first, then recent; first 8; read exact details with factory_card_show):
${cardLines}
Pending wakes (${pending.length}; first 8; read factory_board for all):
${wakeLines}
Read the durable mission/tracker and current card revisions before acting after handover.
`.slice(0, 2800);
                const policy = agent.role === "commander" ? `${FACTORY_COMMANDER_POLICY}\n` : "";
                const content = `<factory-role>\n${policy}${snapshot}\nRead factory_board for the complete current snapshot.\nPersisted mission/capsule r${agent.capsuleRevision} (current server role policy governs responsibility):\n${agent.capsule.slice(0, 6000)}\n</factory-role>`;
                yield* sql`INSERT INTO factory_capsule_attempts (attempt_id, agent_id, content, marker) VALUES (${attemptId}, ${agent.id}, ${content}, ${marker})`;
                return content;
              }),
            )
            .pipe(
              Effect.provideService(SqlClient.SqlClient, sql),
              Effect.orElseSucceed(() => null),
            ),
      ),
    };
  }),
);

const retention = Layer.effect(
  ThreadRetentionGuard,
  Effect.gen(function* () {
    const store = yield* FactoryStore;
    const sql = yield* SqlClient.SqlClient;
    return {
      check: Effect.fn("FactorySeams.checkRetention")(
        function* (command: OrchestrationV2ServerCommand) {
          if (!(yield* factoryIsEnabled)) return;
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
        Effect.provideService(SqlClient.SqlClient, sql),
        Effect.mapError((cause) =>
          isThreadRetentionGuardError(cause)
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

const activity = Layer.effect(
  ThreadActivityGuard,
  Effect.gen(function* () {
    const control = yield* FactoryControl;
    const sql = yield* SqlClient.SqlClient;
    const check = Effect.fn("FactorySeams.checkActivity")(
      function* (threadId: ThreadId) {
        const agent = yield* factoryThreadAgent(threadId);
        if (
          agent &&
          (!(yield* factoryIsEnabled) || ["closed", "retired"].includes(agent.lifecycle))
        )
          return yield* new ThreadActivityGuardError({
            reason: "Factory is disabled or this agent is closed.",
          });
      },
      Effect.provideService(SqlClient.SqlClient, sql),
      Effect.mapError((cause) =>
        isThreadActivityGuardError(cause)
          ? cause
          : new ThreadActivityGuardError({
              reason: "Factory activity state is unavailable.",
              cause,
            }),
      ),
    );
    const admit = Effect.fn("FactorySeams.admitActivity")(function* <A, E, R>(
      threadId: ThreadId,
      work: Effect.Effect<A, E, R>,
    ) {
      const agent = yield* factoryThreadAgent(threadId).pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
        Effect.mapError(
          (cause) =>
            new ThreadActivityGuardError({
              reason: "Factory activity state is unavailable.",
              cause,
            }),
        ),
      );
      if (!agent) return yield* work;
      if (["closed", "retired"].includes(agent.lifecycle))
        return yield* new ThreadActivityGuardError({ reason: "This Factory agent is closed." });
      const result = yield* control.admit(Effect.result(work)).pipe(
        Effect.mapError(
          (cause) =>
            new ThreadActivityGuardError({
              reason: "Factory is disabled on this server.",
              cause,
            }),
        ),
      );
      if (result._tag === "Failure") return yield* Effect.fail(result.failure);
      return result.success;
    });
    return { check, admit };
  }),
);

export const layer = Layer.mergeAll(preamble, retention, activity);
