// @effect-diagnostics nodeBuiltinImport:off - Exercises the host CLI's evidence gate with disposable report files.
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "@effect/vitest";
import { controllerAudit, controllerTrackedDiff } from "./controller-navigation.ts";

it("refuses certification when an inventory has no runtime evidence", async () => {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "controller-graph-"));
  try {
    expect(await controllerAudit(["inventory", "--out", directory])).toBe(2);
    const report = JSON.parse(await NodeFSP.readFile(NodePath.join(directory, "run.json"), "utf8"));
    expect(report.report.coverage.routeLayouts.expected).toBeGreaterThan(0);
    expect(report.report.coverage.routeLayouts.visited).toBe(0);
    expect(report.report.nodes).toEqual([]);
    expect(report.source.hardware).toBe("UNVERIFIED");
    expect(await controllerAudit(["inventory", "--out", directory, "--partial"])).toBe(0);
  } finally {
    await NodeFSP.rm(directory, { recursive: true, force: true });
  }
});

it("reads a controller source diff larger than the default subprocess buffer", async () => {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "controller-diff-"));
  try {
    const git = (args: string[]) => NodeChildProcess.execFileSync("git", args, { cwd: directory });
    git(["init", "--quiet"]);
    await NodeFSP.mkdir(NodePath.join(directory, "apps/mobile"), { recursive: true });
    const file = NodePath.join(directory, "apps/mobile/fixture.ts");
    await NodeFSP.writeFile(file, "a".repeat(1_200_000) + "\n");
    git(["add", "."]);
    git([
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgSign=false",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    ]);
    await NodeFSP.writeFile(file, "b".repeat(1_200_000) + "\n");
    const diff = controllerTrackedDiff(directory);
    expect(diff.length).toBeGreaterThan(2_400_000);
    expect(diff.endsWith("+" + "b".repeat(1_200_000) + "\n")).toBe(true);
  } finally {
    await NodeFSP.rm(directory, { recursive: true, force: true });
  }
});
