/**
 * The splatter backdrop behind the chat canvas, rendered from theme colours.
 *
 * Geometry is grown once from a seeded RNG and cached as colourless markup;
 * colour, intensity and glow are applied at render time by wrapping that
 * markup in <use> references. Re-rendering for a new theme or a settings drag
 * is therefore string assembly, not geometry, and the same art renders
 * identically on web and mobile.
 *
 * Bloom and glow are baked radial gradients and stroke halos, never SVG
 * filters: filters re-rasterize expensively on mobile GPUs, and not every
 * platform SVG decoder supports them.
 */

export type SplatterAppearance = "light" | "dark";
export type SplatterOklch = { readonly l: number; readonly c: number; readonly h: number };

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

/* -------------------------------------------------------------- colour -- */

function oklchToLinearRgb({ l, c, h }: SplatterOklch): [number, number, number] {
  const hue = (h * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

/**
 * The most saturated in-gamut colour at this lightness and hue. Clamping an
 * out-of-gamut colour's channels instead would bend its hue, which a hue
 * picker notices as its value jumping on the next read.
 */
export function fitOklchToGamut(color: SplatterOklch): SplatterOklch {
  const inGamut = (c: number) =>
    oklchToLinearRgb({ ...color, c }).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  if (inGamut(color.c)) return color;
  let low = 0;
  let high = color.c;
  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    if (inGamut(mid)) low = mid;
    else high = mid;
  }
  return { ...color, c: low };
}

export function oklchToHex(color: SplatterOklch): string {
  const channels = oklchToLinearRgb(color);
  return `#${channels
    .map((v) => {
      const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, srgb)) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

/** Inverse of oklchToHex, for starting a hue picker from a stored colour. */
export function hexToOklch(hex: string): SplatterOklch | null {
  if (!isSplatterHexColor(hex)) return null;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const l = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const h = (Math.atan2(bb, a) * 180) / Math.PI;
  return { l, c: Math.hypot(a, bb), h: h < 0 ? h + 360 : h };
}

/** Reads the canonical `oklch(L C H)` form theme palettes are stored in. */
export function parseOklch(value: string | null | undefined): SplatterOklch | null {
  const match = value?.trim().match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/i);
  if (!match) return null;
  const l = Number(match[1]) / (match[2] ? 100 : 1);
  const c = Number(match[3]);
  const h = Number(match[4]);
  return [l, c, h].every(Number.isFinite) ? { l, c, h } : null;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
export const isSplatterHexColor = (value: unknown): value is string =>
  typeof value === "string" && HEX_COLOR.test(value);

const hueGap = (a: number, b: number) => {
  const gap = Math.abs(a - b) % 360;
  return gap > 180 ? 360 - gap : gap;
};

/**
 * Three paint colours from a theme's accent and action colours.
 *
 * The accent leads. The action colour is second when it is a distinct hue,
 * otherwise a neighbour of the accent stands in. The third, used sparingly, is
 * the accent's near-complement, which is what gives Cyberpunk its magenta.
 * Lightness and chroma are then pulled to values that read as paint on that
 * appearance's canvas, so a muted theme still gets visible splatter. A
 * near-grey accent stays grey: a monochrome theme gets monochrome paint.
 */
export function deriveSplatterColors(
  accent: SplatterOklch | null,
  action: SplatterOklch | null,
  appearance: SplatterAppearance,
): readonly [string, string, string] {
  const lead = accent ?? { l: 0.7, c: 0.18, h: 330 };
  const second = action && hueGap(action.h, lead.h) > 20 ? action : { ...lead, h: lead.h + 45 };
  const third = { ...lead, h: (lead.h + 190) % 360 };
  const achromatic = lead.c < 0.03;
  const tune = (color: SplatterOklch): string =>
    oklchToHex({
      l: appearance === "dark" ? 0.86 : 0.58,
      c: achromatic
        ? 0
        : Math.min(appearance === "dark" ? 0.27 : 0.2, Math.max(0.13, color.c * 1.1)),
      h: color.h,
    });
  return [tune(lead), tune(second), tune(third)];
}

/* -------------------------------------------------------------- render -- */

export interface SplatterRenderOptions {
  /** Hex paint colours: lead, second, rare accent. */
  readonly colors: readonly [string, string, string];
  readonly appearance: SplatterAppearance;
  /** Multiplier on every alpha; 1 is the tuned default. */
  readonly intensity: number;
  /** Neon mode: stronger bloom and a stroke halo around every mark. */
  readonly glow: boolean;
  /** Pattern variant; 0 is the original art. */
  readonly seed: number;
}

const BASE_ALPHA = {
  dark: { paint: 0.11, glow: 0.08, haze: 0.6 },
  light: { paint: 0.14, glow: 0.07, haze: 0.55 },
} as const;

type SplatMarkup = {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly hue: number;
  readonly marks: string;
  readonly haze: string;
};

/** Colourless field markup, one entry per paint colour. */
type FieldMarkup = {
  readonly marks: readonly [string, string, string];
  readonly haze: readonly [string, string, string];
};

/** Enough for the live seed's three layers plus the seed being dragged to. */
const MARKUP_CACHE_LIMIT = 8;
const markupCache = new Map<string, unknown>();

/** Grows markup on first use and reuses it after; geometry never depends on colour. */
function cachedMarkup<T>(key: string, grow: () => T): T {
  if (markupCache.has(key)) return markupCache.get(key) as T;
  const markup = grow();
  // Oldest out first: a Map iterates in insertion order.
  if (markupCache.size >= MARKUP_CACHE_LIMIT) markupCache.delete(markupCache.keys().next().value!);
  markupCache.set(key, markup);
  return markup;
}

/**
 * Where a splat lands for a given user seed. Seed 0 is the original art,
 * untouched. Any other seed moves each splat a little and rescales it, but
 * only a little: far enough that the pattern reads as new, near enough that
 * the corner clusters keep the centre column clear on every seed.
 */
function placementFor(spec: Placement, seed: number): Placement {
  if (seed === 0) return spec;
  const random = makeRandom(Math.imul(spec.seed, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca6b));
  return {
    x: Math.min(0.95, Math.max(0.05, spec.x + (random() - 0.5) * 0.16)),
    y: Math.min(0.95, Math.max(0.05, spec.y + (random() - 0.5) * 0.16)),
    radius: spec.radius * (0.8 + random() * 0.4),
    hue: spec.hue,
    seed: (spec.seed ^ Math.imul(seed, 0x27d4eb2f)) >>> 0,
  };
}

const hazeMarkup = (d: Drop) =>
  `<circle cx="${coarse(d.cx)}" cy="${coarse(d.cy)}" r="${round(d.rx)}"/>`;

function dropMarkup(d: Drop): string {
  if (d.rx < 0.8) return `<circle cx="${coarse(d.cx)}" cy="${coarse(d.cy)}" r="${round(d.ry)}"/>`;
  const at = `cx="${round(d.cx)}" cy="${round(d.cy)}"`;
  if (Math.abs(d.rx - d.ry) < 0.05) return `<circle ${at} r="${round(d.rx)}"/>`;
  return (
    `<ellipse ${at} rx="${round(d.rx)}" ry="${round(d.ry)}" ` +
    `transform="rotate(${round(d.angle)} ${round(d.cx)} ${round(d.cy)})"/>`
  );
}

/** Colourless markup for one cluster and seed. */
function clusterMarkup(cluster: "a" | "b", seed: number): ReadonlyArray<SplatMarkup> {
  return cachedMarkup(`${cluster}:${seed}`, () =>
    CLUSTERS[cluster].map((base) => {
      const spec = placementFor(base, seed);
      const cx = spec.x * SIZE;
      const cy = spec.y * SIZE;
      const { paths, drops, haze } = splatter(cx, cy, spec.radius, makeRandom(spec.seed));
      return {
        x: cx,
        y: cy,
        radius: spec.radius,
        hue: spec.hue,
        haze: haze.map(hazeMarkup).join(""),
        marks: paths.map((d) => `<path d="${d}"/>`).join("") + drops.map(dropMarkup).join(""),
      };
    }),
  );
}

/**
 * The field's frame. It is painted with `cover`, so a screen of any shape
 * crops it rather than stretching it, and it grows with the screen: a 4K
 * canvas gets the same composition as a laptop, not a laptop's worth of paint
 * marooned in two corners.
 */
const FIELD_WIDTH = 1600;
const FIELD_HEIGHT = 1000;

/** Mostly the lead paint, some second, a rare accent, like the clusters. */
const pickHue = (random: Random) => {
  const roll = random();
  return roll < 0.62 ? 0 : roll < 0.9 ? 1 : 2;
};

/**
 * Paint flung across the whole canvas, between the two corner clusters:
 * small throws, bursts of spray, and a loose mist over all of it.
 * It is sparser than the clusters and thins through the centre column, so it
 * reads as the same canvas worked over rather than a pattern behind the text.
 */
function fieldMarkup(seed: number): FieldMarkup {
  return cachedMarkup(`field:${seed}`, () => {
    const random = makeRandom((0x5eed_f1e1 ^ Math.imul(seed, 0x9e3779b1)) >>> 0);
    const marks: [Array<string>, Array<string>, Array<string>] = [[], [], []];
    const haze: [Array<string>, Array<string>, Array<string>] = [[], [], []];
    const central = (x: number) => Math.abs(x / FIELD_WIDTH - 0.5) < 0.2;

    // Small throws, stratified over a grid so they spread instead of clumping.
    const [columns, rows] = [6, 4];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (random() < 0.35) continue;
        const x = ((column + random.range(0.1, 0.9)) / columns) * FIELD_WIDTH;
        const y = ((row + random.range(0.1, 0.9)) / rows) * FIELD_HEIGHT;
        if (central(x) && random() < 0.65) continue;
        const hue = pickHue(random);
        const splat = splatter(x, y, random.skewed(2, 18, 2.8), random);
        marks[hue].push(
          ...splat.paths.map((d) => `<path d="${d}"/>`),
          ...splat.drops.map(dropMarkup),
        );
        haze[hue].push(...splat.haze.map(hazeMarkup));
      }
    }

    // Spray bursts: a fan of specks flung from one point, dense where the
    // paint left the brush and thinning out toward the edge of the cone. Specks
    // are scattered, never strung along a path, so a burst reads as spray
    // rather than a dotted line.
    for (let i = 0; i < 20; i += 1) {
      const hue = pickHue(random);
      const [originX, originY] = [random() * FIELD_WIDTH, random() * FIELD_HEIGHT];
      if (central(originX) && random() < 0.5) continue;
      const heading = random() * Math.PI * 2;
      const spread = random.range(0.35, 1.1);
      const reach = random.range(90, 320);
      const weight = random.range(0.7, 1.8);
      const count = Math.round(reach * random.range(1, 1.6));
      for (let j = 0; j < count; j += 1) {
        const angle = random.gauss(heading, spread);
        // Most paint lands near the origin; a long tail carries the fine mist.
        const distance = reach * random.skewed(0.05, 1, 1.6);
        const fade = 1 - (distance / reach) * 0.7;
        const x = originX + Math.cos(angle) * distance;
        const y = originY + Math.sin(angle) * distance;
        const size = weight * fade * random.skewed(0.25, 2.2, 2.6);
        const speck: Drop = {
          cx: x,
          cy: y,
          // Only the heavier specks stretch along their flight.
          rx: size > 1.2 ? size * random.range(1, 1.8) : size,
          ry: size,
          angle: (angle * 180) / Math.PI,
        };
        // Anything smaller disappears at haze alpha; skip it rather than ship it.
        if (size < 0.4) continue;
        if (size > 0.9) marks[hue].push(dropMarkup(speck));
        else haze[hue].push(hazeMarkup(speck));
      }
    }

    // Loose spray over everything; the larger specks take full paint.
    for (let i = 0; i < 1000; i += 1) {
      const x = random() * FIELD_WIDTH;
      if (central(x) && random() < 0.4) continue;
      const speck: Drop = {
        cx: x,
        cy: random() * FIELD_HEIGHT,
        rx: random.skewed(0.5, 2.8, 3),
        ry: 0,
        angle: 0,
      };
      speck.ry = speck.rx;
      (speck.rx > 1.3 ? marks : haze)[pickHue(random)].push(hazeMarkup(speck));
    }

    return {
      marks: [marks[0].join(""), marks[1].join(""), marks[2].join("")],
      haze: [haze[0].join(""), haze[1].join(""), haze[2].join("")],
    };
  });
}

/* ------------------------------------------------------------ compose -- */

const alpha = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;

function alphas(options: SplatterRenderOptions) {
  const base = BASE_ALPHA[options.appearance];
  const intensity = Math.max(0, options.intensity);
  return {
    paint: alpha(base.paint * intensity),
    haze: alpha(base.paint * base.haze * intensity),
    bloom: alpha(base.glow * intensity * (options.glow ? 2.4 : 1)),
  };
}

type Layers = { readonly defs: string; readonly body: string };

/**
 * Paint for one group of marks: its haze, the glow halos in neon mode, then
 * the marks themselves, reusing `#id` by reference.
 */
function paintLayers(
  id: string,
  color: string,
  haze: string,
  options: SplatterRenderOptions,
): string {
  const { paint, haze: hazeAlpha } = alphas(options);
  let layers = haze ? `<g fill="${color}" fill-opacity="${hazeAlpha}">${haze}</g>` : "";
  if (options.glow) {
    // Two soft rings under the paint stand in for a blur: a wide faint one
    // and a tighter brighter one.
    for (const [width, strength] of [
      [6, 0.35],
      [2.6, 0.7],
    ] as const) {
      layers +=
        `<use xlink:href="#${id}" fill="none" stroke="${color}" ` +
        `stroke-width="${width}" stroke-linejoin="round" stroke-opacity="${alpha(paint * strength)}"/>`;
    }
  }
  return `${layers}<use xlink:href="#${id}" fill="${color}" fill-opacity="${paint}"/>`;
}

/** `prefix` keeps ids unique when several layers share one document. */
function clusterLayers(cluster: "a" | "b", options: SplatterRenderOptions, prefix = ""): Layers {
  const { bloom } = alphas(options);
  const defs: Array<string> = [];
  const glows: Array<string> = [];
  const layers: Array<string> = [];
  clusterMarkup(cluster, options.seed).forEach((splat, index) => {
    const color = options.colors[splat.hue] ?? options.colors[0];
    const [gradient, marks] = [`${prefix}g${index}`, `${prefix}m${index}`];
    defs.push(
      `<radialGradient id="${gradient}">` +
        `<stop offset="0" stop-color="${color}" stop-opacity="${bloom}"/>` +
        `<stop offset=".45" stop-color="${color}" stop-opacity="${alpha(bloom * 0.4)}"/>` +
        `<stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`,
      `<g id="${marks}">${splat.marks}</g>`,
    );
    glows.push(
      `<circle cx="${round(splat.x)}" cy="${round(splat.y)}" ` +
        `r="${round(splat.radius * (options.glow ? 5.6 : 4.6))}" fill="url(#${gradient})"/>`,
    );
    layers.push(paintLayers(marks, color, splat.haze, options));
  });
  return { defs: defs.join(""), body: glows.join("") + layers.join("") };
}

function fieldLayers(options: SplatterRenderOptions, prefix = ""): Layers {
  const field = fieldMarkup(options.seed);
  let defs = "";
  let body = "";
  field.marks.forEach((marks, hue) => {
    const id = `${prefix}f${hue}`;
    defs += `<g id="${id}">${marks}</g>`;
    body += paintLayers(id, options.colors[hue] ?? options.colors[0], field.haze[hue]!, options);
  });
  return { defs, body };
}

const svgDocument = (width: number, height: number, content: string, attributes = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
  `viewBox="0 0 ${width} ${height}"${attributes} fill="none">${content}</svg>`;

/** One corner cluster, square, for anchoring in a corner of the canvas. */
export function renderSplatterCluster(cluster: "a" | "b", options: SplatterRenderOptions): string {
  const { defs, body } = clusterLayers(cluster, options);
  return svgDocument(SIZE, SIZE, `<defs>${defs}</defs>${body}`);
}

/** The whole-canvas field that sits under the clusters. Paint it with `cover`. */
export function renderSplatterField(options: SplatterRenderOptions): string {
  const { defs, body } = fieldLayers(options);
  return svgDocument(
    FIELD_WIDTH,
    FIELD_HEIGHT,
    `<defs>${defs}</defs>${body}`,
    ` preserveAspectRatio="xMidYMid slice"`,
  );
}

export type SplatterFrame = { readonly x: number; readonly y: number; readonly size: number };

/**
 * Where the two square clusters sit on a canvas of this size, in its own
 * units. Mirrors the [data-chat-canvas] rules in apps/web/src/index.css; keep
 * the two in step.
 *
 * Wide canvases anchor the clusters to the corners and size them by height as
 * well as width, so a 4K screen gets clusters in proportion instead of a
 * laptop-sized pair. Compact ones scale both up to stay legible, and lift the
 * lower one clear of the composer, which would otherwise bury its largest splat.
 */
export function splatterLayout(
  width: number,
  height: number,
  compact = width <= 640,
): { readonly a: SplatterFrame; readonly b: SplatterFrame } {
  if (compact) {
    const [a, b] = [width * 1.25, width * 1.3];
    return {
      a: { x: width - a, y: 0, size: a },
      b: { x: width * -0.18, y: height * 0.88 - b, size: b },
    };
  }
  const a = Math.min(width * 0.58, Math.max(720, height * 0.6));
  const b = Math.min(width * 0.66, Math.max(820, height * 0.68));
  return { a: { x: width - a, y: 0, size: a }, b: { x: 0, y: height - b, size: b } };
}

/**
 * The whole backdrop composed into one image the size of a canvas, for
 * previewing a pattern without painting it onto the app.
 */
export function renderSplatterPreview(
  options: SplatterRenderOptions,
  width: number,
  height: number,
  compact?: boolean,
): string {
  const layout = splatterLayout(width, height, compact);
  const field = fieldLayers(options, "f");
  const a = clusterLayers("a", options, "a");
  const b = clusterLayers("b", options, "b");
  const frame = ({ x, y, size }: SplatterFrame, body: string) =>
    `<svg x="${round(x)}" y="${round(y)}" width="${round(size)}" height="${round(size)}" ` +
    `viewBox="0 0 ${SIZE} ${SIZE}">${body}</svg>`;
  return svgDocument(
    width,
    height,
    `<defs>${field.defs}${a.defs}${b.defs}</defs>` +
      `<svg width="${width}" height="${height}" viewBox="0 0 ${FIELD_WIDTH} ${FIELD_HEIGHT}" ` +
      `preserveAspectRatio="xMidYMid slice">${field.body}</svg>` +
      frame(layout.b, b.body) +
      frame(layout.a, a.body),
  );
}
