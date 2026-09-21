const { withGradleProperties, withProjectBuildGradle } = require("expo/config-plugins");

// Gradle's local build cache lives in the Gradle user home rather than the project, so enabling it
// here is what lets a JVM, resource, or dex task built in one worktree satisfy the next one. The
// generated android/ tree and its .gradle, build, and .cxx state stay per-worktree: they hold
// absolute paths and are not portable. Native C++ is cached separately by ccache, because
// externalNativeBuild tasks are not Gradle-cacheable.
const PROPERTIES = {
  "org.gradle.caching": "true",
};

const MARKER = "// t3code: ccache-portable native builds";

// Precompiled headers live under AGP's .cxx/<variant>/<hash> directory, and AGP derives that hash
// from the absolute project path. pnpm symlinks each library into node_modules, so the path ccache
// hashes for the PCH climbs to the checkout root and back down through that hash: every unit that
// includes a PCH misses in every other worktree. Without PCH, ccache serves each unit directly.
// Only builds that run through mobile-native-client's ccache environment are affected; EAS and
// release builds keep their precompiled headers.
const PORTABLE_NATIVE_BUILD = `
${MARKER}
if (System.getenv("CCACHE_BASEDIR")) {
  subprojects { sub ->
    sub.plugins.withId("com.android.library") {
      sub.android.defaultConfig.externalNativeBuild.cmake.arguments("-DCMAKE_DISABLE_PRECOMPILE_HEADERS=ON")
    }
  }
}
`;

module.exports = function withAndroidBuildCache(config) {
  config = withGradleProperties(config, (nextConfig) => {
    const properties = nextConfig.modResults.filter(
      (item) => !(item.type === "property" && item.key in PROPERTIES),
    );

    for (const [key, value] of Object.entries(PROPERTIES)) {
      properties.push({ type: "property", key, value });
    }

    nextConfig.modResults = properties;
    return nextConfig;
  });

  return withProjectBuildGradle(config, (nextConfig) => {
    if (nextConfig.modResults.language !== "groovy") {
      throw new Error("withAndroidBuildCache expects a Groovy root build.gradle.");
    }
    if (!nextConfig.modResults.contents.includes(MARKER)) {
      nextConfig.modResults.contents += PORTABLE_NATIVE_BUILD;
    }
    return nextConfig;
  });
};
