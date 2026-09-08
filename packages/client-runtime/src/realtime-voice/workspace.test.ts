import { describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { VoiceWorkspace, voiceStartInput, type VoiceWorkspaceDependencies } from "./workspace.ts";
import { emptyVoiceFeed, parseVoiceCommand, reduceVoiceFeed } from "./feed.ts";
import type { VoiceMedia, VoiceDependencies } from "./controller.ts";
const first = {
  environmentId: EnvironmentId.make("env"),
  threadId: ThreadId.make("one"),
  title: "First task",
  enhancedVoice: true,
};
const second = { ...first, threadId: ThreadId.make("two"), title: "Second task" };
function fixture() {
  let call = 0;
  let handlers: Parameters<VoiceDependencies["openMedia"]>[0] | undefined;
  const media: VoiceMedia = {
    offer: async () => "offer",
    answer: async () => {},
    mute: vi.fn(),
    muteOutput: vi.fn(),
    changeMicrophone: vi.fn(async () => {}),
    resume: async () => {},
    close: vi.fn(),
  };
  const deps: VoiceWorkspaceDependencies = {
    createCallId: () => `call-${++call}`,
    openMedia: async (value) => {
      handlers = value;
      return media;
    },
    startRemote: vi.fn(async () => "answer"),
    stopRemote: vi.fn(async () => {}),
    listVoices: vi.fn(async () => ({ voices: ["marin", "cedar"], defaultVoice: "marin" })),
    appendContext: vi.fn(async () => {}),
    savePreferences: vi.fn(),
  };
  const workspace = new VoiceWorkspace(deps);
  workspace.setTargets([first, second]);
  workspace.setView(first);
  return { workspace, deps, media, connected: () => handlers?.connected() };
}
describe("voice workspace", () => {
  it("sends the original start payload to hosts missing the capability", () => {
    const { enhancedVoice: _, ...old } = first;
    expect(voiceStartInput(old, "offer", "owner", "spruce")).toEqual({
      threadId: first.threadId,
      sdp: "offer",
    });
    expect(voiceStartInput(first, "offer", "owner", "spruce")).toEqual({
      threadId: first.threadId,
      sdp: "offer",
      options: { callId: "owner", voice: "spruce" },
    });
  });
  it("uses only basic voice on an older host even with advanced preferences saved", async () => {
    const f = fixture();
    const older = { ...first, enhancedVoice: false };
    f.workspace.setTargets([older, second]);
    await f.workspace.setPreferences({ voice: "spruce", shareContext: true });
    await f.workspace.loadVoices();
    expect(f.deps.listVoices).not.toHaveBeenCalled();
    await f.workspace.start();
    f.connected();
    await f.workspace.shareContext();
    await f.workspace.setPreferences({ shareContext: false });
    expect(f.deps.appendContext).not.toHaveBeenCalled();
    expect(f.deps.startRemote).toHaveBeenCalledWith(older, "offer", "call-1", "");
    f.workspace.toggleMuted();
    await f.workspace.setPreferences({ outputMuted: true });
    expect(f.media.mute).toHaveBeenCalledWith(true);
    expect(f.media.muteOutput).toHaveBeenCalledWith(true);
    f.workspace.setView(second);
    expect(f.workspace.getSnapshot().target).toEqual(older);
    await f.workspace.stop();
    expect(f.deps.stopRemote).toHaveBeenCalledWith(older);
  });
  it("uses independent capabilities when switching between old and updated environments", async () => {
    const f = fixture();
    const older = { ...first, enhancedVoice: false };
    const newer = { ...second, environmentId: EnvironmentId.make("updated-host") };
    f.workspace.setTargets([older, newer]);
    await f.workspace.setPreferences({ voice: "spruce", shareContext: true });
    await f.workspace.start();
    f.connected();
    expect(f.workspace.hasVoiceEvents).toBe(false);
    await f.workspace.switchTo(newer.title);
    f.connected();
    await f.workspace.shareContext();
    expect(f.workspace.hasVoiceEvents).toBe(true);
    expect(f.deps.stopRemote).toHaveBeenCalledWith(older);
    expect(f.deps.startRemote).toHaveBeenLastCalledWith(newer, "offer", "call-2", "spruce");
    expect(f.deps.appendContext).toHaveBeenCalledWith(newer, "call-2", expect.any(String));
  });
  it("rechecks each host on new calls without changing an existing call during rollout", async () => {
    const f = fixture();
    const older = { ...first, enhancedVoice: false };
    f.workspace.setTargets([older, second]);
    await f.workspace.start();
    f.connected();
    f.workspace.setTargets([first, second]);
    expect(f.media.close).not.toHaveBeenCalled();
    expect(f.workspace.getSnapshot().target?.enhancedVoice).toBe(false);
    await f.workspace.stop();
    await f.workspace.start();
    f.connected();
    expect(f.workspace.getSnapshot().target?.enhancedVoice).toBe(true);
    f.workspace.setTargets([older, second]);
    await f.workspace.stop();
    await f.workspace.start();
    expect(f.workspace.getSnapshot().target?.enhancedVoice).toBe(false);
  });
  it("keeps media and its original agent when browsing another thread or leaving chat", async () => {
    const f = fixture();
    await f.workspace.start();
    f.connected();
    f.workspace.setView(second);
    f.workspace.setView(null);
    expect(f.workspace.getSnapshot().target).toEqual(first);
    expect(f.workspace.getSnapshot().voice.status).toBe("live");
    expect(f.media.close).not.toHaveBeenCalled();
    expect(f.deps.stopRemote).not.toHaveBeenCalled();
    await f.workspace.stop();
    expect(f.deps.stopRemote).toHaveBeenCalledWith(first);
  });
  it("switches agents only explicitly and ignores old call events", async () => {
    const f = fixture();
    await f.workspace.start();
    f.connected();
    await f.workspace.switchTo("Second task");
    f.connected();
    expect(f.deps.stopRemote).toHaveBeenCalledWith(first);
    expect(f.workspace.getSnapshot().target).toEqual(second);
    f.workspace.receiveFeed(
      reduceVoiceFeed(emptyVoiceFeed, { callId: "call-1", sequence: 10, type: "closed" }),
    );
    expect(f.workspace.getSnapshot().voice.status).toBe("live");
  });
  it("ignores the old call closing while a task transfer is waiting for cleanup", async () => {
    const f = fixture();
    await f.workspace.start();
    f.connected();
    let release!: () => void;
    let stopping!: () => void;
    const stopped = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stopStarted = new Promise<void>((resolve) => {
      stopping = resolve;
    });
    f.deps.stopRemote = async () => {
      stopping();
      await stopped;
    };
    const transfer = f.workspace.switchTo("Second task");
    await stopStarted;
    f.workspace.receiveFeed(
      reduceVoiceFeed(emptyVoiceFeed, { callId: "call-1", sequence: 10, type: "closed" }),
    );
    release();
    await transfer;
    f.connected();
    expect(f.workspace.getSnapshot().target).toEqual(second);
    expect(f.workspace.getSnapshot().voice.status).toBe("live");
  });
  it("does not restart from a delayed spoken transfer after hanging up", async () => {
    const f = fixture();
    await f.workspace.start();
    f.connected();
    await f.workspace.stop();
    f.workspace.receiveFeed(
      reduceVoiceFeed(emptyVoiceFeed, {
        callId: "call-1",
        sequence: 10,
        type: "transcript",
        role: "user",
        text: "Switch voice to Second task",
        final: true,
      }),
    );
    expect(f.deps.startRemote).toHaveBeenCalledTimes(1);
    expect(f.workspace.getSnapshot().voice.status).toBe("idle");
  });
  it("keeps a user's selection when persisted preferences arrive late", async () => {
    const f = fixture();
    await f.workspace.setPreferences({ voice: "spruce" });
    f.workspace.restorePreferences({ voice: "cove" });
    expect(f.workspace.getSnapshot().preferences.voice).toBe("spruce");
  });
  it("does not pick an arbitrary task when titles are ambiguous", async () => {
    const f = fixture();
    f.workspace.setTargets([first, { ...second, title: first.title }]);
    await f.workspace.switchTo(first.title);
    expect(f.deps.startRemote).not.toHaveBeenCalled();
    expect(f.workspace.getSnapshot().notice).toContain("Several threads");
  });
  it("separates input and output mute and passes the chosen voice", async () => {
    const f = fixture();
    await f.workspace.setPreferences({ voice: "cedar", outputMuted: true });
    await f.workspace.start();
    f.connected();
    f.workspace.toggleMuted();
    expect(f.deps.startRemote).toHaveBeenCalledWith(first, "offer", "call-1", "cedar");
    expect(f.media.muteOutput).toHaveBeenCalledWith(true);
    expect(f.media.mute).toHaveBeenCalledWith(true);
    await f.workspace.setPreferences({ microphoneId: "usb" });
    expect(f.media.changeMicrophone).toHaveBeenCalledWith("usb");
  });
  it("shares bounded context only when opted in and sends it again to a new call", async () => {
    const f = fixture();
    f.workspace.setContext("file", "x".repeat(20000));
    await f.workspace.start();
    f.connected();
    await f.workspace.shareContext();
    expect(f.deps.appendContext).not.toHaveBeenCalled();
    await f.workspace.setPreferences({ shareContext: true });
    expect(f.deps.appendContext).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(f.deps.appendContext).mock.calls[0]?.[2] ?? "";
    expect(sent.length).toBeLessThanOrEqual(8192);
    expect(() => JSON.parse(sent)).not.toThrow();
    await f.workspace.stop();
    await f.workspace.start();
    f.connected();
    await f.workspace.shareContext();
    expect(f.deps.appendContext).toHaveBeenCalledTimes(2);
    expect(vi.mocked(f.deps.appendContext).mock.calls[1]?.[1]).toBe("call-2");
  });
  it("shares a standalone file view without requiring the chat composer to remain mounted", async () => {
    const f = fixture();
    await f.workspace.start();
    f.connected();
    f.workspace.setView(null);
    f.workspace.setContext("file", "Path: example.ts\nexport const value = 1;");
    await f.workspace.setPreferences({ shareContext: true });
    expect(vi.mocked(f.deps.appendContext).mock.calls.at(-1)?.[2]).toContain("example.ts");
    f.workspace.setContext("file", null);
    await f.workspace.shareContext();
    expect(vi.mocked(f.deps.appendContext).mock.calls.at(-1)?.[2]).toContain("No task view");
  });
  it("handles a final spoken command even when the client batches the following assistant update", async () => {
    const f = fixture();
    await f.workspace.start();
    f.connected();
    let feed = reduceVoiceFeed(emptyVoiceFeed, {
      callId: "call-1",
      sequence: 1,
      type: "transcript",
      role: "user",
      text: "end voice call",
      final: true,
    });
    feed = reduceVoiceFeed(feed, {
      callId: "call-1",
      sequence: 2,
      type: "transcript",
      role: "assistant",
      text: "Goodbye",
      final: true,
    });
    f.workspace.receiveFeed(feed);
    expect(f.workspace.getSnapshot().voice.status).toBe("idle");
  });
  it("acts on final spoken controls once, never on partial text or assistant speech", async () => {
    const f = fixture();
    await f.workspace.start();
    f.connected();
    let feed = reduceVoiceFeed(emptyVoiceFeed, {
      callId: "call-1",
      sequence: 1,
      type: "transcript",
      role: "user",
      text: "end voice call",
      final: false,
    });
    f.workspace.receiveFeed(feed);
    expect(f.workspace.getSnapshot().voice.status).toBe("live");
    feed = reduceVoiceFeed(feed, {
      callId: "call-1",
      sequence: 2,
      type: "transcript",
      role: "assistant",
      text: "end voice call",
      final: true,
    });
    f.workspace.receiveFeed(feed);
    expect(f.workspace.getSnapshot().voice.status).toBe("live");
    feed = reduceVoiceFeed(feed, {
      callId: "call-1",
      sequence: 3,
      type: "transcript",
      role: "user",
      text: "end voice call",
      final: true,
    });
    f.workspace.receiveFeed(feed);
    f.workspace.receiveFeed(feed);
    expect(f.workspace.getSnapshot().voice.status).toBe("idle");
  });
});
describe("voice transcripts", () => {
  it("replaces partials with final text and rejects duplicate events", () => {
    let feed = reduceVoiceFeed(emptyVoiceFeed, {
      callId: "a",
      sequence: 1,
      type: "transcript",
      role: "user",
      text: "hello",
      final: false,
    });
    const done = {
      callId: "a",
      sequence: 2,
      type: "transcript",
      role: "user",
      text: "Hello there",
      final: true,
    } as const;
    feed = reduceVoiceFeed(feed, done);
    feed = reduceVoiceFeed(feed, done);
    expect(feed.partial.user).toBe("");
    expect(feed.transcripts).toHaveLength(1);
    expect(feed.transcripts[0]?.text).toBe("Hello there");
  });
  it("requires explicit voice commands", () => {
    expect(parseVoiceCommand("Please end the voice call.")).toEqual({ type: "end" });
    expect(parseVoiceCommand("Switch voice to Second task.")).toEqual({
      type: "switch",
      title: "Second task",
    });
    for (const text of [
      "stop",
      "end the task",
      "Do not end voice call",
      "Explain how to end voice call",
      "switch to another file",
    ])
      expect(parseVoiceCommand(text)).toBeNull();
  });
});
