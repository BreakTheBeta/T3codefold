import { describe, expect, it } from "vite-plus/test";
import { sourceConnectionName } from "./gladosSettings.logic";

describe("sourceConnectionName", () => {
  it("uses the tracker kind when it is free", () => {
    expect(sourceConnectionName("linear", ["jira"])).toBe("linear");
  });

  it("numbers the name past existing connections", () => {
    expect(sourceConnectionName("linear", ["linear", "linear-2"])).toBe("linear-3");
  });
});
