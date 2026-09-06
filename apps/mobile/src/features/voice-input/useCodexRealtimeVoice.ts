import { RealtimeVoiceController, type VoiceState } from "@t3tools/client-runtime/realtime-voice";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { AppState } from "react-native";
import { mediaDevices, RTCPeerConnection } from "react-native-webrtc";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";

export function useCodexRealtimeVoice(input: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  enabled: boolean;
}) {
  const startRemote = useAtomCommand(threadEnvironment.startRealtimeVoice, {
    reportFailure: false,
  });
  const stopRemote = useAtomCommand(threadEnvironment.stopRealtimeVoice, { reportFailure: false });
  const [state, setState] = useState<VoiceState>({ status: "idle", muted: false, error: null });
  const { environmentId, threadId } = input;
  const controller = useMemo(
    () =>
      new RealtimeVoiceController({
        changed: setState,
        startRemote: async (sdp) => {
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
          await stopRemote({ environmentId, input: { threadId } });
        },
        openMedia: async (handlers) => {
          const microphone = await mediaDevices.getUserMedia({ audio: true, video: false });
          let peer: RTCPeerConnection;
          try {
            peer = new RTCPeerConnection();
          } catch (error) {
            microphone.getTracks().forEach((track) => track.stop());
            microphone.release();
            throw error;
          }
          const events = peer.createDataChannel("oai-events");
          let closed = false;
          const timeout = setTimeout(
            () =>
              handlers.failed("The voice connection timed out. Check your network and try again."),
            45_000,
          );
          microphone.getAudioTracks().forEach((track) => {
            peer.addTrack(track, microphone);
            track.onended = () => {
              if (!closed) handlers.failed("Microphone access was lost.");
            };
          });
          peer.onconnectionstatechange = () => {
            if (closed) return;
            if (peer.connectionState === "connected") {
              clearTimeout(timeout);
              handlers.connected();
            }
            if (["failed", "disconnected", "closed"].includes(peer.connectionState))
              handlers.failed("The voice connection was lost. Reconnect to continue.");
          };
          return {
            offer: async (signal) => {
              await peer.setLocalDescription(await peer.createOffer({}));
              if (signal.aborted) throw new Error("Voice canceled.");
              if (peer.iceGatheringState !== "complete")
                await new Promise<void>((resolve, reject) => {
                  const finish = (error?: Error) => {
                    clearTimeout(timer);
                    peer.onicegatheringstatechange = null;
                    signal.removeEventListener("abort", aborted);
                    if (error) reject(error);
                    else resolve();
                  };
                  const changed = () => {
                    if (peer.iceGatheringState === "complete") finish();
                  };
                  const aborted = () => finish(new Error("Voice canceled."));
                  const timer = setTimeout(
                    () => finish(new Error("Voice network setup timed out.")),
                    15_000,
                  );
                  peer.onicegatheringstatechange = changed;
                  signal.addEventListener("abort", aborted, { once: true });
                  if (signal.aborted) aborted();
                  else changed();
                });
              const sdp = peer.localDescription?.sdp;
              if (!sdp) throw new Error("WebRTC did not produce an offer.");
              return sdp;
            },
            answer: (sdp) => peer.setRemoteDescription({ type: "answer", sdp }),
            mute: (muted) =>
              microphone.getAudioTracks().forEach((track) => {
                track.enabled = !muted;
              }),
            // Native WebRTC plays incoming audio through its audio session.
            resume: async () => {},
            close: () => {
              if (closed) return;
              closed = true;
              clearTimeout(timeout);
              events.close();
              microphone.getTracks().forEach((track) => track.stop());
              peer.close();
              microphone.release();
            },
          };
        },
      }),
    [environmentId, threadId, startRemote, stopRemote],
  );
  useFocusEffect(
    useCallback(
      () => () => {
        void controller.stop();
      },
      [controller],
    ),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") void controller.stop();
    });
    return () => {
      subscription.remove();
      void controller.stop();
    };
  }, [controller]);
  useEffect(() => {
    if (!input.enabled) void controller.stop();
  }, [controller, input.enabled]);
  return {
    ...state,
    start: () => {
      if (input.enabled) void controller.start();
    },
    stop: () => {
      void controller.stop();
    },
    toggleMuted: () => controller.toggleMuted(),
  };
}
