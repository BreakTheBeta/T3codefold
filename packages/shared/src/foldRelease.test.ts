import { describe, expect, it } from "vite-plus/test";
import {
  foldServerCommand,
  foldServerPackageSpec,
  manualFoldServerCommand,
} from "./foldRelease.ts";

describe("Fold server packages", () => {
  it("rejects version ranges and path or shell input without falling back to upstream", () => {
    for (const version of ["^0.1.6", "../latest", "0.1.6;echo secret", ""]) {
      expect(() => foldServerPackageSpec(version)).toThrow();
    }
  });
  it("builds manual update hints from non-release versions without throwing", () => {
    expect(manualFoldServerCommand("0.1.6")).toBe(foldServerCommand("0.1.6"));
    for (const version of ["", "unknown", "0.1.6-dirty+local build", "^0.1.6"]) {
      expect(manualFoldServerCommand(version)).toBe(foldServerCommand("latest"));
    }
  });
});
