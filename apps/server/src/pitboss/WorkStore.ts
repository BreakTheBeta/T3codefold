import { replayJournal } from "./WorkJournal.ts";
import * as NodeCrypto from "node:crypto";
import type { PitbossSourceAuthority, PitbossSourceConfig } from "@t3tools/contracts";
import type { SourceObservation } from "./TaskSources.ts";
import {
  PitbossMessage,
  PitbossCommand,
  PitbossError,
  PitbossSnapshot,
  type PitbossAttempt,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { decide, importedCriteria, observeAttempt, workContext, type WorkActor } from "./Work.ts";

export interface WorkEffect {
  readonly operation_id: string;
  readonly kind: string;
  readonly payload_json: string;
  readonly attempts: number;
  readonly error: string | null;
}
const isPitbossError = Schema.is(PitbossError);
const decodeCommand = Schema.decodeUnknownEffect(PitbossCommand);
const decodeSnapshot = Schema.decodeUnknownEffect(Schema.fromJsonString(PitbossSnapshot));
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const encodeSnapshot = Schema.encodeEffect(Schema.fromJsonString(PitbossSnapshot));
const unavailable = (cause: unknown) =>
  isPitbossError(cause)
    ? cause
    : new PitbossError({
        code: "unavailable",
        message: cause instanceof Error ? cause.message : "Work storage unavailable.",
      });

export class WorkStore extends Context.Service<
  WorkStore,
  {
    receiveMessage: (message: typeof PitbossMessage.Type) => Effect.Effect<void, PitbossError>;
    rebuild: () => Effect.Effect<PitbossSnapshot, PitbossError>;
    read: (actor?: WorkActor) => Effect.Effect<PitbossSnapshot, PitbossError>;
    command: (
      input: PitbossCommand,
      actor: WorkActor,
    ) => Effect.Effect<PitbossSnapshot, PitbossError>;
    subscribe: () => Stream.Stream<PitbossSnapshot, PitbossError>;
    changes: Stream.Stream<void>;
    effects: () => Effect.Effect<ReadonlyArray<WorkEffect>, PitbossError>;
    finishEffect: (id: string, error?: string) => Effect.Effect<void, PitbossError>;
    updateAttempt: (
      taskId: string,
      attemptId: string,
      state: PitbossAttempt["state"],
      detail: string,
      workspacePath?: string,
    ) => Effect.Effect<void, PitbossError>;
    setSourceAuthority: (authority: PitbossSourceAuthority) => Effect.Effect<void, PitbossError>;
    importSources: (
      config: PitbossSourceConfig,
      observations: ReadonlyArray<SourceObservation>,
    ) => Effect.Effect<void, PitbossError>;
    context: (threadId: ThreadId, packetId: string) => Effect.Effect<string | null, PitbossError>;
  }
>()("t3/pitboss/WorkStore") {}

export const layer = Layer.effect(
  WorkStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const notifications = yield* PubSub.unbounded<void>();
    const persist = Effect.fn("WorkStore.persist")(function* (state: PitbossSnapshot) {
      const json = yield* encodeSnapshot(state);
      yield* sql`INSERT INTO pitboss_state (id, payload_json) VALUES (1, ${json}) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json`;
    });
    const rebuild = Effect.fn("WorkStore.rebuild")(
      function* () {
        const rows = yield* sql<{
          payload_json: string;
        }>`SELECT payload_json FROM pitboss_events ORDER BY sequence`;
        const state = yield* Effect.try({
          try: () => replayJournal(rows.map((row) => row.payload_json)),
          catch: unavailable,
        });
        yield* persist(state);
        return state;
      },
      sql.withTransaction,
      Effect.mapError(unavailable),
    );
    const readAll = Effect.fn("WorkStore.read")(
      function* () {
        const rows = yield* sql<{
          payload_json: string;
        }>`SELECT payload_json FROM pitboss_state WHERE id = 1`;
        // Missing projections are recoverable; replay never re-enqueues provider effects.
        return rows[0] ? yield* decodeSnapshot(rows[0].payload_json) : yield* rebuild();
      },
      sql.withTransaction,
      Effect.mapError(unavailable),
    );
    const read = Effect.fn("WorkStore.readScoped")(function* (actor?: WorkActor) {
      const state = yield* readAll();
      if (!actor || actor.type === "user" || state.role?.threadId === actor.threadId) return state;
      const tasks = state.tasks.filter((task) => task.attempts.at(-1)?.threadId === actor.threadId);
      if (!tasks.length)
        return yield* new PitbossError({
          code: "forbidden",
          message: "This thread has no pitboss assignment.",
        });
      return {
        ...state,
        role: null,
        tasks,
        messages: state.messages.filter((message) =>
          tasks.some((task) => task.id === message.taskId),
        ),
      };
    });
    const command = Effect.fn("WorkStore.command")(function* (
      raw: PitbossCommand,
      actor: WorkActor,
    ) {
      const input = yield* decodeCommand(raw);
      const requestJson = encodeJson({ input, actor });
      const now = DateTime.formatIso(yield* DateTime.now);
      const result = yield* sql.withTransaction(
        Effect.gen(function* () {
          const previous = yield* sql<{
            request_json: string;
          }>`SELECT request_json FROM pitboss_events WHERE operation_id = ${input.commandId}`;
          if (previous[0]) {
            if (previous[0].request_json !== requestJson)
              return yield* new PitbossError({
                code: "conflict",
                message: "This command ID was already used with another payload or actor.",
              });
            return yield* readAll();
          }
          const before = yield* readAll();
          const after = yield* Effect.try({
            try: () => decide(before, input, actor, now),
            catch: unavailable,
          });
          yield* sql`INSERT INTO pitboss_events (operation_id, request_json, payload_json, created_at) VALUES (${input.commandId}, ${requestJson}, ${encodeJson({ type: "command", input, actor, now })}, ${now})`;
          yield* persist(after);
          const action = input.action;
          if (
            ["elect", "assign", "rework", "cancel", "propose-coordination", "send-peer"].includes(
              action.type,
            )
          ) {
            yield* sql`INSERT INTO pitboss_effects (operation_id, kind, payload_json) VALUES (${input.commandId}, ${action.type}, ${encodeJson(action)})`;
          }
          return after;
        }),
      );
      yield* PubSub.publish(notifications, undefined);
      return actor.type === "user" || result.role?.threadId === actor.threadId
        ? result
        : yield* read(actor);
    }, Effect.mapError(unavailable));
    return WorkStore.of({
      read,
      command,
      rebuild,
      receiveMessage: (message) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              const state = yield* readAll();
              const previous = state.messages.find((entry) => entry.id === message.id);
              if (previous) return;
              yield* sql`INSERT INTO pitboss_events (operation_id, request_json, payload_json, created_at) VALUES (${message.id}, ${message.id}, ${encodeJson({ type: "message", message })}, ${message.createdAt})`;
              yield* persist({
                ...state,
                revision: state.revision + 1,
                messages: [...state.messages, message],
              });
            }),
          )
          .pipe(
            Effect.tap(() => PubSub.publish(notifications, undefined)),
            Effect.mapError(unavailable),
          ),
      changes: Stream.fromPubSub(notifications),
      subscribe: () =>
        Stream.unwrap(
          Effect.gen(function* () {
            const subscription = yield* PubSub.subscribe(notifications);
            return Stream.concat(
              Stream.fromEffect(readAll()),
              Stream.fromSubscription(subscription).pipe(Stream.mapEffect(readAll)),
            );
          }),
        ),
      effects: () =>
        sql<WorkEffect>`SELECT operation_id, kind, payload_json, attempts, error FROM pitboss_effects WHERE state = 'pending' ORDER BY rowid LIMIT 20`.pipe(
          Effect.mapError(unavailable),
        ),
      finishEffect: (id, error) =>
        Effect.gen(function* () {
          yield* sql`UPDATE pitboss_effects SET state = ${error ? "failed" : "done"}, attempts = attempts + 1, error = ${error ?? null} WHERE operation_id = ${id}`;
          yield* PubSub.publish(notifications, undefined);
        }).pipe(Effect.mapError(unavailable)),
      updateAttempt: (taskId, attemptId, status, detail, workspacePath) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              const before = yield* readAll();
              const next = observeAttempt(before, taskId, attemptId, status, detail, workspacePath);
              if (next === before) return;
              const now = DateTime.formatIso(yield* DateTime.now);
              const eventId = `attempt:${attemptId}:${next.revision}`;
              yield* sql`INSERT INTO pitboss_events (operation_id, request_json, payload_json, created_at) VALUES (${eventId}, ${eventId}, ${encodeJson({ type: "attempt", taskId, attemptId, status, detail, workspacePath })}, ${now})`;
              yield* persist(next);
            }),
          )
          .pipe(
            Effect.tap(() => PubSub.publish(notifications, undefined)),
            Effect.mapError(unavailable),
          ),
      setSourceAuthority: (authority) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              const state = yield* readAll();
              const previous = state.sourceAuthorities?.find(
                (entry) => entry.scope === authority.scope,
              );
              if (
                previous?.self === authority.self &&
                previous.coordinator === authority.coordinator
              )
                return;
              const next = {
                ...state,
                revision: state.revision + 1,
                sourceAuthorities: [
                  ...(state.sourceAuthorities ?? []).filter(
                    (entry) => entry.scope !== authority.scope,
                  ),
                  authority,
                ],
              };
              const eventId = `authority:${next.revision}`;
              const now = DateTime.formatIso(yield* DateTime.now);
              yield* sql`INSERT INTO pitboss_events (operation_id, request_json, payload_json, created_at) VALUES (${eventId}, ${eventId}, ${encodeJson({ type: "authority", authority })}, ${now})`;
              yield* persist(next);
            }),
          )
          .pipe(
            Effect.tap(() => PubSub.publish(notifications, undefined)),
            Effect.mapError(unavailable),
          ),
      importSources: (config, observations) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              const state = yield* readAll();
              const tasks = [...state.tasks];
              const messages = [...state.messages];
              let revision = state.revision;
              for (const item of observations) {
                const observation = {
                  ...item,
                  source: {
                    ...item.source,
                    scope: encodeJson([config.kind, config.tenantId, config.remoteProjectId]),
                    contentDigest: NodeCrypto.createHash("sha256")
                      .update(encodeJson([item.title, item.outcome]))
                      .digest("hex"),
                  },
                };
                const identity = encodeJson([
                  observation.source.kind,
                  observation.source.tenantId,
                  observation.source.itemId,
                ]);
                const id = `source-${NodeCrypto.createHash("sha256").update(identity).digest("hex")}`;
                const old = tasks.find((task) => task.id === id);
                if (old && old.projectId !== config.projectId)
                  return yield* new PitbossError({
                    code: "conflict",
                    message: "This source item already belongs to another T3 project.",
                  });
                if (!old && tasks.length >= 500)
                  return yield* new PitbossError({
                    code: "invalid",
                    message: "The pilot backlog limit is 500. Narrow the source scope.",
                  });
                const outcome = observation.outcome.slice(0, 16000);
                if (
                  old &&
                  old.source?.contentDigest === observation.source.contentDigest &&
                  old.source &&
                  old.source.scope === observation.source.scope &&
                  old.source.status === observation.source.status &&
                  old.source.priority === observation.source.priority &&
                  old.source.url === observation.source.url &&
                  old.source.key === observation.source.key
                )
                  continue;
                const changed =
                  old && old.source?.contentDigest !== observation.source.contentDigest;
                const task = old
                  ? {
                      ...old,
                      title: changed ? observation.title : old.title,
                      source: observation.source,
                      revision: old.revision + 1,
                      note: changed
                        ? "Source requirements changed. Review criteria before continuing."
                        : old.note,
                      status: changed ? ("blocked" as const) : old.status,
                      acceptedEvidenceId: changed ? null : old.acceptedEvidenceId,
                      criteriaVersion: changed ? old.criteriaVersion + 1 : old.criteriaVersion,
                      outcome: changed ? outcome : old.outcome,
                      updatedAt: observation.source.observedAt,
                    }
                  : {
                      id,
                      revision: 1,
                      projectId: config.projectId,
                      title: observation.title,
                      outcome: observation.outcome.slice(0, 16000),
                      criteria: importedCriteria,
                      criteriaVersion: 1,
                      verifyCommand: "",
                      priority: 50,
                      dependencies: [],
                      workspaceStrategy: { type: "worktree" as const, baseRef: "HEAD" },
                      status: "blocked" as const,
                      attempts: [],
                      evidence: [],
                      source: observation.source,
                      note: "Imported candidate. Review scope and acceptance before reopening.",
                      acceptedEvidenceId: null,
                      createdAt: observation.source.observedAt,
                      updatedAt: observation.source.observedAt,
                    };
                const index = tasks.findIndex((entry) => entry.id === id);
                if (index === -1) tasks.push(task);
                else tasks[index] = task;
                revision += 1;
                const eventId = `source:${id}:${revision}`;
                const message = {
                  id: eventId,
                  taskId: id,
                  threadId: null,
                  kind: "progress" as const,
                  text: old
                    ? "Source observation changed. Review requirements and source status without treating them as acceptance."
                    : "New imported candidate. Review scope, acceptance criteria, and verification before activation.",
                  createdAt: observation.source.observedAt,
                  acknowledged: false,
                };
                messages.push(message);
                yield* sql`INSERT INTO pitboss_events (operation_id, request_json, payload_json, created_at) VALUES (${eventId}, ${identity}, ${encodeJson({ type: "source", task, message })}, ${observation.source.observedAt})`;
              }
              if (revision !== state.revision)
                yield* persist({ ...state, revision, tasks, messages });
            }),
          )
          .pipe(
            Effect.tap(() => PubSub.publish(notifications, undefined)),
            Effect.mapError(unavailable),
          ),
      context: (threadId, packetId) =>
        Effect.gen(function* () {
          const previous = yield* sql<{
            thread_id: string;
            content: string;
          }>`SELECT thread_id, content FROM pitboss_context_packets WHERE packet_id = ${packetId}`;
          if (previous[0]) {
            if (previous[0].thread_id !== threadId)
              return yield* new PitbossError({
                code: "conflict",
                message: "Context packet belongs to a different thread.",
              });
            return previous[0].content;
          }
          const state = yield* readAll();
          const content = workContext(state, threadId);
          if (content === null) return null;
          const now = DateTime.formatIso(yield* DateTime.now);
          yield* sql`INSERT INTO pitboss_context_packets (packet_id, thread_id, revision, content, created_at) VALUES (${packetId}, ${threadId}, ${state.revision}, ${content}, ${now}) ON CONFLICT(packet_id) DO NOTHING`;
          return content;
        }).pipe(Effect.mapError(unavailable)),
    });
  }),
);
