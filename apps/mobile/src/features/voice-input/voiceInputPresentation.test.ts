import { expect, it } from "vite-plus/test";
import { resolveComposerDictationStartAction } from "./voiceInputPresentation";

it("keeps microphone setup reachable before voice is available and after permission denial", () => {
  expect(
    resolveComposerDictationStartAction({ phase: "idle", error: null, errorAction: null }, false),
  ).toBe("voice-settings");
  expect(
    resolveComposerDictationStartAction(
      { phase: "error", error: "Microphone denied", errorAction: "settings" },
      false,
    ),
  ).toBe("microphone-settings");
  expect(
    resolveComposerDictationStartAction({ phase: "idle", error: null, errorAction: null }, true),
  ).toBe("start");
});
