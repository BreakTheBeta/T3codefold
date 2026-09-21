import {
  deriveSplatterColors,
  fitOklchToGamut,
  hexToOklch,
  oklchToHex,
  parseOklch,
} from "@t3tools/shared/splatterBackdrop";

import { DEFAULT_MOBILE_THEME_ID, getMobileThemeColors, type MobileThemeId } from "./mobileTheme";

/** The three paint colours a theme gets when the user has not picked their own. */
export function themeSplatterColors(
  themeId: MobileThemeId,
  appearance: "light" | "dark",
): readonly [string, string, string] {
  // Material You has no fixed palette of its own to derive from.
  const colors = getMobileThemeColors(
    themeId === "material-you" ? DEFAULT_MOBILE_THEME_ID : themeId,
    appearance,
  );
  return deriveSplatterColors(
    parseOklch(colors.accent),
    parseOklch(colors.messageAction),
    appearance,
  );
}

/**
 * Mobile picks custom paint by hue alone, at a lightness and chroma that read
 * as neon on either canvas. Hue is the dimension that distinguishes one paint
 * from another; a full picker would mostly offer ways to make it invisible.
 */
export const splatterHueToHex = (hue: number) =>
  oklchToHex(fitOklchToGamut({ l: 0.74, c: 0.19, h: hue }));

/** Nearest slider hue for a stored colour, including ones picked on web. */
export const splatterHexToHue = (hex: string) =>
  (Math.round((hexToOklch(hex)?.h ?? 0) / 5) * 5) % 360;
