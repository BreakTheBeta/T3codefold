import { assert, describe, it } from "@effect/vitest";

import {
  NativeClientError,
  androidGradleBuildArgs,
  ccacheEnvironment,
  clientStatus,
  incrementalPrebuildArgs,
  parseAndroidAbi,
} from "./mobile-native-client.ts";

describe("mobile native client build planning", () => {
  it("keeps prebuild incremental for both platforms", () => {
    assert.deepEqual(incrementalPrebuildArgs("android"), [
      "exec",
      "expo",
      "prebuild",
      "--platform",
      "android",
      "--no-install",
    ]);
    assert.notInclude(incrementalPrebuildArgs("ios"), "--clean");
  });

  it("builds only the selected emulator ABI with Gradle's shared build cache", () => {
    assert.deepEqual(androidGradleBuildArgs(parseAndroidAbi("x86_64\n")), [
      "app:assembleDebug",
      "--build-cache",
      "-PreactNativeArchitectures=x86_64",
    ]);
  });

  it("rejects an ABI that the Android build does not support", () => {
    try {
      parseAndroidAbi("riscv64");
      assert.fail("Expected an unsupported ABI error.");
    } catch (error) {
      assert.instanceOf(error, NativeClientError);
      assert.equal(error.message, "Unsupported Android emulator ABI: riscv64.");
    }
  });

  it("anchors ccache to the checkout so two worktrees share one NDK object", () => {
    const one = ccacheEnvironment("/checkouts/one");
    const two = ccacheEnvironment("/checkouts/two");

    assert.equal(one.CCACHE_BASEDIR, "/checkouts/one");
    assert.equal(two.CCACHE_BASEDIR, "/checkouts/two");
    assert.equal(one.CMAKE_CXX_COMPILER_LAUNCHER, "ccache");
    // Only the checkout anchor may differ; anything else would hash the same source differently.
    const { CCACHE_BASEDIR: _one, ...oneRest } = one;
    const { CCACHE_BASEDIR: _two, ...twoRest } = two;
    assert.deepEqual(oneRest, twoRest);
    // pnpm gives each worktree its own copy of a dependency's headers, identical but for timestamps.
    assert.include(one.CCACHE_SLOPPINESS, "include_file_mtime");
    assert.equal(one.CCACHE_NOHASHDIR, "1");
  });

  it("reuses only the installed binary recorded for the current fingerprint", () => {
    assert.equal(
      clientStatus("native-a", "binary-a", { fingerprint: "native-a", binary: "binary-a" }),
      "compatible",
    );
    assert.equal(
      clientStatus("native-b", "binary-a", { fingerprint: "native-a", binary: "binary-a" }),
      "stale",
    );
    assert.equal(
      clientStatus("native-a", "binary-b", { fingerprint: "native-a", binary: "binary-a" }),
      "unknown",
    );
  });
});
