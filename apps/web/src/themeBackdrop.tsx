import type { ClientSettings } from "@t3tools/contracts";
import type { ThemeAppearance } from "@t3tools/shared/themePalettes";
import {
  deriveSplatterColors,
  parseOklch,
  renderSplatterCluster,
  renderSplatterField,
  type SplatterRenderOptions,
} from "@t3tools/shared/splatterBackdrop";
import { useLayoutEffect, useMemo } from "react";

import { useClientSettings } from "./hooks/useSettings";
import { useTheme } from "./hooks/useTheme";
import {
  getStandardThemeColors,
  getThemeColorsForMode,
  getThemeDefinition,
  resolveThemeHalf,
  toCanonicalThemeColor,
} from "./themePalette";

/** Themes that show the backdrop without the "every theme" scope. */
const FEATURED_THEME_IDS: ReadonlySet<string> = new Set(["cyberpunk", "codex"]);

type BackdropSettings = Pick<
  ClientSettings,
  | "themeBackdropEnabled"
  | "themeBackdropScope"
  | "themeBackdropColors"
  | "themeBackdropIntensity"
  | "themeBackdropGlow"
  | "themeBackdropSeed"
>;

const colorOf = (value: string | undefined) => parseOklch(toCanonicalThemeColor(value));

/**
 * What the canvas should paint for this theme and these settings, or null for
 * nothing. Theme colours come from the palette's accent and action roles, so
 * a custom or published theme gets matching paint with no art of its own.
 */
export function resolveThemeBackdrop(input: {
  readonly settings: BackdropSettings;
  readonly themeId: string | null;
  readonly accent: string | undefined;
  readonly action: string | undefined;
  readonly appearance: ThemeAppearance;
}): SplatterRenderOptions | null {
  const { settings, themeId, accent, action, appearance } = input;
  if (!settings.themeBackdropEnabled) return null;
  if (settings.themeBackdropScope !== "all" && !FEATURED_THEME_IDS.has(themeId ?? "")) {
    return null;
  }
  return {
    colors:
      settings.themeBackdropColors ??
      deriveSplatterColors(colorOf(accent), colorOf(action), appearance),
    appearance,
    intensity: settings.themeBackdropIntensity / 100,
    glow: settings.themeBackdropGlow,
    seed: settings.themeBackdropSeed,
  };
}

const BACKDROP_LAYERS = ["a", "b", "field"] as const;

const selectBackdropSettings = (settings: ClientSettings): BackdropSettings => settings;

/** The active theme's id and the two roles the paint colours derive from. */
function useActiveBackdropSource() {
  const { theme, themeHalves, resolvedTheme } = useTheme();
  const definition = getThemeDefinition(resolveThemeHalf(theme, themeHalves, resolvedTheme));
  const colors = definition
    ? (getThemeColorsForMode(definition, resolvedTheme) ?? definition.colors)
    : getStandardThemeColors(resolvedTheme);
  return {
    themeId: definition?.id ?? null,
    accent: colors.accent,
    action: colors.messageAction,
    appearance: resolvedTheme,
  };
}

/** Paint colours the active theme would get, for seeding the custom pickers. */
export function useThemeDerivedBackdropColors(): readonly [string, string, string] {
  const { accent, action, appearance } = useActiveBackdropSource();
  return useMemo(
    () => deriveSplatterColors(colorOf(accent), colorOf(action), appearance),
    [accent, action, appearance],
  );
}

/**
 * Renders the splatter for the active theme and hands it to index.css as
 * blob URLs on the root: two corner clusters and the field beneath them. Blob URLs rather than data URIs keep a ~100 kB SVG
 * out of every style recalculation that reads the custom property.
 */
export function ThemeBackdropSync() {
  const settings = useClientSettings(selectBackdropSettings);
  const { themeId, accent, action, appearance: resolvedTheme } = useActiveBackdropSource();

  const {
    themeBackdropEnabled,
    themeBackdropScope,
    themeBackdropColors,
    themeBackdropIntensity,
    themeBackdropGlow,
    themeBackdropSeed,
  } = settings;
  // Keyed on the colour strings rather than object identity: custom theme
  // definitions can be rebuilt per render, and every new result here means a
  // fresh blob URL and a re-rasterized backdrop.
  const [lead, second, third] = themeBackdropColors ?? [];
  const options = useMemo(
    () =>
      resolveThemeBackdrop({
        settings: {
          themeBackdropEnabled,
          themeBackdropScope,
          themeBackdropColors: lead && second && third ? [lead, second, third] : null,
          themeBackdropIntensity,
          themeBackdropGlow,
          themeBackdropSeed,
        },
        themeId,
        accent,
        action,
        appearance: resolvedTheme,
      }),
    [
      themeBackdropEnabled,
      themeBackdropScope,
      lead,
      second,
      third,
      themeBackdropIntensity,
      themeBackdropGlow,
      themeBackdropSeed,
      themeId,
      accent,
      action,
      resolvedTheme,
    ],
  );

  // Layout effect: the canvas mounts in the same commit, so the art is on it
  // before the first paint rather than popping in a frame later.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!options) {
      delete root.dataset.themeBackdrop;
      for (const layer of BACKDROP_LAYERS) root.style.removeProperty(`--backdrop-${layer}`);
      return;
    }
    const urls = BACKDROP_LAYERS.map((layer) => {
      const svg =
        layer === "field" ? renderSplatterField(options) : renderSplatterCluster(layer, options);
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      root.style.setProperty(`--backdrop-${layer}`, `url("${url}")`);
      return url;
    });
    root.dataset.themeBackdrop = "on";
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [options]);

  return null;
}
