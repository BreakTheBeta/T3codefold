import type { VoiceWorkspaceDependencies } from "@t3tools/client-runtime/realtime-voice/workspace";
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

export const openWebVoiceMedia: VoiceWorkspaceDependencies["openMedia"] = async (
  handlers,
  preferences,
) => {
  let microphone = await navigator.mediaDevices.getUserMedia({
    audio: {
      ...(preferences.microphoneId ? { deviceId: { exact: preferences.microphoneId } } : {}),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
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
  audio.muted = preferences.outputMuted;
  audio.setAttribute("playsinline", "");
  let closed = false;
  const timeout = setTimeout(
    () => handlers.failed("The voice connection timed out. Check your network and try again."),
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
    if (peer.connectionState === "disconnected") handlers.disconnected();
    if (["failed", "closed"].includes(peer.connectionState))
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
    muteOutput: (muted) => {
      audio.muted = muted;
    },
    changeMicrophone: async (deviceId) => {
      const replacement = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const track = replacement.getAudioTracks()[0];
      const sender = peer.getSenders().find((value) => value.track?.kind === "audio");
      if (!track || !sender || closed) {
        replacement.getTracks().forEach((value) => value.stop());
        throw new Error("Microphone unavailable");
      }
      track.enabled = microphone.getAudioTracks()[0]?.enabled ?? true;
      try {
        await sender.replaceTrack(track);
      } catch (error) {
        replacement.getTracks().forEach((value) => value.stop());
        throw error;
      }
      if (closed) {
        replacement.getTracks().forEach((value) => value.stop());
        return;
      }
      microphone.getTracks().forEach((value) => {
        value.onended = null;
        value.stop();
      });
      microphone = replacement;
      track.onended = () => handlers.failed("Microphone access was lost.");
    },
    resume: () => audio.play(),
    close,
  };
};
