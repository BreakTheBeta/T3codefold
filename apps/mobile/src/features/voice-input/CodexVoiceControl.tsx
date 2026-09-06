import { View } from "react-native";
import { AppText } from "../../components/AppText";
import { ComposerActionButton } from "../../components/ComposerToolbar";
import type { useCodexRealtimeVoice } from "./useCodexRealtimeVoice";

export function CodexVoiceControl({
  voice,
  disabled,
}: {
  voice: ReturnType<typeof useCodexRealtimeVoice>;
  disabled: boolean;
}) {
  const active = voice.status === "connecting" || voice.status === "live";
  return (
    <View className="flex-row items-center gap-1">
      {active ? (
        <>
          <AppText accessibilityLiveRegion="polite" className="text-xs text-foreground-muted">
            {voice.status === "connecting" ? "Connecting…" : voice.muted ? "Muted" : "Voice live"}
          </AppText>
          <ComposerActionButton
            accessibilityLabel={voice.muted ? "Unmute Codex voice" : "Mute Codex voice"}
            icon={voice.muted ? "mic.slash" : "mic"}
            disabled={voice.status === "connecting"}
            onPress={voice.toggleMuted}
          />
          <ComposerActionButton
            accessibilityLabel="End Codex voice"
            icon="phone.down.fill"
            variant="danger"
            onPress={voice.stop}
          />
        </>
      ) : (
        <ComposerActionButton
          accessibilityLabel="Talk to Codex"
          icon="waveform"
          disabled={disabled}
          onPress={voice.start}
        />
      )}
    </View>
  );
}
