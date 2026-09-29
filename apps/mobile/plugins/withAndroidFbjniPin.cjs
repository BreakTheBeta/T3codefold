const path = require("node:path");
const fs = require("node:fs");
const { withProjectBuildGradle } = require("expo/config-plugins");

// react-native-shiki-engine asks for `com.facebook.fbjni:fbjni:+`. Gradle resolves a dynamic
// version against the network and then gives the highest requested version the conflict, so that
// `+` silently outranks the version React Native pins — no change in this repo required, just a
// new fbjni release.
//
// fbjni ships a prebuilt libfbjni.so. When it is built against a newer NDK than the one Expo
// packages (fbjni 0.8.1 needs __cxa_init_primary_exception, which only NDK 29's libc++ exports,
// while Expo SDK 57 packages NDK 27.1's), dlopen cannot resolve it and SoLoader throws
// SoLoaderDSONotFoundError from MainApplication.onCreate — the app dies before any UI.
//
// Pinning to the version React Native itself resolves keeps libfbjni.so and the packaged
// libc++_shared.so on one ABI, and follows React Native across upgrades.
const MARKER = "// t3code: pin fbjni to React Native's ABI";

const CATALOG_ENTRY = /^\s*fbjni\s*=\s*"([^"]+)"/m;

function reactNativeFbjniVersion() {
  const packageJson = require.resolve("react-native/package.json", { paths: [__dirname] });
  const catalog = path.join(path.dirname(packageJson), "gradle", "libs.versions.toml");
  const version = CATALOG_ENTRY.exec(fs.readFileSync(catalog, "utf8"))?.[1];

  if (version === undefined) {
    // Silently skipping would ship an app that crashes on launch, so fail the prebuild instead.
    throw new Error(
      `withAndroidFbjniPin could not read the fbjni version from ${catalog}. React Native moved its version catalog; update this plugin to match.`,
    );
  }

  return version;
}

module.exports = function withAndroidFbjniPin(config) {
  return withProjectBuildGradle(config, (nextConfig) => {
    if (nextConfig.modResults.language !== "groovy") {
      throw new Error("withAndroidFbjniPin expects a Groovy root build.gradle.");
    }
    if (nextConfig.modResults.contents.includes(MARKER)) {
      return nextConfig;
    }

    nextConfig.modResults.contents += `
${MARKER}
allprojects {
  configurations.configureEach {
    resolutionStrategy {
      force 'com.facebook.fbjni:fbjni:${reactNativeFbjniVersion()}'
    }
  }
}
`;
    return nextConfig;
  });
};
