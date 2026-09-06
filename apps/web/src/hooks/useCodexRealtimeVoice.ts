import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { RealtimeVoiceController, type VoiceState } from "@t3tools/client-runtime/realtime-voice";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useEffect, useMemo, useState } from "react";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";

export { supportsCodexRealtimeVoiceVersion } from "@t3tools/client-runtime/realtime-voice";
export type CodexRealtimeVoiceStatus = VoiceState["status"];
export type CodexRealtimeVoiceController = ReturnType<typeof useCodexRealtimeVoice>;
const ICE_GATHERING_TIMEOUT_MS = 15_000;

export function waitForIceGathering(peer: RTCPeerConnection, signal: AbortSignal): Promise<void> {
  if (peer.iceGatheringState === "complete") {
    return Promise.resolve();
  }
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const finish = (cause?: unknown) => {
      globalThis.clearTimeout(timeoutId);
      peer.removeEventListener("icegatheringstatechange", handleStateChange);
      signal.removeEventListener("abort", handleAbort);
      if (cause === undefined) resolve();
      else reject(cause);
    };
    const handleStateChange = () => {
      if (peer.iceGatheringState === "complete") finish();
    };
    const handleAbort = () => finish(signal.reason ?? new DOMException("Aborted", "AbortError"));
    const timeoutId = globalThis.setTimeout(
      () => finish(new Error("WebRTC ICE gathering timed out.")),
      ICE_GATHERING_TIMEOUT_MS,
    );
    peer.addEventListener("icegatheringstatechange", handleStateChange);
    signal.addEventListener("abort", handleAbort, { once: true });
    if (signal.aborted) handleAbort();
  });
}

export function useCodexRealtimeVoice(input: {
  environmentId: EnvironmentId;
  threadId: ThreadId | null;
  enabled: boolean;
}) {
  const startRemote = useAtomCommand(threadEnvironment.startRealtimeVoice, {
    reportFailure: false,
  });
  const stopRemote = useAtomCommand(threadEnvironment.stopRealtimeVoice, { reportFailure: false });
  const [state, setState] = useState<VoiceState>({ status: "idle", muted: false, error: null });
  const supported =
    typeof RTCPeerConnection !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function";
  const { environmentId, threadId } = input;
  const controller = useMemo(
    () =>
      new RealtimeVoiceController({
        changed: setState,
        startRemote: async (sdp) => {
          if (!threadId)
            throw new Error("Send a message in this Codex thread before starting voice.");
          const result = await startRemote({ environmentId, input: { threadId, sdp } });
          if (result._tag !== "Success") {
            const cause = squashAtomCommandFailure(result);
            throw new Error(
              cause instanceof Error
                ? cause.message
                : "The host rejected Codex voice. Check its Codex version and account access.",
            );
          }
          return result.value.sdp;
        },
        stopRemote: async () => {
          if (threadId) await stopRemote({ environmentId, input: { threadId } });
        },
        openMedia: async (handlers) => {
          const microphone = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          let peer: RTCPeerConnection;
          try {
            peer = new RTCPeerConnection();
          } catch (error) {
            microphone.getTracks().forEach((track) => track.stop());
            throw error;
          }
          const events = peer.createDataChannel("oai-events");
          const audio = new Audio();
          audio.autoplay = true;
          audio.setAttribute("playsinline", "");
          let closed = false;
          const timeout = setTimeout(
            () =>
              handlers.failed("The voice connection timed out. Check your network and try again."),
            45_000,
          );
          const close = () => {
            if (closed) return;
            closed = true;
            clearTimeout(timeout);
            peer.onconnectionstatechange = null;
            peer.ontrack = null;
            events.close();
            microphone.getTracks().forEach((track) => {
              track.onended = null;
              track.stop();
            });
            peer.close();
            audio.pause();
            audio.srcObject = null;
          };
          microphone.getAudioTracks().forEach((track) => {
            peer.addTrack(track, microphone);
            track.onended = () => handlers.failed("Microphone access was lost.");
          });
          peer.ontrack = (event) => {
            audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
            void audio.play().catch(() => {
              if (!closed) handlers.playbackBlocked();
            });
          };
          peer.onconnectionstatechange = () => {
            if (peer.connectionState === "connected") {
              clearTimeout(timeout);
              handlers.connected();
            }
            if (["failed", "disconnected", "closed"].includes(peer.connectionState))
              handlers.failed("The Codex voice connection was lost. Reconnect to continue.");
          };
          return {
            offer: async (signal) => {
              await peer.setLocalDescription(await peer.createOffer());
              await waitForIceGathering(peer, signal);
              const sdp = peer.localDescription?.sdp;
              if (!sdp) throw new Error("WebRTC did not produce an offer.");
              return sdp;
            },
            answer: (sdp) => peer.setRemoteDescription({ type: "answer", sdp }),
            mute: (muted) =>
              microphone.getAudioTracks().forEach((track) => {
                track.enabled = !muted;
              }),
            resume: () => audio.play(),
            close,
          };
        },
      }),
    [environmentId, threadId, startRemote, stopRemote],
  );
  useEffect(
    () => () => {
      void controller.stop();
    },
    [controller],
  );
  useEffect(() => {
    if (!input.enabled) void controller.stop();
  }, [controller, input.enabled]);
  return {
    ...state,
    supported,
    start: async () => {
      if (input.enabled && supported) await controller.start();
    },
    stop: () => controller.stop(),
    toggleMuted: () => controller.toggleMuted(),
    resumeAudio: () => controller.resumeAudio(),
  };
}
