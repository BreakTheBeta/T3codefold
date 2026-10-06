import { requireOptionalNativeModule } from "expo";
import { Alert, PermissionsAndroid, Platform } from "react-native";
import type { LocalDictationBackend } from "./localDictation.ts";

type Settings = { configured: boolean; bluetooth: boolean; architecture: number; ready: boolean };
type NativeDictation = {
  getDictationSettings(): Settings;
  configureDictation(): Promise<void>;
  startDictation(allowDownload: boolean): Promise<void>;
  stopDictation(flush: boolean): Promise<string[]>;
  cancelDictation(): Promise<void>;
  addListener(
    event: "dictationPhrase",
    listener: (event: { text: string }) => void,
  ): { remove(): void };
  addListener(
    event: "dictationMeter",
    listener: (event: { decibels: number; durationMillis: number }) => void,
  ): { remove(): void };
  addListener(
    event: "dictationError",
    listener: (event: { message: string }) => void,
  ): { remove(): void };
  addListener(event: "endCall", listener: () => void): { remove(): void };
  addListener(
    event: "dictationPreparation",
    listener: (event: { message: string }) => void,
  ): { remove(): void };
};

const native = requireOptionalNativeModule<NativeDictation>("T3VoiceAudio");
let backend: LocalDictationBackend | null = null;

export function getLocalDictationBackend(): LocalDictationBackend | null {
  if (!native || typeof native.startDictation !== "function") return null;
  if (backend) return backend;
  const module = native;
  let callbacks: Parameters<LocalDictationBackend["start"]>[0] | null = null;
  let subscriptions: { remove(): void }[] = [];
  let removeAbort = () => {};
  let status = { isRecording: false, metering: -160, durationMillis: 0 };
  backend = {
    configure: () => module.configureDictation(),
    getStatus: () => status,
    async start(next, signal) {
      signal.throwIfAborted();
      let settings = module.getDictationSettings();
      if (!settings.configured) await module.configureDictation();
      signal.throwIfAborted();
      settings = module.getDictationSettings();
      if (!settings.ready) {
        const size =
          settings.architecture === 2 ? "43" : settings.architecture === 5 ? "257" : "136";
        const download = await new Promise<boolean>((resolve) =>
          Alert.alert(
            "Download on-device speech model",
            `Download approximately ${size} MB once. English dictation then runs on your phone without uploading audio.`,
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              { text: "Download", onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          ),
        );
        if (!download) throw new Error("Model download canceled.");
      }
      signal.throwIfAborted();
      const permissions =
        settings.bluetooth && Number(Platform.Version) >= 31
          ? [
              PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            ]
          : [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
      const grants = await PermissionsAndroid.requestMultiple(permissions);
      signal.throwIfAborted();
      if (
        permissions.some((permission) => grants[permission] !== PermissionsAndroid.RESULTS.GRANTED)
      ) {
        const denied = new Error(
          "Microphone and Nearby devices access are required for the selected dictation input.",
        );
        throw Object.assign(denied, { code: "PERMISSION_DENIED" });
      }
      callbacks = next;
      status = { isRecording: false, metering: -160, durationMillis: 0 };
      subscriptions = [
        module.addListener("dictationPreparation", ({ message }) => callbacks?.preparing(message)),
        module.addListener("dictationPhrase", ({ text }) => callbacks?.phrase(text)),
        module.addListener("dictationMeter", ({ decibels, durationMillis }) => {
          status = { isRecording: true, metering: decibels, durationMillis };
        }),
        module.addListener("dictationError", ({ message }) => callbacks?.failed(message)),
        module.addListener("endCall", () => callbacks?.ended()),
      ];
      const cancel = () => {
        void module.cancelDictation().catch(() => {});
      };
      signal.addEventListener("abort", cancel, { once: true });
      removeAbort = () => signal.removeEventListener("abort", cancel);
      await module.startDictation(!settings.ready);
      signal.throwIfAborted();
      status.isRecording = true;
    },
    async stop(flush) {
      removeAbort();
      try {
        const phrases = await module.stopDictation(flush);
        if (flush) for (const text of phrases) callbacks?.phrase(text);
      } finally {
        subscriptions.forEach((subscription) => subscription.remove());
        subscriptions = [];
        callbacks = null;
        status.isRecording = false;
      }
    },
  };
  return backend;
}
