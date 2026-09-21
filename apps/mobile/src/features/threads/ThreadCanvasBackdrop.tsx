import {
  renderSplatterCluster,
  renderSplatterField,
  splatterLayout,
} from "@t3tools/shared/splatterBackdrop";
import { Image } from "expo-image";
import { memo, useMemo } from "react";
import { Image as RNImage, useWindowDimensions } from "react-native";

import { themeSplatterColors } from "../../lib/splatterColors";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";

/**
 * The splatter backdrop behind the thread canvas, rendered in the active
 * theme's colours by the same renderer the web app uses
 * (packages/shared/src/splatterBackdrop.ts).
 *
 * Handed to expo-image as a base64 SVG data URI rather than drawn through
 * react-native-svg: each cluster is around 600 vector nodes, and
 * react-native-svg would keep every one as a native shape it re-walks on
 * layout, while the platform SVG decoder rasterizes once and caches the
 * bitmap. The grain tile on top goes through React Native's own Image, the
 * only one of the two that can repeat a texture natively.
 *
 * Geometry is the compact branch of splatterLayout(), which the web rule in
 * apps/web/src/index.css mirrors: the field covering the canvas, two corner
 * clusters over it, the lower one lifted clear of the composer, then grain
 * over everything.
 */
const FEATURED_THEME_IDS: ReadonlySet<string> = new Set(["cyberpunk", "codex"]);

const GRAIN = require("../../../assets/themes/canvas-grain.png");

/** Matches the per-appearance grain alpha the web canvas uses. */
const GRAIN_OPACITY = { dark: 0.12, light: 0.07 } as const;

/**
 * Base64, never percent-encoding: expo-image's Android loader base64-decodes
 * everything after the comma whatever the URI declares, so a percent-encoded
 * SVG decodes to garbage and renders nothing. The markup is ASCII, which
 * btoa requires.
 */
const svgUri = (svg: string) => `data:image/svg+xml;base64,${btoa(svg)}`;

export const ThreadCanvasBackdrop = memo(function ThreadCanvasBackdrop() {
  const {
    themeId,
    themeAppearance,
    themeBackdropEnabled,
    themeBackdropScope,
    themeBackdropIntensity,
    themeBackdropGlow,
    themeBackdropSeed,
    themeBackdropColors,
  } = useAppearancePreferences();
  const { width, height } = useWindowDimensions();
  const appearance = themeAppearance === "dark" ? "dark" : "light";
  const shown =
    themeBackdropEnabled && (themeBackdropScope === "all" || FEATURED_THEME_IDS.has(themeId));

  const sources = useMemo(() => {
    if (!shown) return null;
    const options = {
      colors: themeBackdropColors ?? themeSplatterColors(themeId, appearance),
      appearance,
      intensity: themeBackdropIntensity / 100,
      glow: themeBackdropGlow,
      seed: themeBackdropSeed,
    } as const;
    return {
      a: { uri: svgUri(renderSplatterCluster("a", options)) },
      b: { uri: svgUri(renderSplatterCluster("b", options)) },
      field: { uri: svgUri(renderSplatterField(options)) },
    };
  }, [
    shown,
    themeId,
    appearance,
    themeBackdropIntensity,
    themeBackdropGlow,
    themeBackdropSeed,
    themeBackdropColors,
  ]);

  if (!sources) return null;
  const layout = splatterLayout(width, height, true);

  return (
    <>
      <Image
        source={sources.field}
        style={{ position: "absolute", top: 0, left: 0, width, height }}
        contentFit="cover"
      />
      {(["b", "a"] as const).map((cluster) => (
        <Image
          key={cluster}
          source={sources[cluster]}
          style={{
            position: "absolute",
            left: layout[cluster].x,
            top: layout[cluster].y,
            width: layout[cluster].size,
            height: layout[cluster].size,
          }}
          contentFit="contain"
        />
      ))}
      <RNImage
        source={GRAIN}
        resizeMode="repeat"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width,
          height,
          opacity: GRAIN_OPACITY[appearance],
        }}
      />
    </>
  );
});
