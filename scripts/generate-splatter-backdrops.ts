/**
 * Bakes the splatter backdrop artwork for the themes that carry one into
 * static SVG files.
 *
 * The app never runs this: it renders four flat, gradient-only SVGs that the
 * web CSS and the mobile backdrop component load as-is. Splatter geometry is
 * tedious to hand-author and impossible to retune by hand, so the shapes are
 * grown from a seeded RNG here and committed as the real asset. Change a knob
 * in CLUSTERS or PALETTES, re-run, and commit the regenerated art.
 *
 *   node scripts/generate-splatter-backdrops.ts
 *   node scripts/generate-splatter-backdrops.ts --check   (CI: fail if stale)
 */
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { PNG } from "pngjs";

/** Web loads these from CSS; the mobile backdrop loads the same files from here. */
const MOBILE_DIRECTORY = "apps/mobile/assets/themes";
const OUTPUT_DIRECTORIES = ["apps/web/src/assets", MOBILE_DIRECTORY];

/* ---------------------------------------------------------------- color -- */

/** oklch -> sRGB hex, so the art stays tunable next to the theme's oklch palette. */
function oklchToHex(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channels = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return `#${channels
    .map((v) => {
      const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, srgb)) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

/* ------------------------------------------------------------------ rng -- */

type Random = {
  (): number;
  /** Roughly normal, for angles and sizes that should cluster around a value. */
  gauss: (mean: number, deviation: number) => number;
  range: (min: number, max: number) => number;
  /** Heavily biased toward `min`; the reason most droplets read as fine mist. */
  skewed: (min: number, max: number, power: number) => number;
};

function makeRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const random = next as Random;
  random.range = (min, max) => min + next() * (max - min);
  random.skewed = (min, max, power) => min + next() ** power * (max - min);
  random.gauss = (mean, deviation) =>
    mean + ((next() + next() + next() + next() - 2) / 2) * deviation * 2;
  return random;
}

/* -------------------------------------------------------------- shapes -- */

type Point = readonly [number, number];

const round = (n: number) => Math.round(n * 10) / 10;
/** Whole units, for the overspray: at these sizes the lost tenth is invisible
 *  and there are enough particles for the saved digits to matter. */
const coarse = (n: number) => Math.round(n);
const pt = (p: Point) => `${round(p[0])} ${round(p[1])}`;

/** Closed Catmull-Rom spline through the points, emitted as cubic Béziers. */
function closedSpline(points: ReadonlyArray<Point>): string {
  const at = (i: number) => points[((i % points.length) + points.length) % points.length]!;
  let d = `M${pt(at(0))}`;
  for (let i = 0; i < points.length; i += 1) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return `${d}Z`;
}

/**
 * An impact mass. The radius is summed sine harmonics rather than per-point
 * jitter: low harmonics carve the deep asymmetric bays that make a splat read
 * as paint, and high ones only ripple the edge. Stretching along `throw` keeps
 * every mass agreeing about which way the paint was travelling.
 */
function mass(
  cx: number,
  cy: number,
  radius: number,
  throwAngle: number,
  stretch: number,
  random: Random,
): string {
  const harmonics = [1, 2, 3, 5, 8, 13].map((frequency, index) => ({
    frequency,
    amplitude: [0.26, 0.19, 0.15, 0.11, 0.08, 0.05][index]! * random.range(0.5, 1.45),
    phase: random() * Math.PI * 2,
  }));
  const steps = Math.min(32, Math.max(14, Math.round(12 + radius * 0.5)));
  const points: Array<Point> = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    const wobble = harmonics.reduce(
      (sum, h) => sum + h.amplitude * Math.sin(h.frequency * angle + h.phase),
      0,
    );
    const elongation = 1 + stretch * Math.cos(angle - throwAngle) ** 2;
    const r = radius * Math.max(0.3, 1 + wobble) * elongation;
    points.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }
  return closedSpline(points);
}

/**
 * A ray of paint flicked off the mass: hair-thin, curved, tapering to nothing.
 * Width is a fraction of a percent of the cluster box, which is what separates
 * a flick from the triangular spike a naive taper produces.
 */
function ray(
  cx: number,
  cy: number,
  rimAngle: number,
  inner: number,
  length: number,
  width: number,
  random: Random,
): { path: string; tip: Point; width: number } {
  // Rays leave the rim on their own heading. Firing every ray straight out from
  // the centre lines them all up and the splat reads as a star, not as paint.
  const originX = cx + Math.cos(rimAngle) * inner;
  const originY = cy + Math.sin(rimAngle) * inner;
  const angle = rimAngle + random.gauss(0, 0.32);
  const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
  const [nx, ny] = [-dy, dx];
  const bend = random.gauss(0, length * 0.3);
  const along = (t: number, offset: number): Point => [
    originX + dx * (length * t) + nx * (bend * t * t + offset),
    originY + dy * (length * t) + ny * (bend * t * t + offset),
  ];
  const tip = along(1, 0);
  return {
    // Both flanks bow with the same bend, so the ray curves instead of fanning.
    path:
      `M${pt(along(0, width))}` +
      `Q${pt(along(0.55, width * 0.42))} ${pt(tip)}` +
      `Q${pt(along(0.55, -width * 0.42))} ${pt(along(0, -width))}Z`,
    tip,
    width,
  };
}

type Drop = { cx: number; cy: number; rx: number; ry: number; angle: number };

/** One throw of paint: mass, satellites, rays, and the mist that outran them. */
function splatter(cx: number, cy: number, radius: number, random: Random) {
  const throwAngle = random() * Math.PI * 2;
  const paths: Array<string> = [mass(cx, cy, radius, throwAngle, random.range(0.1, 0.32), random)];
  const drops: Array<Drop> = [];

  // A second mass inside the first. Fills in one group composite against each
  // other, so the overlap alone gives the splat a denser centre without a
  // separate opacity pass.
  paths.push(
    mass(
      cx + Math.cos(throwAngle) * radius * random.range(0.1, 0.34),
      cy + Math.sin(throwAngle) * radius * random.range(0.1, 0.34),
      radius * random.range(0.42, 0.66),
      throwAngle,
      random.range(0.1, 0.45),
      random,
    ),
  );

  // Satellite masses sit forward of the impact, the way a thrown blob breaks up.
  for (let i = 0; i < 2 + Math.floor(random() * 2); i += 1) {
    const angle = random.gauss(throwAngle, 0.8);
    const reach = radius * random.range(0.85, 2.1);
    paths.push(
      mass(
        cx + Math.cos(angle) * reach,
        cy + Math.sin(angle) * reach,
        radius * random.range(0.14, 0.36),
        angle,
        random.range(0.2, 0.7),
        random,
      ),
    );
  }

  for (let i = 0; i < 6 + Math.floor(random() * 6); i += 1) {
    // Most rays follow the throw; the occasional straggler goes anywhere, which
    // is what stops the result from reading as a radially symmetric burst.
    const angle = random() < 0.75 ? random.gauss(throwAngle, 0.9) : random() * Math.PI * 2;
    const flick = ray(
      cx,
      cy,
      angle,
      radius * random.range(0.6, 1.05),
      radius * random.skewed(0.5, 3.0, 2),
      radius * random.range(0.014, 0.05),
      random,
    );
    paths.push(flick.path);
    if (random() < 0.35) {
      const bead = flick.width * random.range(1.1, 2.2);
      drops.push({ cx: flick.tip[0], cy: flick.tip[1], rx: bead, ry: bead, angle: 0 });
    }
  }

  for (let i = 0; i < 95 + Math.floor(random() * 65); i += 1) {
    const angle = random() < 0.7 ? random.gauss(throwAngle, 1.15) : random() * Math.PI * 2;
    const reach = radius * random.skewed(1.0, 4.6, 1.5);
    const size = radius * random.skewed(0.006, 0.11, 2.8);
    drops.push({
      cx: cx + Math.cos(angle) * reach,
      cy: cy + Math.sin(angle) * reach,
      // Airborne paint stretches along its own flight path.
      rx: size * random.range(1.0, 1.9),
      ry: size,
      angle: (angle * 180) / Math.PI,
    });
  }

  // Atomized haze: the fine particles that drift well past the mist and never
  // resolve into shapes. Sized in absolute units rather than as a fraction of
  // the splat, so spray from a big throw is no coarser than from a small one --
  // which is what makes the whole cluster read as one sprayed surface.
  const haze: Array<Drop> = [];
  for (let i = 0; i < Math.round(radius * 1.7); i += 1) {
    const angle = random() < 0.62 ? random.gauss(throwAngle, 1.35) : random() * Math.PI * 2;
    const reach = radius * random.skewed(1.2, 7.5, 2.1);
    const size = random.skewed(0.3, 1.9, 2.5);
    haze.push({
      cx: cx + Math.cos(angle) * reach,
      cy: cy + Math.sin(angle) * reach,
      rx: size,
      ry: size,
      angle: 0,
    });
  }

  return { paths, drops, haze };
}

/* ------------------------------------------------------------- artwork -- */

/** Placement is in fractions of the cluster box, so a corner reads the same at any size. */
type Placement = { x: number; y: number; radius: number; hue: number; seed: number };

const SIZE = 600;

const CLUSTERS: Record<"a" | "b", ReadonlyArray<Placement>> = {
  a: [
    { x: 0.8, y: 0.14, radius: 42, hue: 0, seed: 0x5eed07 },
    { x: 0.52, y: 0.33, radius: 24, hue: 0, seed: 0x5eed02 },
    { x: 0.92, y: 0.52, radius: 17, hue: 1, seed: 0x5eed23 },
    { x: 0.63, y: 0.05, radius: 14, hue: 0, seed: 0x5eed61 },
    { x: 0.66, y: 0.66, radius: 11, hue: 0, seed: 0x5eed14 },
    { x: 0.21, y: 0.29, radius: 10, hue: 0, seed: 0x5eed62 },
    { x: 0.34, y: 0.62, radius: 8, hue: 0, seed: 0x5eed36 },
    { x: 0.87, y: 0.8, radius: 7, hue: 0, seed: 0x5eed63 },
    { x: 0.44, y: 0.47, radius: 6, hue: 1, seed: 0x5eed64 },
    { x: 0.58, y: 0.87, radius: 6, hue: 2, seed: 0x5eed05 },
    { x: 0.11, y: 0.71, radius: 5, hue: 0, seed: 0x5eed65 },
    { x: 0.75, y: 0.38, radius: 4, hue: 0, seed: 0x5eed66 },
  ],
  b: [
    { x: 0.22, y: 0.84, radius: 46, hue: 0, seed: 0x5eed31 },
    { x: 0.53, y: 0.63, radius: 23, hue: 0, seed: 0x5eed12 },
    { x: 0.07, y: 0.47, radius: 16, hue: 1, seed: 0x5eed43 },
    { x: 0.42, y: 0.95, radius: 14, hue: 0, seed: 0x5eed71 },
    { x: 0.78, y: 0.88, radius: 12, hue: 0, seed: 0x5eed24 },
    { x: 0.71, y: 0.44, radius: 10, hue: 0, seed: 0x5eed72 },
    { x: 0.33, y: 0.38, radius: 8, hue: 0, seed: 0x5eed56 },
    { x: 0.14, y: 0.16, radius: 7, hue: 0, seed: 0x5eed73 },
    { x: 0.88, y: 0.66, radius: 6, hue: 1, seed: 0x5eed74 },
    { x: 0.62, y: 0.3, radius: 6, hue: 2, seed: 0x5eed15 },
    { x: 0.37, y: 0.17, radius: 5, hue: 0, seed: 0x5eed75 },
    { x: 0.05, y: 0.68, radius: 4, hue: 0, seed: 0x5eed76 },
  ],
};

type Palette = {
  /** Green leads; cyan and magenta are accents kept deliberately small and rare. */
  hues: ReadonlyArray<string>;
  paint: number;
  glow: number;
  /** Overspray alpha as a fraction of `paint`. */
  haze: number;
};

type Appearance = "dark" | "light";

const PALETTES: Record<"cyberpunk" | "codex", Record<Appearance, Palette>> = {
  cyberpunk: {
    // Tracks the dark half's accent (oklch 0.82 0.24 145) and its action cyan.
    dark: {
      hues: [oklchToHex(0.88, 0.26, 145), oklchToHex(0.88, 0.16, 195), oklchToHex(0.76, 0.27, 335)],
      paint: 0.085,
      glow: 0.07,
      haze: 0.6,
    },
    // The light half is a pale mint sheet, so the same hues are darkened to read
    // as pigment on paper rather than washing out into the canvas.
    light: {
      hues: [oklchToHex(0.6, 0.2, 148), oklchToHex(0.62, 0.13, 198), oklchToHex(0.54, 0.21, 338)],
      paint: 0.105,
      glow: 0.062,
      haze: 0.55,
    },
  },
  // Codex's canvases are neutral -- pure white and a chroma-free near-black --
  // so there is no tinted ground for the paint to sit in and it has to carry
  // more alpha than Cyberpunk's to read at all. Hues follow the palette's teal
  // accent and cyan action, with blue-violet as the rare third.
  codex: {
    dark: {
      hues: [oklchToHex(0.84, 0.19, 162), oklchToHex(0.84, 0.14, 212), oklchToHex(0.72, 0.19, 282)],
      paint: 0.13,
      glow: 0.1,
      haze: 0.6,
    },
    light: {
      hues: [oklchToHex(0.56, 0.15, 166), oklchToHex(0.56, 0.13, 220), oklchToHex(0.5, 0.2, 286)],
      paint: 0.16,
      glow: 0.08,
      haze: 0.55,
    },
  },
};

function renderCluster(cluster: ReadonlyArray<Placement>, palette: Palette): string {
  const gradients: Array<string> = [];
  const glows: Array<string> = [];
  const paint: Array<string> = [];

  cluster.forEach((spec, index) => {
    const random = makeRandom(spec.seed);
    const cx = spec.x * SIZE;
    const cy = spec.y * SIZE;
    const color = palette.hues[spec.hue]!;
    const id = `g${index}`;

    // Bloom is a baked radial gradient, never a blur filter: SVG filters
    // re-rasterize expensively on mobile GPUs, a gradient stop does not.
    gradients.push(
      `<radialGradient id="${id}">` +
        `<stop offset="0" stop-color="${color}" stop-opacity="${palette.glow}"/>` +
        `<stop offset=".45" stop-color="${color}" stop-opacity="${round(palette.glow * 0.4)}"/>` +
        `<stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`,
    );
    glows.push(
      `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(spec.radius * 4.6)}" fill="url(#${id})"/>`,
    );

    const { paths, drops, haze } = splatter(cx, cy, spec.radius, random);
    // Its own group at a lower alpha: overspray that matched the paint would
    // read as a field of dots instead of as haze hanging behind the throw.
    paint.push(
      `<g fill="${color}" fill-opacity="${round(palette.paint * palette.haze)}">` +
        haze
          .map((d) => `<circle cx="${coarse(d.cx)}" cy="${coarse(d.cy)}" r="${round(d.rx)}"/>`)
          .join("") +
        `</g>`,
    );
    paint.push(
      `<g fill="${color}" fill-opacity="${palette.paint}">` +
        paths.map((d) => `<path d="${d}"/>`).join("") +
        drops
          .map((d) => {
            if (d.rx < 0.8) {
              return `<circle cx="${coarse(d.cx)}" cy="${coarse(d.cy)}" r="${round(d.ry)}"/>`;
            }
            const at = `cx="${round(d.cx)}" cy="${round(d.cy)}"`;
            if (Math.abs(d.rx - d.ry) < 0.05) return `<circle ${at} r="${round(d.rx)}"/>`;
            return (
              `<ellipse ${at} rx="${round(d.rx)}" ry="${round(d.ry)}" ` +
              `transform="rotate(${round(d.angle)} ${round(d.cx)} ${round(d.cy)})"/>`
            );
          })
          .join("") +
        `</g>`,
    );
  });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" fill="none">` +
    `<defs>${gradients.join("")}</defs>${glows.join("")}${paint.join("")}</svg>\n`
  );
}

