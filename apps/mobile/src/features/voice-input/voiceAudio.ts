import { requireNativeModule } from "expo";

type VoiceAudio = {
  start(): Promise<boolean>;
  connected(): Promise<void>;
  stop(): Promise<void>;
  setSpeaker(enabled: boolean): Promise<void>;
  chooseEndpoint(): Promise<void>;
  volumeUp(): void;
  addListener(event: "endCall", listener: () => void): { remove(): void };
  addListener(
    event: "audioRoute",
    listener: (route: { name: string; speaker: boolean }) => void,
  ): { remove(): void };
  addListener(
    event: "systemMute",
    listener: (state: { muted: boolean }) => void,
  ): { remove(): void };
};

const native = requireNativeModule<VoiceAudio>("T3VoiceAudio");
let pending: Promise<unknown> = Promise.resolve();
function ordered<T>(operation: () => Promise<T>): Promise<T> {
  const next = pending.then(operation, operation);
  pending = next.catch(() => {});
  return next;
}
// Native teardown must finish before a new call acquires the shared audio session.
export const voiceAudio = {
  start: () => ordered(() => native.start()),
  connected: () => ordered(() => native.connected()),
  stop: () => ordered(() => native.stop()),
  setSpeaker: (enabled: boolean) => ordered(() => native.setSpeaker(enabled)),
  chooseEndpoint: () => native.chooseEndpoint(),
  volumeUp: () => native.volumeUp(),
  addListener: native.addListener.bind(native),
};
