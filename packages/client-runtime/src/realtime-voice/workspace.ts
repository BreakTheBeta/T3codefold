import type {
  EnvironmentId,
  ThreadId,
  ProviderRealtimeVoiceListResult,
  ProviderRealtimeVoiceStartInput,
} from "@t3tools/contracts";
import { RealtimeVoiceController, type VoiceDependencies, type VoiceState } from "./controller.ts";
import { emptyVoiceFeed, parseVoiceCommand, type VoiceFeed } from "./feed.ts";

export type VoiceTarget = {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  title: string;
  enhancedVoice?: boolean;
};
export type VoicePreferences = {
  voice: string;
  microphoneId: string;
  outputMuted: boolean;
  shareContext: boolean;
};
export type VoiceWorkspaceState = {
  targets: readonly VoiceTarget[];
  target: VoiceTarget | null;
  view: VoiceTarget | null;
  callId: string;
  voice: VoiceState;
  feed: VoiceFeed;
  preferences: VoicePreferences;
  voices: readonly string[];
  notice: string | null;
  context: string;
};
export interface VoiceWorkspaceDependencies {
  openMedia: (
    handlers: Parameters<VoiceDependencies["openMedia"]>[0],
    preferences: VoicePreferences,
  ) => ReturnType<VoiceDependencies["openMedia"]>;
  startRemote(target: VoiceTarget, sdp: string, callId: string, voice: string): Promise<string>;
  stopRemote(target: VoiceTarget): Promise<void>;
  listVoices(target: VoiceTarget): Promise<ProviderRealtimeVoiceListResult>;
  appendContext(target: VoiceTarget, callId: string, text: string): Promise<void>;
  createCallId(): string;
  savePreferences?(preferences: VoicePreferences): void;
}
export function sameVoiceTarget(a: VoiceTarget | null, b: VoiceTarget | null) {
  return (
    a !== null && b !== null && a.threadId === b.threadId && a.environmentId === b.environmentId
  );
}
/** Preserve the exact original wire shape for hosts without the capability. */
export function voiceStartInput(
  target: VoiceTarget,
  sdp: string,
  callId: string,
  voice: string,
): ProviderRealtimeVoiceStartInput {
  return {
    threadId: target.threadId,
    sdp,
    ...(target.enhancedVoice === true ? { options: { callId, ...(voice ? { voice } : {}) } } : {}),
  };
}
export const BASIC_VOICE_NOTICE =
  "This host supports basic voice. Update it for voice selection, transcripts, view sharing and spoken call controls. Microphone and speaker controls still work.";
