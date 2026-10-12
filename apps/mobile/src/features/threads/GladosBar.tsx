import { useNavigation } from "@react-navigation/native";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { Pressable } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { useEnvironmentServerConfig } from "../../state/entities";

/** Marks the GLaDOS thread above its feed, with a way to its standing instructions. */
export function GladosBar(props: { environmentId: EnvironmentId; threadId: ThreadId }) {
  const navigation = useNavigation();
  const isGlados =
    useEnvironmentServerConfig(props.environmentId)?.settings.gladosThreadId === props.threadId;
  if (!isGlados) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens GLaDOS settings"
      onPress={() =>
        // "SettingsGlados" is registered in the settings content stack by the settings navigator.
        navigation.navigate("SettingsSheet", {
          screen: "SettingsContent",
          params: { screen: "SettingsGlados", params: { environmentId: props.environmentId } },
        })
      }
      className="flex-row items-center justify-between border-b border-primary/20 bg-primary/5 px-4 py-2"
    >
      <Text className="font-semibold text-primary">♛ GLaDOS</Text>
      <Text className="text-xs text-foreground-muted">Instructions</Text>
    </Pressable>
  );
}
