import type { ExpoConfig } from "expo/config";

import { MOBILE_APP_NAME } from "./src/lib/mobileBranding.ts";

// Fold's identity and release channel, applied over upstream's Expo config so
// app.config.ts keeps upstream's values and merges cleanly. The app `version`
// stays in app.config.ts because fingerprint.config.js reads it from that file.
const FOLD_ANDROID_VERSION_CODE = 28;
const FOLD_PRODUCTION = { name: MOBILE_APP_NAME, androidPackage: "com.breakthebeta.t3code" };
const FOLD_EAS_PROJECT_ID = "5c3bde99-9c75-4cd6-b0a0-cc5d2cf846df";
const FOLD_OWNER = "BreakTheBeta";
// GitHub hosts the fork's protocol manifest and content-addressed assets.
// Fingerprinted runtimes prevent JavaScript from crossing native revisions.
const FOLD_UPDATES_URL =
  "https://raw.githubusercontent.com/BreakTheBeta/T3codefold/mobile-ota/manifest-android.json";

export function withFoldAppConfig(
  config: ExpoConfig,
  options: { readonly appVariant: string; readonly runtimeVersionPolicy: string },
): ExpoConfig {
  // Local prebuilds emit an unresolved fingerprint runtime; sideload builds bundle JS and disable OTA.
  const resolvesFingerprintRuntimeVersion =
    options.runtimeVersionPolicy !== "fingerprint" || process.env.EAS_BUILD === "true";
  const isProduction = options.appVariant === "production";

  return {
    ...config,
    ...(isProduction ? { name: FOLD_PRODUCTION.name } : {}),
    updates: {
      ...config.updates,
      enabled: options.appVariant === "preview" && resolvesFingerprintRuntimeVersion,
      url: FOLD_UPDATES_URL,
    },
    android: {
      ...config.android,
      versionCode: FOLD_ANDROID_VERSION_CODE,
      ...(isProduction ? { package: FOLD_PRODUCTION.androidPackage } : {}),
    },
    extra: {
      ...config.extra,
      eas: { ...config.extra?.eas, projectId: FOLD_EAS_PROJECT_ID },
    },
    owner: FOLD_OWNER,
  };
}
