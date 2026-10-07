import { Alert } from "react-native";
import { getLocalDictationBackend } from "../../native/localDictation";
import { SettingsRow } from "../settings/components/SettingsRow";
import { SettingsSection } from "../settings/components/SettingsSection";
import { useGlobalVoiceInput } from "./VoiceInputProvider";

export function LocalDictationSettings() {
  const voice = useGlobalVoiceInput();
  const backend = getLocalDictationBackend();
  if (!backend) return null;
  return (
    <SettingsSection title="On-device dictation">
      <SettingsRow
        icon="mic"
        label="Speech model & microphone"
        value="English · phone or headset microphone"
        disabled={voice.isBusy}
        onPress={() => {
          void backend
            .configure()
            .catch((error: unknown) =>
              Alert.alert(
                "Dictation setup",
                error instanceof Error ? error.message : "Could not open setup.",
              ),
            );
        }}
      />
    </SettingsSection>
  );
}
