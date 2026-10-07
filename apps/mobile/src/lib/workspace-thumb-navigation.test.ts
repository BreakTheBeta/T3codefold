import { describe, expect, it } from "vite-plus/test";
import { resolveWorkspaceThumbAction } from "./workspace-thumb-navigation";

describe("workspace thumb navigation", () => {
  it("ignores small movements and ambiguous diagonals", () => {
    expect(resolveWorkspaceThumbAction(30, 0)).toBeNull();
    expect(resolveWorkspaceThumbAction(60, 55)).toBeNull();
  });
  it("maps deliberate handle swipes to reversible navigation", () => {
    expect(resolveWorkspaceThumbAction(80, 10)).toBe("previous");
    expect(resolveWorkspaceThumbAction(-80, 10)).toBe("next");
    expect(resolveWorkspaceThumbAction(10, -80)).toBe("sidebar");
    expect(resolveWorkspaceThumbAction(10, 80)).toBe("inspector");
  });
});
