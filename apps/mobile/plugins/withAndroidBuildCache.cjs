const { withGradleProperties } = require("expo/config-plugins");

// Gradle's local build cache lives in the Gradle user home rather than the project, so enabling it
// here is what lets a JVM, resource, or dex task built in one worktree satisfy the next one. The
// generated android/ tree and its .gradle, build, and .cxx state stay per-worktree: they hold
// absolute paths and are not portable. Native C++ is cached separately by ccache, because
// externalNativeBuild tasks are not Gradle-cacheable.
const PROPERTIES = {
  "org.gradle.caching": "true",
};

module.exports = function withAndroidBuildCache(config) {
  return withGradleProperties(config, (nextConfig) => {
    const properties = nextConfig.modResults.filter(
      (item) => !(item.type === "property" && item.key in PROPERTIES),
    );

    for (const [key, value] of Object.entries(PROPERTIES)) {
      properties.push({ type: "property", key, value });
    }

    nextConfig.modResults = properties;
    return nextConfig;
  });
};
