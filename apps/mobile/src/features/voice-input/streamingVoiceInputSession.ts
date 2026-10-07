import {
  voiceInputBlocksSubmission,
  resolveTranscriptCommit,
  type VoiceDraftSnapshot,
  type VoiceInputState,
} from "@t3tools/client-runtime/voice-input";
import type { LocalDictationBackend } from "../../native/localDictation";
import type { VoiceInputTarget } from "./voiceInputSession";

const IDLE: VoiceInputState = { phase: "idle", error: null, errorAction: null };

/** Owns one draft while native Android capture streams completed phrases into it. */
export class StreamingVoiceInputSession {
  readonly controller = this;
  private state = IDLE;
  private target: VoiceInputTarget | null = null;
  private captured: VoiceDraftSnapshot | null = null;
  private unsubscribe: (() => void) | null = null;
  private abort: AbortController | null = null;
  private cleanup: Promise<void> = Promise.resolve();
  private generation = 0;

  constructor(
    private readonly backend: LocalDictationBackend,
    private readonly changed: (state: VoiceInputState) => void,
  ) {}
  get currentState() {
    return this.state;
  }
  get ownerKey() {
    return this.target?.ownerKey ?? null;
  }
  get label() {
    return this.target?.label ?? null;
  }

  async start(target: VoiceInputTarget): Promise<void> {
    if (voiceInputBlocksSubmission(this.state)) return;
    const generation = ++this.generation;
    this.target = target;
    this.unsubscribe = target.subscribe();
    this.captured = target.readDraft();
    const abort = new AbortController();
    this.abort = abort;
    this.setState({ phase: "preparing", error: null, errorAction: null });
    try {
      await this.cleanup;
      if (generation !== this.generation) return;
      if (!this.captured) throw new Error("This draft is no longer available.");
      await this.backend.start(
        {
          phrase: (text) => {
            if (generation === this.generation) this.commit(text);
          },
          ended: () => {
            if (generation === this.generation) {
              if (this.state.phase === "preparing") this.cancel();
              else void this.stop();
            }
          },
          failed: (message) => {
            if (generation === this.generation) this.fail(message);
          },
          preparing: (status) => {
            if (generation === this.generation && this.state.phase === "preparing") {
              this.setState({ phase: "preparing", error: null, errorAction: null, status });
            }
          },
        },
        abort.signal,
      );
      if (generation === this.generation)
        this.setState({ phase: "recording", error: null, errorAction: null });
    } catch (error) {
      if (generation === this.generation) {
        const settings =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "PERMISSION_DENIED";
        this.fail(
          error instanceof Error ? error.message : "Could not start local dictation.",
          settings ? "settings" : "retry",
        );
      }
    }
  }

  async stop(): Promise<void> {
    if (this.state.phase !== "recording") return;
    const generation = this.generation;
    this.setState({ phase: "transcribing", error: null, errorAction: null });
    try {
      // Keep accepting final phrases until the decoder has flushed.
      await this.backend.stop(true);
      if (generation === this.generation) this.finish(IDLE);
    } catch (error) {
      if (generation === this.generation)
        this.fail(error instanceof Error ? error.message : "Could not finish dictation.");
    }
  }

  cancel(ownerKey?: string | null): void {
    if (ownerKey !== undefined && ownerKey !== this.ownerKey) return;
    if (this.state.phase === "idle") return;
    this.finish(IDLE);
  }
  retry() {
    return this.target ? this.start(this.target) : Promise.resolve();
  }
  dispose() {
    this.cancel();
  }
  appMovedToBackground() {
    // Android reports background while its runtime permission activity is open.
    if (this.backend.isRequestingPermission?.()) return;
    if (voiceInputBlocksSubmission(this.state))
      this.fail("Dictation stopped when the app moved to the background.");
  }
  handleRecorderStatus() {
    /* Native capture owns recorder interruptions. */
  }

  private commit(phrase: string) {
    if (!this.captured || !this.target) return;
    const current = this.target.readDraft();
    const result = resolveTranscriptCommit(this.captured, current, phrase, "en");
    if (result.kind === "stale") {
      this.fail("The draft changed. Dictation stopped without overwriting your edits.");
    } else if (result.kind === "commit") {
      this.target.commitDraft(result.text, result.selection);
      const next = this.target.readDraft();
      if (next?.text !== result.text) {
        this.fail("The draft is no longer available.");
        return;
      }
      this.captured = { ...next, selection: result.selection };
    }
  }
  private fail(error: string, errorAction: VoiceInputState["errorAction"] = "retry") {
    this.finish({ phase: "error", error, errorAction });
  }
  private finish(state: VoiceInputState) {
    ++this.generation;
    this.abort?.abort();
    this.abort = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.captured = null;
    this.cleanup = this.cleanup.then(() => this.backend.stop(false)).catch(() => {});
    this.setState(state);
  }
  private setState(state: VoiceInputState) {
    this.state = state;
    this.changed(state);
  }
}
