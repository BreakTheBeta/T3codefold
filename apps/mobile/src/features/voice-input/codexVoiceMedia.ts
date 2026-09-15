import type { VoiceWorkspaceDependencies } from "@t3tools/client-runtime/realtime-voice/workspace";
import { AppState, PermissionsAndroid, Platform } from "react-native";
import { mediaDevices, RTCPeerConnection, type MediaStreamTrack } from "react-native-webrtc";
import { voiceAudio } from "./voiceAudio";
export const createNativeVoiceMedia =
  (onRoute: (speaker: boolean, name: string) => void): VoiceWorkspaceDependencies["openMedia"] =>
  async (handlers, preferences) => {
    if (Platform.OS === "android" && Number(Platform.Version) >= 31) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    }
    let microphone = await mediaDevices.getUserMedia({
      audio: preferences.microphoneId ? { deviceId: preferences.microphoneId } : true,
      video: false,
    });
    let peer: RTCPeerConnection;
    try {
      if (AppState.currentState !== "active")
        throw new Error("Start voice with T3 in the foreground.");
      const initialSpeaker = await voiceAudio.start();
      if (Platform.OS !== "android") {
        onRoute(initialSpeaker, initialSpeaker ? "Speaker" : "Phone / headset");
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
    let outputMuted = preferences.outputMuted;
    peer.ontrack = (event: { track: MediaStreamTrack }) => {
      event.track.enabled = !outputMuted;
    };
    let activated = false;
    const timeout = setTimeout(
      () => handlers.failed("The voice connection timed out. Check your network and try again."),
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
                handlers.failed("Your phone could not activate call audio. Try reconnecting.");
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
      muteOutput: (muted) => {
        outputMuted = muted;
        peer.getReceivers().forEach((receiver) => {
          if (receiver.track) receiver.track.enabled = !muted;
        });
      },
      changeMicrophone: async (deviceId) => {
        const replacement = await mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId } : true,
          video: false,
        });
        const track = replacement.getAudioTracks()[0];
        const sender = peer.getSenders().find((value) => value.track?.kind === "audio");
        if (!track || !sender || closed) {
          replacement.getTracks().forEach((value) => value.stop());
          replacement.release();
          throw new Error("Microphone unavailable");
        }
        track.enabled = microphone.getAudioTracks()[0]?.enabled ?? true;
        try {
          await sender.replaceTrack(track);
        } catch (error) {
          replacement.getTracks().forEach((value) => value.stop());
          replacement.release();
          throw error;
        }
        if (closed) {
          replacement.getTracks().forEach((value) => value.stop());
          replacement.release();
          return;
        }
        microphone.getTracks().forEach((value) => {
          value.onended = null;
          value.stop();
        });
        microphone.release();
        microphone = replacement;
        track.onended = () => {
          if (!closed) handlers.failed("Microphone access was lost.");
        };
      },
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
  };
