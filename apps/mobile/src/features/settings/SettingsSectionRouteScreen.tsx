import type { StaticScreenProps } from "@react-navigation/native";
import {
  settingsSectionLabel,
  type SettingsSectionId,
} from "@t3tools/client-runtime/settings-sections";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenScrollView as ScrollView } from "../../components/ScreenScrollView";
import { SettingsScreen } from "./components/SettingsScreen";
import {
  AndroidSettingsEnvironmentFilter,
  SettingsEnvironmentFilterHeader,
} from "./components/SettingsEnvironmentFilterHeader";
import { SettingsSectionBody } from "./SettingsSectionBodies";
import { parseSettingsSectionId } from "./settingsSections.logic";

type Props = StaticScreenProps<{ readonly section: SettingsSectionId }>;

/** Sections whose rows are device-local, so the environment filter means nothing there. */
const UNSCOPED_SECTIONS: ReadonlySet<SettingsSectionId> = new Set([
  "appearance",
  "connections",
  "about",
]);

/** Resolves a (possibly stale) deep-link param to a renderable section. */
export function settingsSectionFromParams(params: Props["route"]["params"] | undefined) {
  const section = parseSettingsSectionId(params?.section) ?? "general";
  // GLaDOS has its own route; a stray `section/glados` link falls back to General.
  return section === "glados" ? "general" : section;
}

export function settingsSectionRouteTitle(params: Props["route"]["params"] | undefined) {
  return settingsSectionLabel(settingsSectionFromParams(params));
}

/** One shared settings section pushed on compact layouts. */
export function SettingsSectionRouteScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const section = settingsSectionFromParams(route.params);
  const scoped = !UNSCOPED_SECTIONS.has(section);

  return (
    <>
      {scoped ? <SettingsEnvironmentFilterHeader /> : null}
      <SettingsScreen
        title={settingsSectionLabel(section)}
        trailing={scoped ? <AndroidSettingsEnvironmentFilter /> : undefined}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          className="flex-1"
          contentContainerClassName="gap-6 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
        >
          <SettingsSectionBody section={section} />
        </ScrollView>
      </SettingsScreen>
    </>
  );
}
