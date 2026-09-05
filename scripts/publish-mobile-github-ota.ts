import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const repo = "BreakTheBeta/T3codefold";
const releaseTag = "mobile-ota";
const branch = "mobile-ota";
const mobileDir = new URL("../apps/mobile/", import.meta.url).pathname;
const expo = join(mobileDir, "node_modules", ".bin", "expo");
const expoUpdates = join(mobileDir, "node_modules", ".bin", "expo-updates");
const workDir = mkdtempSync(join(tmpdir(), "t3codefold-ota-"));
const exportDir = join(workDir, "export");
const uploadDir = join(workDir, "upload");
const dryRun = process.argv.includes("--dry-run");

function run(
  command: string,
  args: string[],
  options: { cwd?: string; capture?: boolean; input?: string } = {},
) {
  const result = spawnSync(command, args, {
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
  return createHash(algorithm).update(contents).digest(encoding);
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
  const contents = readFileSync(path);
  const sha256 = digest(contents, "sha256", "hex");
  const name = `${launch ? "launch" : "asset"}-${sha256}.${launch ? "hbc" : extension}`;
  const uploadPath = join(uploadDir, name);
  copyFileSync(path, uploadPath);
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

mkdirSync(uploadDir, { recursive: true });
const fingerprint = JSON.parse(
  run(expoUpdates, ["fingerprint:generate", "--platform", "android"], {
    cwd: mobileDir,
    capture: true,
  }),
).hash as string;
run(expo, ["export", "--platform", "android", "--output-dir", exportDir], {
  cwd: mobileDir,
});
const metadata = JSON.parse(readFileSync(join(exportDir, "metadata.json"), "utf8"));
const android = metadata.fileMetadata.android;
const launch = makeAsset(join(exportDir, android.bundle), "hbc", true);
const assets = android.assets.map((asset: { path: string; ext: string }) =>
  makeAsset(join(exportDir, asset.path), asset.ext, false),
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
  spawnSync("gh", ["release", "view", releaseTag, "--repo", repo], { stdio: "ignore" }).status ===
  0;
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
  .filter((asset) => !existing.has(basename(asset.uploadPath)))
  .map((asset) => asset.uploadPath);
if (uploads.length > 0) run("gh", ["release", "upload", releaseTag, "--repo", repo, ...uploads]);

const branchExists =
  spawnSync("gh", ["api", `repos/${repo}/git/ref/heads/${branch}`], { stdio: "ignore" }).status ===
  0;
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
const current = spawnSync(
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
