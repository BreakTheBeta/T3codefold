import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  HostProcessEnvironment,
  HostProcessExecutablePath,
  HostProcessPlatform,
} from "@t3tools/shared/hostProcess";
import { isCommandAvailable, resolveCommandPath, resolveSpawnCommand } from "@t3tools/shared/shell";
import * as Console from "effect/Console";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Argument, Command } from "effect/unstable/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

export type NativePlatform = "ios" | "android";
const NativeClientRecord = Schema.Struct({ fingerprint: Schema.String, binary: Schema.String });
const encodeRecord = Schema.encodeEffect(Schema.fromJsonString(NativeClientRecord));
const decodeRecord = Schema.decodeUnknownEffect(Schema.fromJsonString(NativeClientRecord));
const encodeOutput = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const isNotLink = Schema.is(Schema.Struct({ code: Schema.Literal("EINVAL") }));
const decodeSimulators = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({
      devices: Schema.Record(
        Schema.String,
        Schema.Array(Schema.Struct({ udid: Schema.String, state: Schema.String })),
      ),
    }),
  ),
);
export type NativeClientRecord = typeof NativeClientRecord.Type;
export type NativeClientStatus = "compatible" | "missing" | "unknown" | "stale";
export class NativeClientError extends Schema.TaggedError<NativeClientError>()(
  "NativeClientError",
  { message: Schema.String },
) {}

export function clientStatus(
  fingerprint: string,
  binary: string | null,
  record: NativeClientRecord | null,
): NativeClientStatus {
  if (binary === null) return "missing";
  if (!record || record.binary !== binary) return "unknown";
  return record.fingerprint === fingerprint ? "compatible" : "stale";
}

/** Keep native sources stable during ensure, as with a normal build; endpoint checks reject detected edits. */
export const ensureClient = Effect.fn("ensureClient")(function* <E, R, E2, R2>(operations: {
  fingerprint: Effect.Effect<string, E, R>;
  installedBinary: Effect.Effect<string | null, E, R>;
  readRecord: Effect.Effect<NativeClientRecord | null, E, R>;
  build: Effect.Effect<void, E, R>;
  saveRecord: (record: NativeClientRecord) => Effect.Effect<void, E2, R2>;
}) {
  const fingerprint = yield* operations.fingerprint;
  const status = clientStatus(
    fingerprint,
    yield* operations.installedBinary,
    yield* operations.readRecord,
  );
  const verifyInputs = Effect.gen(function* () {
    if ((yield* operations.fingerprint) !== fingerprint) {
      return yield* new NativeClientError({
        message:
          "Native inputs changed during verification. Run ensure again; this build was not recorded.",
      });
    }
  });
  yield* verifyInputs;
  if (status === "compatible") {
    return { status, rebuilt: false, fingerprint };
  }
  yield* operations.build;
  const binary = yield* operations.installedBinary;
  if (binary === null)
    return yield* new NativeClientError({
      message: "Build finished but the development client is not installed.",
    });
  yield* verifyInputs;
  yield* operations.saveRecord({ fingerprint, binary });
  return { status: "compatible" as const, rebuilt: true, fingerprint };
});