/** A client owns one call. Browsing and switching the call's agent are separate operations. */
export class VoiceWorkspace {
  private state: VoiceWorkspaceState = {
    targets: [],
    target: null,
    view: null,
    callId: "",
    voice: { status: "idle", muted: false, error: null },
    feed: emptyVoiceFeed,
    preferences: { voice: "", microphoneId: "", outputMuted: false, shareContext: false },
    voices: [],
    notice: null,
    context: "",
  };
  private listeners = new Set<() => void>();
  private controller: RealtimeVoiceController | null = null;
  private generation = 0;
  private lastCommandSequence = 0;
  private contextPending: Promise<void> = Promise.resolve();
  private latestContext = "";
  private preferencesChanged = false;
  private contextSources = new Map<string, string>();
  private dependencies: VoiceWorkspaceDependencies;
  constructor(dependencies: VoiceWorkspaceDependencies, preferences?: Partial<VoicePreferences>) {
    this.dependencies = dependencies;
    this.state = { ...this.state, preferences: { ...this.state.preferences, ...preferences } };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<VoiceWorkspaceState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  get settingsTarget() {
    return (
      (this.state.voice.status !== "idle" && this.state.voice.status !== "error"
        ? this.state.target
        : null) ??
      this.state.view ??
      this.state.target ??
      this.state.targets[0]
    );
  }
  supportsVoiceControls(target = this.settingsTarget) {
    return (
      this.state.targets.find((candidate) => sameVoiceTarget(candidate, target ?? null))
        ?.enhancedVoice === true
    );
  }
  get hasVoiceEvents() {
    return (
      this.state.target?.enhancedVoice === true && this.supportsVoiceControls(this.state.target)
    );
  }
  setTargets(targets: readonly VoiceTarget[]) {
    this.update({ targets });
  }
  setContext(source: string, text: string | null) {
    if (text === null) this.contextSources.delete(source);
    else this.contextSources.set(source, text.slice(0, 3000));
    const context = [...this.contextSources]
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n")
      .slice(0, 6000);
    if (context === this.state.context) return;
    this.update({ context });
    if (this.state.preferences.shareContext) void this.shareContext();
  }
  setView(view: VoiceTarget | null) {
    if (sameVoiceTarget(view, this.state.view) && view?.title === this.state.view?.title) return;
    this.update({ view });
    if (this.state.preferences.shareContext) void this.shareContext();
  }
  async loadVoices(target = this.settingsTarget) {
    if (!target) {
      this.update({ notice: "Open a connected Codex thread first." });
      return;
    }
    if (!this.supportsVoiceControls(target)) {
      this.update({ voices: [] });
      return;
    }
    try {
      const result = await this.dependencies.listVoices(target);
      if (
        !sameVoiceTarget(target, this.settingsTarget ?? null) ||
        !this.supportsVoiceControls(target)
      )
        return;
      this.update({ voices: result.voices, notice: null });
    } catch {
      this.update({ notice: "Voice choices need a connected Codex thread on an updated host." });
    }
  }
  restorePreferences(preferences: Partial<VoicePreferences>) {
    if (this.preferencesChanged || this.state.voice.status !== "idle") return;
    this.update({ preferences: { ...this.state.preferences, ...preferences } });
  }
  async setPreferences(patch: Partial<VoicePreferences>) {
    this.preferencesChanged = true;
    this.update({ preferences: { ...this.state.preferences, ...patch } });
    this.dependencies.savePreferences?.(this.state.preferences);
    if (patch.outputMuted !== undefined) this.controller?.setOutputMuted(patch.outputMuted);
    if (patch.microphoneId !== undefined) {
      try {
        await this.controller?.changeMicrophone(patch.microphoneId);
      } catch {
        this.update({
          notice: "Could not change microphone. The previous microphone is still active.",
        });
      }
    }
    if (patch.shareContext !== undefined) {
      if (patch.shareContext) await this.shareContext();
      else {
        const target = this.state.target;
        if (target && this.hasVoiceEvents && this.state.voice.status === "live")
          await this.dependencies
            .appendContext(
              target,
              this.state.callId,
              "View sharing is now off. Previously shared data remains in this conversation; do not assume it is still current.",
            )
            .catch(() => {});
      }
    }
  }
  async start(target = this.state.view) {
    if (!target) {
      this.update({ notice: "Open a connected Codex thread first." });
      return;
    }
    if (
      sameVoiceTarget(target, this.state.target) &&
      this.state.voice.status !== "idle" &&
      this.state.voice.status !== "error"
    )
      return;
    target = { ...target, enhancedVoice: this.supportsVoiceControls(target) };
    const generation = ++this.generation;
    const previous = this.controller;
    this.controller = null;
    const callId = this.dependencies.createCallId();
    this.lastCommandSequence = 0;
    this.latestContext = "";
    // Retire the old identity before awaiting its close notification.
    this.update({
      target,
      callId,
      feed: emptyVoiceFeed,
      notice: null,
      voice: { status: "connecting", muted: false, error: null },
    });
    await previous?.stop();
    if (generation !== this.generation) return;
    const controller = new RealtimeVoiceController({
      openMedia: (handlers) => this.dependencies.openMedia(handlers, this.state.preferences),
      startRemote: (sdp) =>
        this.dependencies.startRemote(
          target,
          sdp,
          callId,
          target.enhancedVoice ? this.state.preferences.voice : "",
        ),
      stopRemote: () => this.dependencies.stopRemote(target),
      changed: (voice) => {
        if (generation !== this.generation) return;
        this.update({ voice });
        if (voice.status === "live" && this.state.preferences.shareContext)
          void this.shareContext();
      },
    });
    this.controller = controller;
    await controller.start();
    if (generation === this.generation)
      controller.setOutputMuted(this.state.preferences.outputMuted);
  }
  async stop() {
    ++this.generation;
    const controller = this.controller;
    this.controller = null;
    this.update({ callId: "", voice: { status: "idle", muted: false, error: null } });
    await controller?.stop();
  }
  dismiss() {
    if (this.state.voice.status !== "idle" && this.state.voice.status !== "error") return;
    this.update({
      notice: null,
      feed: emptyVoiceFeed,
      voice: { status: "idle", muted: false, error: null },
    });
  }
  toggleMuted() {
    this.controller?.toggleMuted();
  }
  setMuted(muted: boolean) {
    this.controller?.setMuted(muted);
  }
  resumeAudio() {
    return this.controller?.resumeAudio() ?? Promise.resolve();
  }
  async switchTo(title: string) {
    const candidates = this.state.targets.filter(
      (target) => target.title.trim().toLocaleLowerCase() === title.trim().toLocaleLowerCase(),
    );
    if (candidates.length !== 1) {
      this.update({
        notice: candidates.length
          ? "Several threads have that name. Choose a task in the voice panel."
          : `No connected Codex task named “${title}”. Choose a task in the voice panel.`,
      });
      return;
    }
    await this.start(candidates[0]);
  }
  receiveFeed(feed: VoiceFeed) {
    if (
      !this.hasVoiceEvents ||
      feed.callId !== this.state.callId ||
      feed.sequence <= this.state.feed.sequence
    )
      return;
    this.update({ feed });
    if (feed.phase === "closed" || feed.phase === "error") {
      const notice = feed.error ?? feed.lastEvent?.text ?? "The provider ended this call.";
      void this.stop();
      this.update({ notice });
      return;
    }
    for (const entry of feed.transcripts) {
      if (entry.id <= this.lastCommandSequence || entry.role !== "user") continue;
      this.lastCommandSequence = entry.id;
      const command = parseVoiceCommand(entry.text);
      if (command?.type === "end") {
        void this.stop();
        break;
      }
      if (command?.type === "switch") {
        void this.switchTo(command.title);
        break;
      }
    }
  }

  /** Coalesce context changes behind an in-flight send; never run an idle polling loop. */
  async shareContext() {
    const { target, view, callId, context, preferences, voice } = this.state;
    if (!target || !this.hasVoiceEvents || !preferences.shareContext || voice.status !== "live")
      return;
    let excerpt = context || (view ? "" : "No task view is currently visible.");
    let text = JSON.stringify({
      viewedThread: view
        ? {
            environmentId: view.environmentId.slice(0, 128),
            threadId: view.threadId.slice(0, 128),
            title: view.title.slice(0, 160),
          }
        : null,
      context: excerpt,
    });
    while (text.length > 8192) {
      excerpt = excerpt.slice(0, Math.floor(excerpt.length / 2));
      text = JSON.stringify({
        viewedThread: view
          ? {
              environmentId: view.environmentId.slice(0, 128),
              threadId: view.threadId.slice(0, 128),
              title: view.title.slice(0, 160),
            }
          : null,
        context: excerpt,
      });
    }
    if (text === this.latestContext) return;
    this.latestContext = text;
    this.contextPending = this.contextPending.then(async () => {
      if (
        this.latestContext !== text ||
        this.state.callId !== callId ||
        !this.state.preferences.shareContext
      )
        return;
      await this.dependencies.appendContext(target, callId, text).catch(() =>
        this.update({
          notice: "View context could not be shared. Your call is still connected.",
        }),
      );
    });
    await this.contextPending;
  }
}
