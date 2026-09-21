import { useNavigation } from "@react-navigation/native";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenScrollView as ScrollView } from "../../components/ScreenScrollView";
import { useAdaptiveWorkspaceLayout } from "../layout/AdaptiveWorkspaceLayout";
import { NativeHeaderToolbar } from "../../native/StackHeader";
import { SettingsScreen } from "./components/SettingsScreen";
import {
  AndroidSettingsEnvironmentFilter,
  SettingsEnvironmentFilterHeader,
} from "./components/SettingsEnvironmentFilterHeader";
import { SettingsScopeRow, SettingsSectionList } from "./components/SettingsSectionList";
import { SettingsSplitView } from "./SettingsSplitView";
import { resolveSettingsSectionRoute } from "./settingsSections.logic";

export function SettingsRouteScreen() {
  const navigation = useNavigation();
  const { layout } = useAdaptiveWorkspaceLayout();
  const content = layout.usesSplitView ? <SettingsSplitView /> : <SettingsIndex />;

  return (
    <>
      {Platform.OS === "ios" && layout.usesSplitView ? (
        <NativeHeaderToolbar placement="left">
          <NativeHeaderToolbar.Button
            accessibilityLabel="Go back"
            icon="chevron.left"
            onPress={() => navigation.goBack()}
          />
        </NativeHeaderToolbar>
      ) : null}
      <SettingsEnvironmentFilterHeader closeSettings />
      {Platform.OS === "android" ? (
        <SettingsScreen title="Settings" trailing={<AndroidSettingsEnvironmentFilter />}>
          {content}
        </SettingsScreen>
      ) : (
        content
      )}
    </>
  );
}

/** Compact settings: scope row, then the shared sections, each pushing its own screen. */
function SettingsIndex() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-4 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <SettingsScopeRow />
        <SettingsSectionList
          onSelect={(section) =>
            navigation.navigate("SettingsSheet", {
              screen: "SettingsContent",
              params: resolveSettingsSectionRoute(section),
            })
          }
        />
      </ScrollView>
    </View>
  );
}
