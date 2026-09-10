import * as Schema from "effect/Schema";
import { EnvironmentId, TrimmedNonEmptyString } from "./baseSchemas.ts";
const Id = TrimmedNonEmptyString.check(Schema.isMaxLength(200));
export const PitbossSourceAuthority = Schema.Struct({
  scope: Id,
  self: EnvironmentId,
  peerId: Schema.optional(Id),
  peerEnvironmentId: Schema.optional(EnvironmentId),
  coordinator: Schema.NullOr(EnvironmentId),
  homeEnvironmentId: Schema.optional(EnvironmentId),
  proposalId: Schema.optional(Id),
});
export type PitbossSourceAuthority = typeof PitbossSourceAuthority.Type;
