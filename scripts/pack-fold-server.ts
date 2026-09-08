#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off - Standalone release tooling uses Node subprocesses and filesystem staging.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeChildProcess from "node:child_process";
import { selectCliRuntimeExternalDependencies } from "./lib/cli-external-packages.ts";
import pkg from "../apps/server/package.json" with { type: "json" };
import { foldServerPackageSpec } from "../packages/shared/src/foldRelease.ts";

const root = NodeURL.fileURLToPath(new URL("../", import.meta.url));
const server = NodePath.join(root, "apps/server");
foldServerPackageSpec(pkg.version);
const output = NodePath.resolve(process.argv[2] ?? NodePath.join(root, "release-assets"));
await NodeFSP.mkdir(output, { recursive: true });
// The update preflight needs the launcher and the served web client, not just bin.mjs.
for (const file of ["bin.mjs", "service-launcher.mjs", "client/index.html"]) {
  await NodeFSP.access(NodePath.join(server, "dist", file));
}
const staging = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "fold-server-package-"));
try {
  const dependencies = selectCliRuntimeExternalDependencies(pkg.dependencies);
  for (const spec of Object.values(dependencies)) {
    if (spec.startsWith("catalog:") || spec.startsWith("workspace:")) {
      throw new Error("Resolve native dependency versions before packaging Fold.");
    }
  }
  await NodeFSP.cp(NodePath.join(server, "dist"), NodePath.join(staging, "dist"), {
    recursive: true,
  });
  await NodeFSP.writeFile(
    NodePath.join(staging, "package.json"),
    JSON.stringify(
      {
        name: "t3",
        version: pkg.version,
        type: "module",
        license: pkg.license,
        repository: pkg.repository,
        engines: pkg.engines,
        bin: pkg.bin,
        files: ["dist"],
        dependencies,
      },
      null,
      2,
    ) + "\n",
  );
  NodeChildProcess.execFileSync("npm", ["pack", "--pack-destination", output], {
    cwd: staging,
    stdio: "inherit",
  });
} finally {
  await NodeFSP.rm(staging, { recursive: true, force: true });
}
