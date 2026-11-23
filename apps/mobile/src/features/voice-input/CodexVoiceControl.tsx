import { supportsCodexRealtimeVoiceVersion } from "@t3tools/client-runtime/realtime-voice";
import type { EnvironmentId, ServerProvider, ThreadId } from "@t3tools/contracts";
import { useEffect } from "react";
import { Alert, Platform, View } from "react-native";
import { AppText } from "../../components/ui/AppText";
import { ComposerActionButton } from "../../components/ComposerToolbar";
import type { RemoteClientConnectionState } from "../../lib/connection";
import { useCodexRealtimeVoice } from "./useCodexRealtimeVoice";
import { useGlobalVoiceInput } from "./VoiceInputProvider";
import { useVoiceWorkspace } from "./VoiceWorkspaceProvider";
import { useGT } from "gt-react-native";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import { useEnvironmentScopeDenied } from "../../state/session";

/**
 * The thread composer's Codex realtime voice button. Null for non-Codex threads and while a call
 * is live, since a live call's controls move to the workspace voice panel.
 */
export function useCodexVoiceComposerControl(input: {
  readonly providerStatus: ServerProvider | null;
  readonly title: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly connectionState: RemoteClientConnectionState;
}) {
  const gt = useGT();
  // Any dictation, here or on another screen, holds the microphone a call needs.
  const dictationBusy = useGlobalVoiceInput().isBusy;
  const operateDenied = useEnvironmentScopeDenied(
    input.environmentId,
    AuthOrchestrationOperateScope,
  );
  const { state } = useVoiceWorkspace();
  const destination = state.targets.find(
    (target) => target.environmentId === input.environmentId && target.threadId === input.threadId,
  );
  const available = destination !== undefined;
  const codexVoice = useCodexRealtimeVoice({
    title: input.title,
    environmentId: input.environmentId,
    threadId: input.threadId,
    enabled: available && !operateDenied && input.connectionState === "connected" && !dictationBusy,
  });
  const codexVoiceActive = codexVoice.status !== "idle" && codexVoice.status !== "error";
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- shows a native alert when the voice session reports a new error
  useEffect(() => {
    if (codexVoice.error) Alert.alert(gt("Codex voice"), codexVoice.error);
  }, [codexVoice.error, gt]);
  return available && !codexVoiceActive ? (
    <CodexVoiceControl
      voice={codexVoice}
      disabled={
        dictationBusy ||
        operateDenied ||
        input.connectionState !== "connected" ||
        (!destination.companion &&
          !supportsCodexRealtimeVoiceVersion(input.providerStatus?.version ?? ""))
      }
    />
  ) : null;
}

export function CodexVoiceControl({
  voice,
  disabled,
}: {
  voice: ReturnType<typeof useCodexRealtimeVoice>;
  disabled: boolean;
}) {
  const gt = useGT();
  const active = ["connecting", "reconnecting", "live"].includes(voice.status);
  const label =
    voice.status === "connecting"
      ? gt("Connecting…")
      : voice.status === "reconnecting"
        ? gt("Reconnecting…")
        : voice.muted
          ? gt("Mic muted")
          : gt("Voice live");
  return (
    <View className="shrink flex-col gap-1">
      {active ? (
        <>
          <AppText accessibilityLiveRegion="polite" className="text-xs text-foreground-muted">
            {label} · {voice.audioRoute}
          </AppText>
          <View className="flex-row items-center gap-1">
            <ComposerActionButton
              accessibilityLabel={voice.muted ? gt("Unmute Codex voice") : gt("Mute Codex voice")}
              icon={voice.muted ? "mic.slash" : "mic"}
              disabled={voice.status === "connecting"}
              onPress={voice.toggleMuted}
            />
            <ComposerActionButton
              accessibilityLabel={gt("Choose call audio output")}
              icon={voice.speaker ? "speaker.wave.2.fill" : "iphone"}
              disabled={voice.status === "connecting"}
              onPress={() => {
                void voice.chooseAudioOutput();
              }}
            />
            {Platform.OS === "android" ? (
              <ComposerActionButton
                accessibilityLabel={gt("Increase call volume")}
                icon="plus"
                onPress={voice.volumeUp}
              />
            ) : null}
            <ComposerActionButton
              accessibilityLabel={gt("End Codex voice")}
              icon="phone.down.fill"
              variant="danger"
              onPress={voice.stop}
            />
          </View>
          {voice.audioError ? (
            <AppText className="text-xs text-foreground-muted">{voice.audioError}</AppText>
          ) : null}
        </>
      ) : (
        <View className="flex-row items-center gap-1">
          <ComposerActionButton
            accessibilityLabel={
              voice.status === "error" ? gt("Reconnect voice call") : gt("Call this thread")
            }
            icon="waveform"
            disabled={disabled}
            onPress={voice.start}
          />
          {voice.status === "error" ? (
            <AppText className="text-xs text-foreground-muted">{gt("Call ended · Retry")}</AppText>
          ) : null}
        </View>
      )}
    </View>
  );
}
