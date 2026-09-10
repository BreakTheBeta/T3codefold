import * as Schema from "effect/Schema";
import { EnvironmentId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
const Id = TrimmedNonEmptyString.check(Schema.isMaxLength(200));
export const PitbossCoordinationProposal = Schema.Struct({
  id: Id,
  scope: Id,
  coordinator: EnvironmentId,
  participants: Schema.Tuple([EnvironmentId, EnvironmentId]),
});
export const PitbossCoordinationView = Schema.Struct({
  proposals: Schema.Array(PitbossCoordinationProposal).check(Schema.isMaxLength(100)),
  approvals: Schema.Record(Schema.String, Schema.String),
  rejections: Schema.optional(
    Schema.Record(Schema.String, Schema.Array(Id).check(Schema.isMaxLength(100))),
  ),
  versions: Schema.Record(Schema.String, Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
});
export const PitbossPeerConfig = Schema.Struct({
  id: Id,
  environmentId: EnvironmentId,
  url: Schema.String,
  scope: Id,
  enabled: Schema.Boolean,
});
export type PitbossPeerConfig = typeof PitbossPeerConfig.Type;
export const PitbossPeerMessage = Schema.Struct({
  id: Id,
  text: TrimmedNonEmptyString.check(Schema.isMaxLength(12000)),
  originThreadId: ThreadId,
  replyTo: Schema.optional(Id),
  createdAt: Schema.String,
});
export type PitbossPeerMessage = typeof PitbossPeerMessage.Type;
export const PitbossPeerState = Schema.Struct({
  config: PitbossPeerConfig,
  view: PitbossCoordinationView,
  pendingMessages: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  lastSeenAt: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
});
export const PitbossPeerList = Schema.Struct({
  environmentId: EnvironmentId,
  peers: Schema.Array(PitbossPeerState),
});
export type PitbossPeerList = typeof PitbossPeerList.Type;
export const PitbossPeerCommand = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("configure"),
    config: PitbossPeerConfig,
    secret: Schema.optional(Schema.String.check(Schema.isMinLength(32))),
  }),
  Schema.Struct({
    type: Schema.Literal("propose"),
    peerId: Id,
    proposal: PitbossCoordinationProposal,
  }),
  Schema.Struct({ type: Schema.Literal("approve"), peerId: Id, proposalId: Id }),
  Schema.Struct({ type: Schema.Literal("decline"), peerId: Id, proposalId: Id }),
  Schema.Struct({ type: Schema.Literal("sync"), peerId: Id }),
]);
export type PitbossPeerCommand = typeof PitbossPeerCommand.Type;
export const PitbossPeerEnvelope = Schema.Struct({
  environmentId: EnvironmentId,
  scope: Id,
  view: PitbossCoordinationView,
  messages: Schema.optional(Schema.Array(PitbossPeerMessage).check(Schema.isMaxLength(20))),
  receipts: Schema.optional(Schema.Array(Id).check(Schema.isMaxLength(100))),
});
export type PitbossPeerEnvelope = typeof PitbossPeerEnvelope.Type;
export { PitbossSourceAuthority } from "./pitbossAuthority.ts";
