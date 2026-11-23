import { memo, type PointerEventHandler, type ReactElement } from "react";
import { useGT } from "gt-react";
import { MicIcon, MicOffIcon, PhoneOffIcon, Volume2Icon } from "lucide-react";

import {
  type CodexRealtimeVoiceController,
  supportsCodexRealtimeVoiceVersion,
} from "~/hooks/useCodexRealtimeVoice";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const preserveComposerFocus: PointerEventHandler<HTMLElement> = (event) => {
  event.preventDefault();
};

function VoiceButtonTooltip(props: { readonly label: string; readonly children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{props.children}</TooltipTrigger>
      <TooltipPopup side="top">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

const ComposerVoiceControl = memo(function ComposerVoiceControl(props: {
  readonly voice: CodexRealtimeVoiceController;
  readonly disabled: boolean;
  readonly disabledReason?: string;
}) {
  const { voice } = props;
  const gt = useGT();
  const active =
    voice.status === "connecting" ||
    voice.status === "reconnecting" ||
    voice.status === "live" ||
    voice.status === "playback-blocked";

  if (!active) {
    const tooltip = !voice.supported
      ? gt("Codex voice requires microphone and WebRTC support")
      : props.disabled
        ? (props.disabledReason ?? gt("Codex voice is unavailable while this thread connects"))
        : (voice.error ?? gt("Call this thread"));
    return (
      <VoiceButtonTooltip label={tooltip}>
        <Button
          type="button"
          size="icon-sm-pill"
          variant={voice.status === "error" ? "destructive-outline" : "ghost-muted"}
          disabled={props.disabled || !voice.supported}
          onPointerDown={preserveComposerFocus}
          onClick={() => void voice.start()}
          aria-label={gt("Call this thread")}
          data-codex-voice-state={voice.status}
        >
          <MicIcon className="size-4" />
        </Button>
      </VoiceButtonTooltip>
    );
  }

  const label =
    voice.status === "connecting"
      ? gt("Connecting…")
      : voice.status === "reconnecting"
        ? gt("Reconnecting…")
        : voice.status === "playback-blocked"
          ? gt("Audio paused")
          : voice.muted
            ? gt("Muted")
            : gt("Voice live");
  return (
    <div
      className="flex h-8 items-center gap-0.5 rounded-full border border-border/70 bg-muted/50 ps-2 pe-1"
      data-codex-voice-state={voice.status}
    >
      <span
        aria-hidden="true"
        className={cn(
          "me-1 size-1.5 rounded-full",
          voice.status === "connecting"
            ? "bg-muted-foreground"
            : voice.status === "playback-blocked"
              ? "bg-warning"
              : "bg-success",
        )}
      />
      <span className="hidden text-xs text-secondary-label sm:inline">{label}</span>
      {voice.status === "playback-blocked" ? (
        <VoiceButtonTooltip label={voice.error ?? gt("Resume Codex audio")}>
          <Button
            type="button"
            size="icon-xs"
            variant="warning-outline"
            onPointerDown={preserveComposerFocus}
            onClick={() => void voice.resumeAudio()}
            aria-label={gt("Resume Codex audio")}
          >
            <Volume2Icon className="size-3.5" />
          </Button>
        </VoiceButtonTooltip>
      ) : null}
      <VoiceButtonTooltip label={voice.muted ? gt("Unmute microphone") : gt("Mute microphone")}>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost-muted"
          disabled={voice.status === "connecting"}
          onPointerDown={preserveComposerFocus}
          onClick={voice.toggleMuted}
          aria-label={voice.muted ? gt("Unmute microphone") : gt("Mute microphone")}
        >
          {voice.muted ? <MicOffIcon className="size-3.5" /> : <MicIcon className="size-3.5" />}
        </Button>
      </VoiceButtonTooltip>
      <VoiceButtonTooltip label={gt("End Codex voice")}>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost-destructive"
          onPointerDown={preserveComposerFocus}
          onClick={() => void voice.stop()}
          aria-label={gt("End Codex voice")}
        >
          <PhoneOffIcon className="size-3.5" />
        </Button>
      </VoiceButtonTooltip>
    </div>
  );
});

/** True while a Codex call occupies the composer, so it keeps a visible control. */
export function isComposerVoiceCallActive(voice: CodexRealtimeVoiceController): boolean {
  return (
    voice.status === "connecting" || voice.status === "live" || voice.status === "playback-blocked"
  );
}

/** The composer's Codex voice control; Codex builds without realtime voice get a disabled button. */
export function CodexComposerVoiceControl(props: {
  readonly voice: CodexRealtimeVoiceController;
  readonly providerVersion: string | null;
  readonly disabled: boolean;
}) {
  const gt = useGT();
  const versionSupported =
    props.voice.companion || supportsCodexRealtimeVoiceVersion(props.providerVersion);
  return (
    <ComposerVoiceControl
      voice={props.voice}
      disabled={props.disabled || !versionSupported}
      {...(!versionSupported
        ? { disabledReason: gt("Update Codex to 0.145.0 or newer to use voice") }
        : {})}
    />
  );
}