/* --------------------------------------------------------------- grain -- */

/**
 * The grain tile mobile uses, as a PNG it can repeat natively.
 *
 * Web gets its grain from an feTurbulence data URI in index.css, which is the
 * pattern already established there and costs no request. React Native has no
 * equivalent -- SVG filter support across the two platform decoders is not
 * something to rely on -- so the same texture ships as pixels and renders
 * through RN's `resizeMode="repeat"`. Alpha stays flat; the appearances differ
 * only in the opacity the component applies.
 */
const GRAIN_TILE = 128;

function renderGrainTile(): Buffer {
  const png = new PNG({ width: GRAIN_TILE, height: GRAIN_TILE });
  const random = makeRandom(0x6a1f);
  for (let i = 0; i < png.data.length; i += 4) {
    // Monochrome, so compositing it lightens and darkens the canvas without
    // dragging a hue across it.
    const value = Math.round(random.gauss(128, 56));
    png.data[i] = Math.min(255, Math.max(0, value));
    png.data[i + 1] = png.data[i]!;
    png.data[i + 2] = png.data[i]!;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png, { colorType: 0 });
}

/* ----------------------------------------------------------------- run -- */

type Output = { name: string; contents: string | Uint8Array; directories: ReadonlyArray<string> };

const renderAll = (): ReadonlyArray<Output> => [
  ...(["cyberpunk", "codex"] as const).flatMap((theme) =>
    (["dark", "light"] as const).flatMap((appearance) =>
      (["a", "b"] as const).map((cluster) => ({
        name: `${theme}-splatter-${appearance}-${cluster}.svg`,
        contents: renderCluster(CLUSTERS[cluster], PALETTES[theme][appearance]),
        directories: OUTPUT_DIRECTORIES,
      })),
    ),
  ),
  // Web builds its grain in CSS, so the tile is mobile's alone.
  { name: "canvas-grain.png", contents: renderGrainTile(), directories: [MOBILE_DIRECTORY] },
];

const generateSplatter = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repositoryRoot = path.resolve(import.meta.dirname, "..");
  const check = process.argv.includes("--check");
  let stale = false;

  for (const { name, contents, directories } of renderAll()) {
    const bytes =
      typeof contents === "string" ? new TextEncoder().encode(contents) : new Uint8Array(contents);
    for (const directory of directories) {
      const file = path.join(repositoryRoot, directory, name);
      if (!check) {
        yield* fs.writeFile(file, bytes);
        yield* Console.log(`wrote ${directory}/${name} (${(bytes.length / 1024).toFixed(1)} kB)`);
        continue;
      }
      const current = yield* fs.readFile(file).pipe(Effect.orElseSucceed(() => null));
      if (
        current !== null &&
        current.length === bytes.length &&
        current.every((b, i) => b === bytes[i])
      ) {
        continue;
      }
      stale = true;
      yield* Console.error(`stale: ${directory}/${name}`);
    }
  }

  if (check && stale) {
    yield* Console.error(
      "Run `node scripts/generate-splatter-backdrops.ts` and commit the result.",
    );
    process.exitCode = 1;
  }
});

if (import.meta.main) {
  generateSplatter.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
}
