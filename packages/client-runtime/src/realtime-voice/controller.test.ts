import { describe, expect, it, vi } from "vite-plus/test";
import {
  RealtimeVoiceController,
  type VoiceDependencies,
  type VoiceMedia,
  type VoiceState,
} from "./controller.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture() {
  const media: VoiceMedia = {
    offer: vi.fn(async () => "offer"),
    answer: vi.fn(async () => {}),
    mute: vi.fn(),
    resume: vi.fn(async () => {}),
    close: vi.fn(),
  };
  const states: VoiceState[] = [];
  const deps: VoiceDependencies = {
    openMedia: vi.fn(async () => media),
    startRemote: vi.fn(async () => "answer"),
    stopRemote: vi.fn(async () => {}),
    changed: (state) => states.push(state),
  };
  const controller = new RealtimeVoiceController(deps);
  return { controller, deps, media, states };
}

describe("realtime voice lifecycle", () => {
  it("does not label an SDP answer as a connected call and releases media on stop", async () => {
    const f = fixture();
    await f.controller.start();
    expect(f.states.at(-1)?.status).toBe("connecting");
    f.controller.toggleMuted();
    expect(f.media.mute).toHaveBeenCalledWith(true);
    await f.controller.stop();
    expect(f.deps.stopRemote).toHaveBeenCalledTimes(1);
    expect(f.media.close).toHaveBeenCalled();
    expect(f.states.at(-1)?.status).toBe("idle");
  });
  it("releases a microphone granted after cancellation without starting a remote session", async () => {
    const f = fixture();
    const permission = deferred<VoiceMedia>();
    const requested = deferred<void>();
    f.deps.openMedia = async () => {
      requested.resolve();
      return permission.promise;
    };
    const starting = f.controller.start();
    await requested.promise;
    const stopping = f.controller.stop();
    permission.resolve(f.media);
    await Promise.all([starting, stopping]);
    expect(f.media.close).toHaveBeenCalled();
    expect(f.deps.startRemote).not.toHaveBeenCalled();
  });
  it("waits for a canceled negotiation and its cleanup before a retry", async () => {
    const f = fixture();
    const answer = deferred<string>();
    const requested = deferred<void>();
    let calls = 0;
    f.deps.startRemote = vi.fn(async () => {
      calls++;
      requested.resolve();
      return calls === 1 ? answer.promise : "new-answer";
    });
    const starting = f.controller.start();
    await requested.promise;
    const stopping = f.controller.stop();
    const retry = f.controller.start();
    expect(calls).toBe(1);
    answer.resolve("old-answer");
    await Promise.all([starting, stopping, retry]);
    expect(f.deps.stopRemote).toHaveBeenCalledTimes(1);
    expect(f.media.answer).toHaveBeenCalledExactlyOnceWith("new-answer");
    await f.controller.stop();
  });
  it("does not stop another client's call when the host rejects a concurrent start", async () => {
    const f = fixture();
    f.deps.startRemote = async () => {
      throw new Error("Voice already active");
    };
    await f.controller.start();
    expect(f.deps.stopRemote).not.toHaveBeenCalled();
    expect(f.media.close).toHaveBeenCalled();
    expect(f.states.at(-1)?.error).toBe("Voice already active");
  });
});
