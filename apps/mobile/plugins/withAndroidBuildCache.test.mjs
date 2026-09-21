import { expect, it } from "vite-plus/test";
import withAndroidBuildCache from "./withAndroidBuildCache.cjs";

it("enables the shared Gradle build cache without duplicating the property across prebuilds", async () => {
  const config = withAndroidBuildCache({ name: "Test", slug: "test" });
  const transform = async (modResults) =>
    (
      await config.mods.android.gradleProperties({
        ...config,
        modRequest: { platform: "android", modName: "gradleProperties", introspect: false },
        modResults,
      })
    ).modResults;

  // Expo regenerates gradle.properties on every prebuild, and a stale value must not survive.
  const first = await transform([
    { type: "property", key: "org.gradle.parallel", value: "true" },
    { type: "property", key: "org.gradle.caching", value: "false" },
  ]);
  const second = await transform(first);

  expect(second.filter((item) => item.key === "org.gradle.caching")).toEqual([
    { type: "property", key: "org.gradle.caching", value: "true" },
  ]);
  expect(second).toContainEqual({ type: "property", key: "org.gradle.parallel", value: "true" });
});

it("disables precompiled headers only for ccache builds, once across prebuilds", async () => {
  const config = withAndroidBuildCache({ name: "Test", slug: "test" });
  const transform = async (modResults) =>
    (
      await config.mods.android.projectBuildGradle({
        ...config,
        modRequest: { platform: "android", modName: "projectBuildGradle", introspect: false },
        modResults,
      })
    ).modResults;

  const first = await transform({
    language: "groovy",
    contents: 'apply plugin: "expo-root-project"\n',
  });
  const second = await transform(first);

  // A PCH path embeds AGP's per-checkout hash, so leaving it on makes those units miss in every
  // other worktree. EAS and release builds never set CCACHE_BASEDIR and keep their PCH.
  expect(second.contents.match(/CMAKE_DISABLE_PRECOMPILE_HEADERS=ON/g)).toHaveLength(1);
  expect(second.contents).toContain('if (System.getenv("CCACHE_BASEDIR"))');
  expect(second.contents.startsWith('apply plugin: "expo-root-project"')).toBe(true);
});
