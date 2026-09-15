import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { VoiceState } from "@t3tools/client-runtime/realtime-voice";
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
  const { workspace, state } = useVoiceWorkspace();
  const { environmentId, threadId, enabled, title = "Current thread" } = input;
  useEffect(() => {
    if (enabled && threadId) workspace.setView({ environmentId, threadId, title });
    else workspace.setView(null);
    return () => workspace.setView(null);
  }, [workspace, environmentId, threadId, enabled, title]);
  return {
    ...state.voice,
    supported:
      typeof RTCPeerConnection !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function",
    start: async () => {
      if (enabled && threadId) await workspace.start({ environmentId, threadId, title });
    },
    stop: () => workspace.stop(),
    toggleMuted: () => workspace.toggleMuted(),
    resumeAudio: () => workspace.resumeAudio(),
  };
}