const digest = Effect.fn("nativeClient.digest")(function* (value: string | Uint8Array) {
  const crypto = yield* Crypto.Crypto;
  const bytes = yield* crypto.digest(
    "SHA-256",
    typeof value === "string" ? new TextEncoder().encode(value) : value,
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
});

/** Hash fixed-size chunks to bound memory, including resources and symlink targets. */
export const hashBundle = Effect.fn("hashBundle")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entries: string[] = [];
  const visit = (
    relative: string,
  ): Effect.Effect<void, FileSystemError, FileSystem.FileSystem | Crypto.Crypto> =>
    Effect.gen(function* () {
      const names = (yield* fs.readDirectory(path.join(root, relative))).sort((a, b) =>
        a.localeCompare(b, "en"),
      );
      for (const name of names) {
        const key = path.join(relative, name);
        const absolute = path.join(root, key);
        // FileSystem.stat follows links; readLink distinguishes them without following a cycle.
        const link = yield* fs.readLink(absolute).pipe(
          Effect.catchIf(
            (error) => isNotLink(error.reason.cause),
            () => Effect.succeed(null),
          ),
        );
        if (link !== null) {
          entries.push(`link:${key}:${link}`);
          continue;
        }
        const info = yield* fs.stat(absolute);
        if (info.type === "Directory") {
          entries.push(`directory:${key}`);
          yield* visit(key);
        } else {
          const chunks = yield* fs.stream(absolute, { chunkSize: 65536 }).pipe(
            Stream.mapEffect((chunk) => digest(chunk)),
            Stream.runCollect,
          );
          entries.push(`file:${key}:${yield* digest(chunks.join("\n"))}`);
        }
      }
    });
  yield* visit("");
  return yield* digest(entries.map((entry) => `${entry.length}:${entry}`).join(""));
});
type FileSystemError = import("effect/PlatformError").PlatformError;

const bundleId = "com.t3tools.t3code.dev";
const roots = Effect.gen(function* () {
  const path = yield* Path.Path;
  const repo = yield* path.fromFileUrl(new URL("../", import.meta.url));
  return { repo, mobile: path.join(repo, "apps/mobile") };
});
const collect = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => "",
      (a, b) => a + b,
    ),
  );
export const resolveAdb = Effect.gen(function* () {
  if (yield* isCommandAvailable("adb")) return "adb";
  const environment = yield* HostProcessEnvironment;
  const path = yield* Path.Path;
  const executable = (yield* HostProcessPlatform) === "win32" ? "adb.exe" : "adb";
  for (const sdk of [environment.ANDROID_SDK_ROOT, environment.ANDROID_HOME]) {
    if (!sdk) continue;
    const candidate = path.join(sdk, "platform-tools", executable);
    if (yield* isCommandAvailable(candidate)) return candidate;
  }
  return yield* new NativeClientError({
    message:
      "adb was not found on PATH or in ANDROID_SDK_ROOT/ANDROID_HOME. Install Android SDK platform-tools.",
  });
});

/**
 * The JDK Gradle should compile with.
 *
 * A module that declares no toolchain of its own compiles with whichever JVM
 * launched Gradle, and `java` is not required to be a JDK: Debian-style
 * alternatives will happily point it at a headless JRE while `javac` comes
 * from a different package. Gradle then fails deep inside a third-party
 * module with "does not provide the required capabilities: [JAVA_COMPILER]",
 * naming a JVM nobody chose and no file in this repo mentions.
 *
 * Pinning a toolchain version in Gradle instead would reject machines whose
 * only JDK is newer than the one we picked, so resolve whatever JDK is
 * actually installed and hand Gradle that.
 */
export const resolveJavaHome = Effect.fn("nativeClient.resolveJavaHome")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const environment = yield* HostProcessEnvironment;
  const compiler = (yield* HostProcessPlatform) === "win32" ? "javac.exe" : "javac";
  const compiles = (home: string) =>
    fs.exists(path.join(home, "bin", compiler)).pipe(Effect.orElseSucceed(() => false));

  const configured = environment.JAVA_HOME?.trim();
  if (configured && (yield* compiles(configured))) return configured;

  // `javac` on PATH is by definition a compiler, so its real location is a JDK
  // even when `java` beside it is not.
  const resolved = yield* resolveCommandPath(compiler).pipe(
    Effect.flatMap((found) => fs.realPath(found)),
    Effect.orElseSucceed(() => null),
  );
  if (resolved) return path.dirname(path.dirname(resolved));

  return yield* new NativeClientError({
    message: configured
      ? `JAVA_HOME (${configured}) has no ${compiler}; point it at a JDK, not a JRE.`
      : `No ${compiler} found on PATH. Install a JDK, or set JAVA_HOME to one.`,
  });
});

