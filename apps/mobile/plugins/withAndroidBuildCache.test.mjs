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
