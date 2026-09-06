import { RealtimeVoiceController, type VoiceState } from "@t3tools/client-runtime/realtime-voice";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { AppState, PermissionsAndroid, Platform } from "react-native";
import { voiceAudio } from "./voiceAudio";
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
  const [speaker, setSpeaker] = useState(false);
  const [audioRoute, setAudioRoute] = useState("Phone");
  const [audioError, setAudioError] = useState<string | null>(null);
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
          if (Platform.OS === "android" && Number(Platform.Version) >= 31) {
            await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
          }
          const microphone = await mediaDevices.getUserMedia({ audio: true, video: false });
          let peer: RTCPeerConnection;
          try {
            if (AppState.currentState !== "active")
              throw new Error("Start voice with T3 in the foreground.");
            const initialSpeaker = await voiceAudio.start();
            if (Platform.OS !== "android") {
              setSpeaker(initialSpeaker);
              setAudioRoute(initialSpeaker ? "Speaker" : "Phone / headset");
            }
            peer = new RTCPeerConnection();
          } catch (error) {
            microphone.getTracks().forEach((track) => track.stop());
            microphone.release();
            await voiceAudio.stop().catch(() => {});
            throw error;
          }
          const events = peer.createDataChannel("oai-events");
          let closed = false;
          let activated = false;
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
              if (!activated) {
                activated = true;
                void voiceAudio
                  .connected()
                  .then(() => {
                    if (!closed && peer.connectionState === "connected") handlers.connected();
                  })
                  .catch(() => {
                    if (!closed)
                      handlers.failed(
                        "Your phone could not activate call audio. Try reconnecting.",
                      );
                  });
              } else handlers.connected();
            }
            if (peer.connectionState === "disconnected") handlers.disconnected();
            if (["failed", "closed"].includes(peer.connectionState))
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
              void voiceAudio.stop().catch(() => {});
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
    const subscription = voiceAudio.addListener("endCall", () => {
      void controller.stop();
    });
    const route = voiceAudio.addListener("audioRoute", (route) => {
      setSpeaker(route.speaker);
      setAudioRoute(route.name);
    });
    const mute = voiceAudio.addListener("systemMute", ({ muted }) => controller.setMuted(muted));
    return () => {
      subscription.remove();
      route.remove();
      mute.remove();
      void controller.stop();
    };
  }, [controller]);
  // Availability gates starting a call. Losing the host WebSocket must not tear down
  // the independent WebRTC audio connection when Android backgrounds the client.
  return {
    ...state,
    speaker,
    audioRoute,
    audioError,
    chooseAudioOutput: async () => {
      try {
        if (Platform.OS === "android") await voiceAudio.chooseEndpoint();
        else await voiceAudio.setSpeaker(!speaker);
        if (Platform.OS !== "android") {
          setSpeaker(!speaker);
          setAudioRoute(!speaker ? "Speaker" : "Phone / headset");
        }
        setAudioError(null);
      } catch (error) {
        setAudioError(error instanceof Error ? error.message : "Could not change audio output.");
      }
    },
    volumeUp: () => voiceAudio.volumeUp(),
    start: () => {
      if (input.enabled) {
        setAudioError(null);
        void controller.start();
      }
    },
    stop: () => {
      void controller.stop();
    },
    toggleMuted: () => controller.toggleMuted(),
  };
}