const command = Effect.fn("nativeClient.command")(function* (
  program: string,
  args: string[],
  inherit = false,
  cwd?: string,
  environmentOverrides: Record<string, string> = {},
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const environment = yield* HostProcessEnvironment;
  const spawn = yield* resolveSpawnCommand(program === "adb" ? yield* resolveAdb : program, args);
  const child = yield* spawner.spawn(
    ChildProcess.make(spawn.command, spawn.args, {
      shell: spawn.shell,
      cwd: cwd ?? (yield* roots).mobile,
      env: {
        ...environment,
        APP_VARIANT: "development",
        MOBILE_VERSION_POLICY: "appVersion",
        T3CODE_IOS_PERSONAL_TEAM: "0",
        CI: "1",
        EXPO_NO_GIT_STATUS: "1",
        ...environmentOverrides,
      },
      stdin: "ignore",
      stdout: inherit ? "inherit" : "pipe",
      stderr: inherit ? "inherit" : "pipe",
    }),
  );
  const [stdout, stderr, code] = yield* Effect.all(
    [collect(child.stdout), collect(child.stderr), child.exitCode],
    { concurrency: "unbounded" },
  );
  if (code !== 0)
    return yield* new NativeClientError({
      message: `${program} ${args[0]} failed (${code}): ${stderr || "see build output"}`,
    });
  return stdout.trim();
}, Effect.scoped);

const ANDROID_ABIS = ["arm64-v8a", "armeabi-v7a", "x86", "x86_64"] as const;
export type AndroidAbi = (typeof ANDROID_ABIS)[number];

export function parseAndroidAbi(value: string): AndroidAbi {
  const abi = value.trim();
  if (!ANDROID_ABIS.some((candidate) => candidate === abi)) {
    throw new NativeClientError({
      message: `Unsupported Android emulator ABI: ${abi || "empty"}.`,
    });
  }
  return abi as AndroidAbi;
}

/** Debug clients run on one emulator, so the other three ABIs are pure build time. */
export function androidGradleBuildArgs(abi: AndroidAbi): string[] {
  return ["app:assembleDebug", "--build-cache", `-PreactNativeArchitectures=${abi}`];
}

/** Expo fingerprinting decides when native inputs changed; --clean would discard every intermediate. */
export function incrementalPrebuildArgs(platform: NativePlatform): string[] {
  return ["exec", "expo", "prebuild", "--platform", platform, "--no-install"];
}

/**
 * Gradle's build cache covers JVM and packaging tasks, but externalNativeBuild is not cacheable,
 * and pnpm materializes each worktree's node_modules separately. ccache is what lets one host's
 * NDK objects serve every checkout, so its settings exist to make a compile hash identically
 * regardless of which worktree ran it.
 */
export function ccacheEnvironment(repoRoot: string): Record<string, string> {
  return {
    CMAKE_C_COMPILER_LAUNCHER: "ccache",
    CMAKE_CXX_COMPILER_LAUNCHER: "ccache",
    // Rewrites checkout-absolute paths to CWD-relative. The NDK sits outside the checkout and
    // stays absolute, which is what keeps toolchain changes a miss.
    CCACHE_BASEDIR: repoRoot,
    // The same dependency unpacked into two worktrees differs only in timestamps.
    CCACHE_SLOPPINESS: "include_file_ctime,include_file_mtime,time_macros,pch_defines",
    // Debug info records the build directory; hashing it would make every worktree a miss.
    CCACHE_NOHASHDIR: "1",
    CCACHE_COMPILERCHECK: "content",
  };
}

const fingerprint = Effect.fn("nativeClient.fingerprint")(function* (platform: NativePlatform) {
  const output = yield* command(yield* HostProcessExecutablePath, [
    "--eval",
    `require('expo/fingerprint').createFingerprintAsync(process.cwd(), { platforms: [process.argv[1]], silent: true }).then(fp => console.log('T3_NATIVE_FINGERPRINT=' + fp.hash)).catch(e => { console.error(e); process.exitCode = 1; });`,
    platform,
  ]);
  const hash = output
    .split("\n")
    .find((line) => line.startsWith("T3_NATIVE_FINGERPRINT="))
    ?.split("=")[1];
  if (!hash || !/^[a-f0-9]{40,64}$/.test(hash))
    return yield* new NativeClientError({ message: "Expo did not return a native fingerprint." });
  return hash;
});

