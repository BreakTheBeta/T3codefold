import {
  mergeDayStart,
  mergeSplats,
  rememberMerges,
  type MergedPullRequest,
} from "@t3tools/shared/mergeSplatters";
import {
  renderMergeSplatters,
  renderSplatterCluster,
  renderSplatterField,
  splatterLayout,
  type SplatterRenderOptions,
} from "@t3tools/shared/splatterBackdrop";
import { Image } from "expo-image";
import { memo, useEffect, useMemo, useState } from "react";
import { Image as RNImage, useWindowDimensions } from "react-native";

import { themeSplatterColors } from "../../lib/splatterColors";
import { useProjects, useThreadShells } from "../../state/entities";
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
    themeBackdropAmount,
    themeBackdropGlow,
    themeBackdropDynamic,
    themeBackdropSeed,
    themeBackdropColors,
  } = useAppearancePreferences();
  const { width, height } = useWindowDimensions();
  const appearance = themeAppearance === "dark" ? "dark" : "light";
  const shown =
    themeBackdropEnabled && (themeBackdropScope === "all" || FEATURED_THEME_IDS.has(themeId));

  const options = useMemo((): SplatterRenderOptions | null => {
    if (!shown) return null;
    return {
      colors: themeBackdropColors ?? themeSplatterColors(themeId, appearance),
      appearance,
      intensity: themeBackdropIntensity / 100,
      amount: themeBackdropAmount / 100,
      glow: themeBackdropGlow,
      seed: themeBackdropSeed,
    };
  }, [
    shown,
    themeId,
    appearance,
    themeBackdropIntensity,
    themeBackdropAmount,
    themeBackdropGlow,
    themeBackdropSeed,
    themeBackdropColors,
  ]);
  const sources = useMemo(
    () =>
      options && {
        a: { uri: svgUri(renderSplatterCluster("a", options)) },
        b: { uri: svgUri(renderSplatterCluster("b", options)) },
        field: { uri: svgUri(renderSplatterField(options)) },
      },
    [options],
  );

  if (!options || !sources) return null;
  const layout = splatterLayout(width, height, true);

  return (
    <>
      <Image
        source={sources.field}
        style={{ position: "absolute", top: 0, left: 0, width, height }}
        contentFit="cover"
      />
      {themeBackdropDynamic ? (
        <MergeSplatters options={options} width={width} height={height} />
      ) : null}
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

/**
 * The day's merges, kept for the life of the app process: a PR's thread is
 * often archived right after it merges and leaves the thread list, and the
 * splat should outlive that. Web persists the same list in local storage.
 */
let rememberedMerges: ReadonlyArray<MergedPullRequest> = [];

/** Dynamic mode: a splat per PR merged since 6am, in its project's colour. */
const MergeSplatters = memo(function MergeSplatters({
  options,
  width,
  height,
}: {
  readonly options: SplatterRenderOptions;
  readonly width: number;
  readonly height: number;
}) {
  const threads = useThreadShells();
  const projects = useProjects();
  const [since, setSince] = useState(() => mergeDayStart(new Date()).getTime());
  const [merges, setMerges] = useState(rememberedMerges);
  // Wake at the next rollover rather than polling a clock.
  useEffect(() => {
    const timer = setTimeout(
      () => setSince(mergeDayStart(new Date()).getTime()),
      since + 24 * 60 * 60 * 1000 - Date.now(),
    );
    return () => clearTimeout(timer);
  }, [since]);

  useEffect(() => {
    const next = rememberMerges(rememberedMerges, threads, projects, new Date(since));
    if (next === rememberedMerges) return;
    rememberedMerges = next;
    setMerges(next);
  }, [threads, projects, since]);

  const source = useMemo(
    () =>
      merges.length === 0
        ? null
        : {
            uri: svgUri(
              renderMergeSplatters(mergeSplats(merges, options.appearance), options, true),
            ),
          },
    [merges, options],
  );

  if (!source) return null;
  return (
    <Image
      source={source}
      style={{ position: "absolute", top: 0, left: 0, width, height }}
      contentFit="cover"
    />
  );
});
