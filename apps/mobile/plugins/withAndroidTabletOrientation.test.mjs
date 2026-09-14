import { expect, it } from "vite-plus/test";
import withAndroidTabletOrientation from "./withAndroidTabletOrientation.cjs";

it("preserves Expo configuration handling and adds density without duplicate flags across prebuilds", async () => {
  const config = withAndroidTabletOrientation({ name: "Test", slug: "test" });
  const manifest = {
    manifest: {
      application: [
        {
          activity: [
            {
              $: {
                "android:name": ".MainActivity",
                "android:configChanges": "orientation|screenSize|smallestScreenSize|uiMode",
              },
            },
          ],
        },
      ],
    },
  };
  const transform = async (modResults) =>
    (
      await config.mods.android.manifest({
        ...config,
        modRequest: { platform: "android", modName: "manifest", introspect: false },
        modResults,
      })
    ).modResults;
  const first = await transform(manifest);
  const second = await transform(first);
  expect(second.manifest.application[0].activity[0].$["android:configChanges"].split("|")).toEqual([
    "orientation",
    "screenSize",
    "smallestScreenSize",
    "uiMode",
    "density",
  ]);
});
