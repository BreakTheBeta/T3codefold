const {
  AndroidConfig,
  withAndroidManifest,
  withInfoPlist,
  withAppBuildGradle,
  withDangerousMod,
} = require("expo/config-plugins");

module.exports = function withRealtimeVoice(config) {
  config = withAndroidManifest(config, (next) => {
    AndroidConfig.Permissions.addPermission(next.modResults, "android.permission.RECORD_AUDIO");
    AndroidConfig.Permissions.addPermission(
      next.modResults,
      "android.permission.MODIFY_AUDIO_SETTINGS",
    );
    AndroidConfig.Permissions.addPermission(
      next.modResults,
      "android.permission.ACCESS_NETWORK_STATE",
    );
    return next;
  });
  config = withInfoPlist(config, (next) => {
    next.modResults.NSMicrophoneUsageDescription =
      "Allow T3 Code to talk with Codex and dictate prompts.";
    return next;
  });
  config = withDangerousMod(config, [
    "android",
    async (next) => {
      const fs = require("node:fs/promises");
      const path = require("node:path");
      await fs.writeFile(
        path.join(next.modRequest.platformProjectRoot, "app/webrtc-proguard.pro"),
        "-keep class org.webrtc.** { *; }\n-keep class com.oney.WebRTCModule.** { *; }\n",
      );
      return next;
    },
  ]);
  // WebRTC invokes these classes through JNI, outside R8's Java call graph.
  return withAppBuildGradle(config, (next) => {
    const rule = '\nandroid.buildTypes.release.proguardFiles file("webrtc-proguard.pro")\n';
    if (!next.modResults.contents.includes('file("webrtc-proguard.pro")'))
      next.modResults.contents += rule;
    return next;
  });
};
