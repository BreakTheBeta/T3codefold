import * as NodeModule from "node:module";
import * as NodePath from "node:path";
import * as NodeFS from "node:fs";
import { expect, it } from "vite-plus/test";
import withAndroidFbjniPin from "./withAndroidFbjniPin.cjs";

const require = NodeModule.createRequire(import.meta.url);

function reactNativeFbjniVersion() {
  const packageJson = require.resolve("react-native/package.json");
  const catalog = NodePath.join(NodePath.dirname(packageJson), "gradle", "libs.versions.toml");
  return /^\s*fbjni\s*=\s*"([^"]+)"/m.exec(NodeFS.readFileSync(catalog, "utf8"))?.[1];
}

const transform = async (modResults) => {
  const config = withAndroidFbjniPin({ name: "Test", slug: "test" });
  return (
    await config.mods.android.projectBuildGradle({
      ...config,
      modRequest: { platform: "android", modName: "projectBuildGradle", introspect: false },
      modResults,
    })
  ).modResults;
};

it("forces fbjni to the version React Native resolves, once across prebuilds", async () => {
  const first = await transform({
    language: "groovy",
    contents: 'apply plugin: "expo-root-project"\n',
  });
  const second = await transform(first);

  // A dynamic `com.facebook.fbjni:fbjni:+` from react-native-shiki-engine wins Gradle's
  // highest-version conflict resolution, and a newer fbjni's prebuilt libfbjni.so needs a newer
  // libc++ than Expo packages — SoLoader then fails to dlopen it before any UI renders.
  expect(second.contents).toContain(
    `force 'com.facebook.fbjni:fbjni:${reactNativeFbjniVersion()}'`,
  );
  expect(second.contents.match(/com\.facebook\.fbjni:fbjni/g)).toHaveLength(1);
  expect(second.contents.startsWith('apply plugin: "expo-root-project"')).toBe(true);
});

it("refuses a non-Groovy root build.gradle rather than skipping the pin", async () => {
  await expect(transform({ language: "kt", contents: "" })).rejects.toThrow(/Groovy/);
});
