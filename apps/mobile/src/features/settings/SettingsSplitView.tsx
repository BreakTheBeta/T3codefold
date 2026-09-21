import {
  settingsSectionLabel,
  type SettingsSectionId,
} from "@t3tools/client-runtime/settings-sections";
import { useState } from "react";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { ScreenScrollView as ScrollView } from "../../components/ScreenScrollView";
import { GladosSettingsContent } from "../threads/GladosSettingsScreen";
import { SettingsScopeRow, SettingsSectionList } from "./components/SettingsSectionList";
import { SettingsSectionBody } from "./SettingsSectionBodies";

/**
 * Wide-layout settings: the section list on the left and the selected section on the
 * right, mirroring the web settings sidebar. Rows inside a section still push their
 * detail screens onto the settings stack.
 */
export function SettingsSplitView() {
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<SettingsSectionId>("general");
  const bottomPadding = Math.max(insets.bottom, 18) + 18;

  return (
    <View className="flex-1 flex-row">
      <View className="w-[320px] border-r border-border-subtle">
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          className="flex-1"
          contentContainerClassName="gap-4 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: bottomPadding }}
        >
          <SettingsScopeRow />
          <SettingsSectionList selected={section} onSelect={setSection} />
        </ScrollView>
      </View>
      <View className="flex-1">
        <ScrollView
          // Remount per section so each one opens scrolled to the top.
          key={section}
          contentInsetAdjustmentBehavior="automatic"
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          className="flex-1"
          contentContainerClassName="gap-6 px-6 pt-4"
          contentContainerStyle={{ paddingBottom: bottomPadding }}
        >
          <Text className="px-2 text-2xl font-t3-bold text-foreground">
            {settingsSectionLabel(section)}
          </Text>
          {section === "glados" ? (
            <GladosSettingsContent />
          ) : (
            <SettingsSectionBody section={section} />
          )}
        </ScrollView>
      </View>
    </View>
  );
}
