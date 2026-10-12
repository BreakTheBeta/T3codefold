/**
 * Fold-only settings. Spread into upstream's client and server settings schemas
 * and their patches in `settings.ts`, so upstream syncs touch a few lines there
 * instead of every field.
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { ThreadId, TrimmedString } from "./baseSchemas.ts";

/** Where the splatter backdrop shows: the themes that ship with it, or every theme. */
export const ThemeBackdropScope = Schema.Literals(["featured", "all"]);
export type ThemeBackdropScope = typeof ThemeBackdropScope.Type;

const HexColor = Schema.String.check(Schema.isPattern(/^#[0-9a-f]{6}$/i));

/** Lead, second and rare accent paint colours, overriding the theme-derived ones. */
export const ThemeBackdropColors = Schema.Tuple([HexColor, HexColor, HexColor]);
export type ThemeBackdropColors = typeof ThemeBackdropColors.Type;

export const MIN_THEME_BACKDROP_INTENSITY = 25;
export const MAX_THEME_BACKDROP_INTENSITY = 250;
/** Percent of the tuned default alpha. */
export const ThemeBackdropIntensity = Schema.Int.check(
  Schema.isBetween({
    minimum: MIN_THEME_BACKDROP_INTENSITY,
    maximum: MAX_THEME_BACKDROP_INTENSITY,
  }),
);
export type ThemeBackdropIntensity = typeof ThemeBackdropIntensity.Type;

export const MIN_THEME_BACKDROP_AMOUNT = 0;
export const MAX_THEME_BACKDROP_AMOUNT = 200;
/** Percent of the tuned default number of marks scattered across the canvas. */
export const ThemeBackdropAmount = Schema.Int.check(
  Schema.isBetween({ minimum: MIN_THEME_BACKDROP_AMOUNT, maximum: MAX_THEME_BACKDROP_AMOUNT }),
);
export type ThemeBackdropAmount = typeof ThemeBackdropAmount.Type;

export const MAX_THEME_BACKDROP_SEED = 999_999;
/** Splatter pattern variant; 0 is the original art. */
export const ThemeBackdropSeed = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: MAX_THEME_BACKDROP_SEED }),
);
export type ThemeBackdropSeed = typeof ThemeBackdropSeed.Type;

export const FoldClientSettingsFields = {
  /** Paint-splatter backdrop behind the conversation, on themes that ship one. */
  themeBackdropEnabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  themeBackdropScope: ThemeBackdropScope.pipe(
    Schema.withDecodingDefault(Effect.succeed("featured" as const)),
  ),
  /** Null follows the active theme's accent colours. */
  themeBackdropColors: Schema.NullOr(ThemeBackdropColors).pipe(
    Schema.withDecodingDefault(Effect.succeed(null)),
  ),
  themeBackdropIntensity: ThemeBackdropIntensity.pipe(
    Schema.withDecodingDefault(Effect.succeed(100)),
  ),
  themeBackdropAmount: ThemeBackdropAmount.pipe(Schema.withDecodingDefault(Effect.succeed(100))),
  themeBackdropGlow: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  /** Adds a splat in the project's colour for each PR merged since 6am local. */
  themeBackdropDynamic: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  themeBackdropSeed: ThemeBackdropSeed.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  citeSelectionEnabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(true))),
  vimModeEnabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  vimThreadPreviewEnabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
};

export const FoldClientSettingsPatchFields = {
  themeBackdropEnabled: Schema.optionalKey(Schema.Boolean),
  themeBackdropScope: Schema.optionalKey(ThemeBackdropScope),
  themeBackdropColors: Schema.optionalKey(Schema.NullOr(ThemeBackdropColors)),
  themeBackdropIntensity: Schema.optionalKey(ThemeBackdropIntensity),
  themeBackdropAmount: Schema.optionalKey(ThemeBackdropAmount),
  themeBackdropGlow: Schema.optionalKey(Schema.Boolean),
  themeBackdropDynamic: Schema.optionalKey(Schema.Boolean),
  themeBackdropSeed: Schema.optionalKey(ThemeBackdropSeed),
  citeSelectionEnabled: Schema.optionalKey(Schema.Boolean),
  vimModeEnabled: Schema.optionalKey(Schema.Boolean),
  vimThreadPreviewEnabled: Schema.optionalKey(Schema.Boolean),
};

export const FoldServerSettingsFields = {
  /**
   * The thread acting as GLaDOS, this environment's coordinator. Its turns lead with the
   * coordinator preamble; everything else about it is an ordinary thread.
   */
  gladosThreadId: Schema.NullOr(ThreadId).pipe(Schema.withDecodingDefault(Effect.succeed(null))),
  /** The user's standing instructions to GLaDOS: priorities, limits and what good work looks like. */
  gladosInstructions: TrimmedString.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
};

export const FoldServerSettingsPatchFields = {
  gladosThreadId: Schema.optionalKey(Schema.NullOr(ThreadId)),
  gladosInstructions: Schema.optionalKey(TrimmedString),
};