const validateDevice = Effect.fn("nativeClient.validateDevice")(function* (
  platform: NativePlatform,
  device: string,
) {
  if (platform === "ios") {
    if ((yield* HostProcessPlatform) !== "darwin")
      return yield* new NativeClientError({
        message: "Run iOS check/ensure on the Mac that hosts the simulator.",
      });
    const listing = yield* decodeSimulators(
      yield* command("xcrun", ["simctl", "list", "devices", "available", "--json"]),
    );
    const simulator = Object.values(listing.devices)
      .flat()
      .find((entry) => entry.udid === device);
    if (!simulator)
      return yield* new NativeClientError({
        message: `No available iOS simulator with UDID ${device}.`,
      });
    if (simulator.state !== "Booted")
      return yield* new NativeClientError({
        message: `Boot the selected simulator first: xcrun simctl boot ${device}`,
      });
  } else {
    if ((yield* command("adb", ["-s", device, "get-state"])) !== "device")
      return yield* new NativeClientError({ message: "Android device is not connected." });
    if ((yield* command("adb", ["-s", device, "shell", "getprop", "ro.kernel.qemu"])) !== "1")
      return yield* new NativeClientError({
        message: "Select an Android emulator, not a physical device.",
      });
  }
});

export const installedBinary = Effect.fn("installedBinary")(function* (
  platform: NativePlatform,
  device: string,
  run: typeof command = command,
) {
  if (platform === "ios") {
    const apps = yield* run("xcrun", ["simctl", "listapps", device]);
    if (!apps.includes(`"${bundleId}"`)) return null;
    return yield* hashBundle(
      yield* run("xcrun", ["simctl", "get_app_container", device, bundleId, "app"]),
    );
  }
  const installed = yield* run("adb", ["-s", device, "shell", "pm", "list", "packages", bundleId]);
  if (!installed.split("\n").some((line) => line.trim() === `package:${bundleId}`)) return null;
  const packages = yield* run("adb", ["-s", device, "shell", "pm", "path", bundleId]);
  const apks = packages
    .split("\n")
    .filter((line) => line.startsWith("package:"))
    .map((line) => line.slice(8).trim())
    .sort();
  if (apks.length === 0) return null;
  const hashes = yield* Effect.forEach(apks, (apk) =>
    Effect.gen(function* () {
      if (!/^\/[\w/+=.~-]+\.apk$/.test(apk))
        return yield* new NativeClientError({ message: "Unexpected installed APK path." });
      const hash = (yield* run("adb", ["-s", device, "shell", "sha256sum", apk])).split(/\s/)[0];
      if (!hash || !/^[a-f0-9]{64}$/.test(hash))
        return yield* new NativeClientError({ message: "Could not hash installed APK." });
      return hash;
    }),
  );
  return yield* digest(hashes.sort().join("\n"));
});

