// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalConsole:off - Standalone Expo release tooling uses Node subprocesses and filesystem staging.
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";

const repo = "BreakTheBeta/T3codefold";
const releaseTag = "mobile-ota";
const branch = "mobile-ota";
const mobileDir = new URL("../apps/mobile/", import.meta.url).pathname;
const expo = NodePath.join(mobileDir, "node_modules", ".bin", "expo");
const expoUpdates = NodePath.join(mobileDir, "node_modules", ".bin", "expo-updates");
const workDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3codefold-ota-"));
const exportDir = NodePath.join(workDir, "export");
const uploadDir = NodePath.join(workDir, "upload");
const dryRun = process.argv.includes("--dry-run");

function run(
  command: string,
  args: string[],
  options: { cwd?: string; capture?: boolean; input?: string } = {},
) {
  const result = NodeChildProcess.spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, APP_VARIANT: "preview" },
    encoding: "utf8",
    input: options.input,
    stdio: options.capture || options.input ? ["pipe", "pipe", "inherit"] : "inherit",
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
  return result.stdout?.trim() ?? "";
}

function digest(contents: Buffer, algorithm: "md5" | "sha256", encoding: "hex" | "base64url") {
  return NodeCrypto.createHash(algorithm).update(contents).digest(encoding);
}

function uuidFromHash(hash: string) {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function contentType(extension: string) {
  return extension === "png"
    ? "image/png"
    : extension === "ttf"
      ? "font/ttf"
      : "application/octet-stream";
}

function makeAsset(path: string, extension: string, launch: boolean) {
  const contents = NodeFS.readFileSync(path);
  const sha256 = digest(contents, "sha256", "hex");
  const name = `${launch ? "launch" : "asset"}-${sha256}.${launch ? "hbc" : extension}`;
  const uploadPath = NodePath.join(uploadDir, name);
  NodeFS.copyFileSync(path, uploadPath);
  return {
    uploadPath,
    manifest: {
      hash: digest(contents, "sha256", "base64url"),
      key: digest(contents, "md5", "hex"),
      fileExtension: `.${launch ? "bundle" : extension}`,
      contentType: launch ? "application/javascript" : contentType(extension),
      url: `https://github.com/${repo}/releases/download/${releaseTag}/${name}`,
    },
  };
}

NodeFS.mkdirSync(uploadDir, { recursive: true });
const fingerprint = JSON.parse(
  run(expoUpdates, ["fingerprint:generate", "--platform", "android"], {
    cwd: mobileDir,
    capture: true,
  }),
).hash as string;
run(expo, ["export", "--platform", "android", "--output-dir", exportDir], {
  cwd: mobileDir,
});
const metadata: {
  fileMetadata: { android: { bundle: string; assets: Array<{ path: string; ext: string }> } };
} = JSON.parse(NodeFS.readFileSync(NodePath.join(exportDir, "metadata.json"), "utf8"));
const android = metadata.fileMetadata.android;
const launch = makeAsset(NodePath.join(exportDir, android.bundle), "hbc", true);
const assets = android.assets.map((asset: { path: string; ext: string }) =>
  makeAsset(NodePath.join(exportDir, asset.path), asset.ext, false),
);
const expoConfig = JSON.parse(
  run(expo, ["config", "--type", "public", "--json"], {
    cwd: mobileDir,
    capture: true,
  }),
);
const manifestSeed = JSON.stringify({
  fingerprint,
  launch: launch.manifest.hash,
  assets: assets.map((asset) => asset.manifest.hash),
});
const manifest = {
  id: uuidFromHash(digest(Buffer.from(manifestSeed), "sha256", "hex")),
  createdAt: new Date().toISOString(),
  runtimeVersion: fingerprint,
  assets: assets.map((asset) => asset.manifest),
  launchAsset: launch.manifest,
  metadata: { commit: run("git", ["rev-parse", "HEAD"], { capture: true }) },
  extra: { expoClient: expoConfig },
};

if (dryRun) {
  console.log(
    `Prepared ${manifest.id} for Android runtime ${fingerprint} with ${assets.length + 1} content-addressed files.`,
  );
  process.exit(0);
}

const releaseExists =
  NodeChildProcess.spawnSync("gh", ["release", "view", releaseTag, "--repo", repo], {
    stdio: "ignore",
  }).status === 0;
if (!releaseExists)
  run("gh", [
    "release",
    "create",
    releaseTag,
    "--repo",
    repo,
    "--prerelease",
    "--title",
    "T3 Code Fold OTA",
    "--notes",
    "Content-addressed Android OTA assets. Install APK releases for native runtime changes.",
  ]);
const existing = new Set(
  JSON.parse(
    run(
      "gh",
      [
        "release",
        "view",
        releaseTag,
        "--repo",
        repo,
        "--json",
        "assets",
        "--jq",
        ".assets | map(.name)",
      ],
      { capture: true },
    ),
  ) as string[],
);
const uploads = [launch, ...assets]
  .filter((asset) => !existing.has(NodePath.basename(asset.uploadPath)))
  .map((asset) => asset.uploadPath);
if (uploads.length > 0) run("gh", ["release", "upload", releaseTag, "--repo", repo, ...uploads]);

const branchExists =
  NodeChildProcess.spawnSync("gh", ["api", `repos/${repo}/git/ref/heads/${branch}`], {
    stdio: "ignore",
  }).status === 0;
if (!branchExists) {
  const mainSha = run("gh", ["api", `repos/${repo}/git/ref/heads/main`, "--jq", ".object.sha"], {
    capture: true,
  });
  run("gh", [
    "api",
    `repos/${repo}/git/refs`,
    "-X",
    "POST",
    "-f",
    `ref=refs/heads/${branch}`,
    "-f",
    `sha=${mainSha}`,
  ]);
}
const path = "manifest-android.json";
const current = NodeChildProcess.spawnSync(
  "gh",
  ["api", `repos/${repo}/contents/${path}?ref=${branch}`, "--jq", ".sha"],
  { encoding: "utf8" },
);
const payload = {
  message: `chore(ota): publish ${manifest.metadata.commit.slice(0, 12)}`,
  content: Buffer.from(`${JSON.stringify(manifest)}\n`).toString("base64"),
  branch,
  ...(current.status === 0 ? { sha: current.stdout.trim() } : {}),
};
run("gh", ["api", `repos/${repo}/contents/${path}`, "-X", "PUT", "--input", "-"], {
  input: JSON.stringify(payload),
});
console.log(
  `Published ${manifest.id} for Android runtime ${fingerprint}; uploaded ${uploads.length} new assets.`,
);
