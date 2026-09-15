import { describe, expect, it } from "vite-plus/test";
import { foldServerPackageSpec, normalizeFoldPackageSpec } from "./foldRelease.ts";

describe("Fold server packages", () => {
  it("migrates saved npm aliases to Fold releases", () => {
    for (const alias of [undefined, "t3", "t3@latest"]) {
      expect(normalizeFoldPackageSpec(alias)).toBe(
        "https://github.com/BreakTheBeta/T3codefold/releases/download/fold-server-latest/t3.tgz",
      );
    }
    expect(normalizeFoldPackageSpec("t3@nightly")).toContain("/fold-server-nightly/t3.tgz");
    expect(normalizeFoldPackageSpec("t3@0.1.6")).toContain("/fold-server-v0.1.6/t3-0.1.6.tgz");
    expect(normalizeFoldPackageSpec("https://example.test/custom.tgz")).toBe(
      "https://example.test/custom.tgz",
    );
  });
  it("rejects version ranges and path or shell input without falling back to upstream", () => {
    for (const version of ["^0.1.6", "../latest", "0.1.6;echo secret", ""]) {
      expect(() => foldServerPackageSpec(version)).toThrow();
    }
  });
});
