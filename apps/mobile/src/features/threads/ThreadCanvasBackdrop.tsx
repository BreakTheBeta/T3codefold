import {
  deriveSplatterColors,
  parseOklch,
  renderSplatterCluster,
} from "@t3tools/shared/splatterBackdrop";
import { Image } from "expo-image";
import { memo, useMemo } from "react";
import { Image as RNImage, useWindowDimensions } from "react-native";

import { DEFAULT_MOBILE_THEME_ID, getMobileThemeColors } from "../../lib/mobileTheme";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";

/**
 * The splatter backdrop behind the thread canvas, rendered in the active
 * theme's colours by the same renderer the web app uses
 * (packages/shared/src/splatterBackdrop.ts).
 *
 * Handed to expo-image as an SVG data URI rather than drawn through
 * react-native-svg: each cluster is around 600 vector nodes, and
 * react-native-svg would keep every one as a native shape it re-walks on
 * layout, while the platform SVG decoder rasterizes once and caches the
 * bitmap. The grain tile on top goes through React Native's own Image, the
 * only one of the two that can repeat a texture natively.
 *
 * Mobile follows the theme's colours only; custom paint colours are a
 * web/desktop setting. Geometry mirrors the phone branch of the web rule in
 * apps/web/src/index.css: two corner clusters, the lower one lifted clear of
 * the composer, then grain over both. Keep the two in step.
 */
const FEATURED_THEME_IDS: ReadonlySet<string> = new Set(["cyberpunk", "codex"]);

const GRAIN = require("../../../assets/themes/canvas-grain.png");

/** Matches the per-appearance grain alpha the web canvas uses. */
const GRAIN_OPACITY = { dark: 0.12, light: 0.07 } as const;

/** Cluster width as a multiple of screen width; the art is square. */
const LEAD_SCALE = 1.25;
const TRAILING_SCALE = 1.3;
/** Keeps the trailing cluster's largest splat out from under the composer. */
const TRAILING_BOTTOM_FRACTION = 0.12;
const TRAILING_LEFT_FRACTION = -0.18;

const svgUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export const ThreadCanvasBackdrop = memo(function ThreadCanvasBackdrop() {
  const {
    themeId,
    themeAppearance,
    themeBackdropEnabled,
    themeBackdropScope,
    themeBackdropIntensity,
    themeBackdropGlow,
  } = useAppearancePreferences();
  const { width, height } = useWindowDimensions();
  const appearance = themeAppearance === "dark" ? "dark" : "light";
  const shown =
    themeBackdropEnabled && (themeBackdropScope === "all" || FEATURED_THEME_IDS.has(themeId));

  const sources = useMemo(() => {
    if (!shown) return null;
    // Material You has no fixed palette of its own to derive from.
    const colors = getMobileThemeColors(
      themeId === "material-you" ? DEFAULT_MOBILE_THEME_ID : themeId,
      appearance,
    );
    const options = {
      colors: deriveSplatterColors(
        parseOklch(colors.accent),
        parseOklch(colors.messageAction),
        appearance,
      ),
      appearance,
      intensity: themeBackdropIntensity / 100,
      glow: themeBackdropGlow,
    } as const;
    return {
      a: { uri: svgUri(renderSplatterCluster("a", options)) },
      b: { uri: svgUri(renderSplatterCluster("b", options)) },
    };
  }, [shown, themeId, appearance, themeBackdropIntensity, themeBackdropGlow]);

  if (!sources) return null;
  const lead = width * LEAD_SCALE;
  const trailing = width * TRAILING_SCALE;

  return (
    <>
      <Image
        source={sources.a}
        style={{ position: "absolute", top: 0, right: 0, width: lead, height: lead }}
        contentFit="contain"
      />
      <Image
        source={sources.b}
        style={{
          position: "absolute",
          left: width * TRAILING_LEFT_FRACTION,
          bottom: height * TRAILING_BOTTOM_FRACTION,
          width: trailing,
          height: trailing,
        }}
        contentFit="contain"
      />
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
