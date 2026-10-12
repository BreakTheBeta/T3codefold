import * as Schema from "effect/Schema";

export const GamingHudPosition = Schema.Literals([
  "top-right",
  "top-left",
  "bottom-right",
  "bottom-left",
]);
export const GamingHudState = Schema.Struct({
  enabled: Schema.Boolean,
  position: GamingHudPosition,
  environments: Schema.Array(
    Schema.Struct({
      label: Schema.String,
      connected: Schema.Boolean,
      running: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      waiting: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      attentionCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      attention: Schema.Array(Schema.Struct({ title: Schema.String, reason: Schema.String })),
    }),
  ),
});
export type GamingHudState = typeof GamingHudState.Type;
