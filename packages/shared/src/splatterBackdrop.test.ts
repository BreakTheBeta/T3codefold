import { describe, expect, it } from "vitest";

import {
  deriveSplatterColors,
  oklchToHex,
  parseOklch,
  renderSplatterCluster,
  type SplatterRenderOptions,
} from "./splatterBackdrop.ts";

const channels = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

const options: SplatterRenderOptions = {
  colors: ["#39ff88", "#29d9ff", "#ff3dcb"],
  appearance: "dark",
  intensity: 1,
  glow: false,
  seed: 0,
};

describe("parseOklch", () => {
  it("reads the canonical palette form, with or without a percent lightness", () => {
    expect(parseOklch("oklch(0.82038 0.239903 145.044)")).toEqual({
      l: 0.82038,
      c: 0.239903,
      h: 145.044,
    });
    expect(parseOklch("oklch(82% 0.2 145 / 0.5)")?.l).toBeCloseTo(0.82);
  });

  it("rejects anything that is not oklch", () => {
    expect(parseOklch("#ff0000")).toBeNull();
    expect(parseOklch(undefined)).toBeNull();
  });
});

describe("deriveSplatterColors", () => {
  it("keeps a distinct action hue and adds a near-complement third", () => {
    // Cyberpunk's dark half: green accent, cyan action.
    const [lead, second, third] = deriveSplatterColors(
      { l: 0.82, c: 0.24, h: 145 },
      { l: 0.85, c: 0.145, h: 195 },
      "dark",
    );
    const [lr, lg, lb] = channels(lead);
    expect(lg).toBeGreaterThan(lr);
    expect(lg).toBeGreaterThan(lb);
    const [, sg, sb] = channels(second);
    expect(sb).toBeGreaterThan(150);
    expect(sg).toBeGreaterThan(150);
    const [tr, tg] = channels(third);
    expect(tr).toBeGreaterThan(tg);
  });

  it("substitutes a neighbour when the action colour repeats the accent", () => {
    const [lead, second] = deriveSplatterColors(
      { l: 0.6, c: 0.2, h: 250 },
      { l: 0.6, c: 0.2, h: 255 },
      "light",
    );
    expect(second).not.toBe(lead);
  });

  it("gives a monochrome theme monochrome paint", () => {
    for (const color of deriveSplatterColors({ l: 0.5, c: 0.01, h: 90 }, null, "dark")) {
      const [r, g, b] = channels(color);
      expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!)).toBeLessThanOrEqual(1);
    }
  });

  it("pulls lightness to suit the canvas it paints on", () => {
    const [dark] = deriveSplatterColors({ l: 0.4, c: 0.2, h: 30 }, null, "dark");
    const [light] = deriveSplatterColors({ l: 0.4, c: 0.2, h: 30 }, null, "light");
    const sum = (hex: string) => channels(hex).reduce((a, b) => a + b, 0);
    expect(sum(dark)).toBeGreaterThan(sum(light));
  });
});

describe("renderSplatterCluster", () => {
  it("renders the same art for the same options", () => {
    expect(renderSplatterCluster("a", options)).toBe(renderSplatterCluster("a", options));
    expect(renderSplatterCluster("a", options)).not.toBe(renderSplatterCluster("b", options));
  });

  it("paints with every supplied colour", () => {
    const svg = renderSplatterCluster("a", options);
    for (const color of options.colors) expect(svg).toContain(`fill="${color}"`);
  });

  it("scales paint alpha with intensity and never past opaque", () => {
    const paintAlpha = (svg: string) =>
      Number(svg.match(/<use xlink:href="#m0" fill="[^"]+" fill-opacity="([\d.]+)"/)?.[1]);
    const base = paintAlpha(renderSplatterCluster("a", options));
    expect(paintAlpha(renderSplatterCluster("a", { ...options, intensity: 2 }))).toBeCloseTo(
      base * 2,
    );
    expect(paintAlpha(renderSplatterCluster("a", { ...options, intensity: 50 }))).toBe(1);
    expect(paintAlpha(renderSplatterCluster("a", { ...options, intensity: 0 }))).toBe(0);
  });

  it("draws a different pattern per seed, and the same one again for a seed", () => {
    const original = renderSplatterCluster("a", options);
    const seeded = renderSplatterCluster("a", { ...options, seed: 42 });
    expect(seeded).not.toBe(original);
    expect(renderSplatterCluster("a", { ...options, seed: 42 })).toBe(seeded);
    expect(renderSplatterCluster("a", { ...options, seed: 43 })).not.toBe(seeded);
    // Evicted and regrown after cycling past the cache, still identical.
    for (let seed = 100; seed < 110; seed += 1) renderSplatterCluster("a", { ...options, seed });
    expect(renderSplatterCluster("a", { ...options, seed: 42 })).toBe(seeded);
    expect(renderSplatterCluster("a", options)).toBe(original);
  });

  it("keeps every seeded splat inside the frame", () => {
    for (const seed of [1, 7, 999, 123456]) {
      for (const match of renderSplatterCluster("b", { ...options, seed }).matchAll(
        /<circle cx="([\d.-]+)" cy="([\d.-]+)" r="[\d.]+" fill="url/g,
      )) {
        expect(Number(match[1])).toBeGreaterThanOrEqual(0.05 * 600 - 0.1);
        expect(Number(match[1])).toBeLessThanOrEqual(0.95 * 600 + 0.1);
        expect(Number(match[2])).toBeGreaterThanOrEqual(0.05 * 600 - 0.1);
        expect(Number(match[2])).toBeLessThanOrEqual(0.95 * 600 + 0.1);
      }
    }
  });

  it("adds stroke halos only in glow mode", () => {
    expect(renderSplatterCluster("a", options)).not.toContain("stroke=");
    expect(renderSplatterCluster("a", { ...options, glow: true })).toContain('stroke="#39ff88"');
  });
});

it("converts oklch to srgb hex", () => {
  expect(oklchToHex({ l: 1, c: 0, h: 0 })).toBe("#ffffff");
  expect(oklchToHex({ l: 0, c: 0, h: 0 })).toBe("#000000");
});
