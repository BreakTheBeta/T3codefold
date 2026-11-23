import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { VoiceState } from "@t3tools/client-runtime/realtime-voice";
import { useGT } from "gt-react";
import { useEffect } from "react";
import { useVoiceWorkspace } from "../components/voice/VoiceWorkspaceProvider";
export { supportsCodexRealtimeVoiceVersion } from "@t3tools/client-runtime/realtime-voice";
export { waitForIceGathering } from "./codexVoiceMedia";
export type CodexRealtimeVoiceStatus = VoiceState["status"];
export type CodexRealtimeVoiceController = ReturnType<typeof useCodexRealtimeVoice>;
export function useCodexRealtimeVoice(input: {
  environmentId: EnvironmentId;
  threadId: ThreadId | null;
  enabled: boolean;
  title?: string;
}) {
  const gt = useGT();
  const { workspace, state } = useVoiceWorkspace();
  const { environmentId, threadId, enabled, title = gt("Current thread") } = input;
  const destination = state.targets.find(
    (target) => target.threadId === threadId && target.environmentId === environmentId,
  );
  const available = destination !== undefined;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Registers the mounted chat as the live call’s optional view context.
  useEffect(() => {
    if (enabled && threadId && available) workspace.setView({ environmentId, threadId, title });
    else workspace.setView(null);
    return () => workspace.setView(null);
  }, [workspace, environmentId, threadId, enabled, title, available]);
  return {
    ...state.voice,
    companion: destination?.companion === true,
    supported:
      destination !== undefined &&
      typeof RTCPeerConnection !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function",
    start: async () => {
      if (enabled && threadId && destination) await workspace.start(destination);
    },
    stop: () => workspace.stop(),
    toggleMuted: () => workspace.toggleMuted(),
    resumeAudio: () => workspace.resumeAudio(),
  };
}
