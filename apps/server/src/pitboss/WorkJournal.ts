import { recordVerification } from "./Verification.ts";
import {
  EnvironmentId,
  PitbossVerification,
  PitbossMessage,
  PitbossAttempt,
  PitbossSourceAuthority,
  PitbossCommand,
  PitbossTask,
  ThreadId,
  type PitbossSnapshot,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { decide, emptyWork, observeAttempt } from "./Work.ts";

const Entry = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("verification"),
    taskId: Schema.String,
    run: PitbossVerification,
  }),
  Schema.Struct({ type: Schema.Literal("message"), message: PitbossMessage }),
  Schema.Struct({ type: Schema.Literal("authority"), authority: PitbossSourceAuthority }),
  Schema.Struct({
    type: Schema.Literal("command"),
    version: Schema.optional(Schema.Literal(2)),
    input: PitbossCommand,
    actor: Schema.Union([
      Schema.Struct({ type: Schema.Literal("user") }),
      Schema.Struct({ type: Schema.Literal("agent"), threadId: ThreadId }),
      Schema.Struct({
        type: Schema.Literal("peer"),
        environmentId: EnvironmentId,
        scope: Schema.String,
        proposalId: Schema.String,
      }),
    ]),
    now: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("attempt"),
    taskId: Schema.String,
    attemptId: Schema.String,
    status: PitbossAttempt.fields.state,
    detail: Schema.String,
    workspacePath: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("source"),
    task: PitbossTask,
    message: Schema.optional(PitbossMessage),
  }),
]);
const decode = Schema.decodeUnknownSync(Schema.fromJsonString(Entry));
/** Rebuilds work state without reissuing any external effect. Outbox delivery is independent. */
export function replayJournal(entries: ReadonlyArray<string>): PitbossSnapshot {
  let state = emptyWork;
  for (const raw of entries) {
    const entry = decode(raw);
    if (entry.type === "command")
      state = decide(state, entry.input, entry.actor, entry.now, entry.version === undefined);
    else if (entry.type === "verification")
      state = recordVerification(state, entry.taskId, entry.run);
    else if (entry.type === "message")
      state = {
        ...state,
        revision: state.revision + 1,
        messages: [...state.messages, entry.message],
      };
    else if (entry.type === "attempt")
      state = observeAttempt(
        state,
        entry.taskId,
        entry.attemptId,
        entry.status,
        entry.detail,
        entry.workspacePath,
      );
    else if (entry.type === "authority")
      state = {
        ...state,
        revision: state.revision + 1,
        sourceAuthorities: [
          ...(state.sourceAuthorities ?? []).filter((item) => item.scope !== entry.authority.scope),
          entry.authority,
        ],
      };
    else
      state = {
        ...state,
        revision: state.revision + 1,
        messages: entry.message ? [...state.messages, entry.message] : state.messages,
        tasks: state.tasks.some((task) => task.id === entry.task.id)
          ? state.tasks.map((task) => (task.id === entry.task.id ? entry.task : task))
          : [...state.tasks, entry.task],
      };
  }
  return state;
}
