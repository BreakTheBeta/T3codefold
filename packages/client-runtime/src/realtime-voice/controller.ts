export type VoiceState = {
  status: "idle" | "connecting" | "live" | "playback-blocked" | "error";
  muted: boolean;
  error: string | null;
};

/** Each client owns media; only the SDP offer/answer crosses its host connection. */
export interface VoiceMedia {
  offer(signal: AbortSignal): Promise<string>;
  answer(sdp: string): Promise<void>;
  mute(muted: boolean): void;
  resume(): Promise<void>;
  close(): void;
}

export interface VoiceDependencies {
  openMedia(handlers: {
    connected(): void;
    failed(message: string): void;
    playbackBlocked(): void;
  }): Promise<VoiceMedia>;
  startRemote(sdp: string): Promise<string>;
  stopRemote(): Promise<void>;
  changed(state: VoiceState): void;
}

type LocalSession = { abort: AbortController; media?: VoiceMedia; remote: boolean };

/** Serializes retries with remote cleanup, including stop during permission or signaling. */
export class RealtimeVoiceController {
  private state: VoiceState = { status: "idle", muted: false, error: null };
  private session: LocalSession | null = null;
  private pending: Promise<void> = Promise.resolve();

  private readonly dependencies: VoiceDependencies;
  constructor(dependencies: VoiceDependencies) {
    this.dependencies = dependencies;
  }

  private update(state: Partial<VoiceState>) {
    this.state = { ...this.state, ...state };
    this.dependencies.changed(this.state);
  }

  start(): Promise<void> {
    if (this.session) return this.pending;
    const session: LocalSession = { abort: new AbortController(), remote: false };
    this.session = session;
    this.update({ status: "connecting", muted: false, error: null });
    const previous = this.pending;
    const current = () => this.session === session && !session.abort.signal.aborted;
    this.pending = (async () => {
      await previous;
      if (!current()) return;
      try {
        session.media = await this.dependencies.openMedia({
          connected: () => {
            if (current() && this.state.status !== "playback-blocked")
              this.update({ status: "live" });
          },
          failed: (message) => {
            if (!current()) return;
            void this.stop();
            this.update({ status: "error", error: message });
          },
          playbackBlocked: () => {
            if (current())
              this.update({
                status: "playback-blocked",
                error: "Tap the speaker to resume Codex audio.",
              });
          },
        });
        if (!current()) return;
        const sdp = await session.media.offer(session.abort.signal);
        if (!current()) return;
        const answer = await this.dependencies.startRemote(sdp);
        session.remote = true;
        if (!current()) return;
        await session.media.answer(answer);
        // The transport's connected event, not receipt of SDP, marks the call live.
      } catch (cause) {
        if (current()) {
          this.session = null;
          this.update({
            status: "error",
            error: cause instanceof Error ? cause.message : "Codex voice could not connect.",
          });
        }
      } finally {
        if (!current()) {
          session.media?.close();
          if (session.remote) {
            session.remote = false;
            await this.dependencies.stopRemote().catch(() => {});
          }
        }
      }
    })();
    return this.pending;
  }

  stop(): Promise<void> {
    const session = this.session;
    this.session = null;
    session?.abort.abort();
    session?.media?.close();
    this.update({ status: "idle", muted: false, error: null });
    const previous = this.pending;
    this.pending = previous.then(async () => {
      // A completed start no longer runs its finally block when stopped later.
      if (session?.remote) {
        session.remote = false;
        await this.dependencies.stopRemote().catch(() => {});
      }
    });
    return this.pending;
  }

  toggleMuted() {
    if (!this.session?.media) return;
    const muted = !this.state.muted;
    this.session.media.mute(muted);
    this.update({ muted });
  }

  async resumeAudio() {
    const session = this.session;
    if (!session?.media) return;
    try {
      await session.media.resume();
      if (this.session === session) this.update({ status: "live", error: null });
    } catch {
      if (this.session === session)
        this.update({
          status: "playback-blocked",
          error: "Audio is paused. Check playback permissions.",
        });
    }
  }
}

export function supportsCodexRealtimeVoiceVersion(version: string | null): boolean {
  const match = version?.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return true;
  return Number(match[1]) > 0 || Number(match[2]) >= 145;
}