const main = Command.make(
  "mobile-native-client",
  {
    mode: Argument.Literals("mode", ["check", "ensure"]),
    platform: Argument.Literals("platform", ["ios", "android"]),
    device: Argument.String("device"),
  },
  Effect.fn("nativeClient.main")(function* ({ mode, platform, device }) {
    yield* validateDevice(platform, device);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const environment = yield* HostProcessEnvironment;
    const home = environment.HOME ?? environment.USERPROFILE;
    if (!home)
      return yield* new NativeClientError({
        message: "HOME or USERPROFILE must be set to store native client records.",
      });
    const recordPath = path.join(
      home,
      ".cache/t3code/native-clients",
      platform,
      `${yield* digest(device)}.json`,
    );
    const operations = {
      fingerprint: fingerprint(platform),
      installedBinary: installedBinary(platform, device),
      readRecord: fs.readFileString(recordPath).pipe(
        Effect.flatMap(decodeRecord),
        Effect.catchTag("SchemaError", () => Effect.succeed(null)),
        Effect.catchIf(
          (error) => error.reason._tag === "NotFound",
          () => Effect.succeed(null),
        ),
      ),
      build: Effect.gen(function* () {
        yield* Console.error(
          "Native client is missing, stale, or unverified. Building and installing a development client...",
        );
        const tracked = yield* command(
          "git",
          ["ls-files", `apps/mobile/${platform}`],
          false,
          (yield* roots).repo,
        );
        if (tracked)
          return yield* new NativeClientError({
            message: "Native directory contains tracked files; prebuild would overwrite them.",
          });
        yield* command("vp", incrementalPrebuildArgs(platform), true);
        if (platform === "ios") {
          const output = yield* fs.makeTempDirectoryScoped({ prefix: "t3-native-client-" });
          const { mobile } = yield* roots;
          yield* command("pod", ["install"], true, path.join(mobile, "ios"));
          // Target this simulator only, without Expo's desktop activation or log streaming.
          yield* command(
            "xcrun",
            [
              "xcodebuild",
              "-workspace",
              path.join(mobile, "ios/T3CodeDev.xcworkspace"),
              "-scheme",
              "T3CodeDev",
              "-configuration",
              "Debug",
              "-destination",
              `id=${device}`,
              "-derivedDataPath",
              output,
              "build",
            ],
            true,
          );
          yield* command(
            "xcrun",
            [
              "simctl",
              "install",
              device,
              path.join(output, "Build/Products/Debug-iphonesimulator/T3CodeDev.app"),
            ],
            true,
          );
        } else {
          const { mobile, repo } = yield* roots;
          const abi = parseAndroidAbi(
            yield* command("adb", ["-s", device, "shell", "getprop", "ro.product.cpu.abi"]),
          );
          const hasCcache = yield* isCommandAvailable("ccache");
          if (!hasCcache)
            yield* Console.error(
              "ccache is not installed, so this build cannot reuse NDK objects compiled in another worktree. Install ccache to share them.",
            );
          const gradle =
            (yield* HostProcessPlatform) === "win32"
              ? path.join(mobile, "android/gradlew.bat")
              : path.join(mobile, "android/gradlew");
          yield* command(gradle, androidGradleBuildArgs(abi), true, path.join(mobile, "android"), {
            ANDROID_SERIAL: device,
            JAVA_HOME: yield* resolveJavaHome(),
            ...(hasCcache ? ccacheEnvironment(repo) : {}),
          });
          yield* command(
            "adb",
            [
              "-s",
              device,
              "install",
              "-r",
              path.join(mobile, "android/app/build/outputs/apk/debug/app-debug.apk"),
            ],
            true,
          );
        }
      }).pipe(Effect.scoped),
      saveRecord: Effect.fn(function* (record: NativeClientRecord) {
        yield* fs.makeDirectory(path.dirname(recordPath), { recursive: true });
        yield* fs.writeFileString(recordPath, yield* encodeRecord(record));
      }),
    };
    if (mode === "ensure") {
      yield* Console.log(yield* encodeOutput(yield* ensureClient(operations)));
    } else {
      const current = yield* operations.fingerprint;
      const status = clientStatus(
        current,
        yield* operations.installedBinary,
        yield* operations.readRecord,
      );
      yield* Console.log(
        yield* encodeOutput({
          status,
          fingerprint: current,
          next:
            status === "compatible"
              ? "Start Metro with vp run dev:client"
              : `node scripts/mobile-native-client.ts ensure ${platform} ${device}`,
        }),
      );
      process.exitCode = status === "compatible" ? 0 : 2;
    }
  }),
);

if (import.meta.main) {
  Command.run(main, { version: "0.0.0" }).pipe(
    Effect.scoped,
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
