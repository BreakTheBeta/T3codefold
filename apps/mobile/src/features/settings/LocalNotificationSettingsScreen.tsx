import { useGT } from "gt-react-native";
import { useAtomCommand } from "../../state/use-atom-command";
import { useAtomValue } from "@effect/atom-react";
import {
  reportAtomCommandResult,
  settleAsyncResult,
  settlePromise,
} from "@t3tools/client-runtime/state/runtime";
import * as Notifications from "expo-notifications";
import { AsyncResult } from "effect/reactivity";
import { useEffect, useState } from "react";
import { Alert, AppState, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { runtime } from "../../lib/runtime";
import { mobilePreferencesAtom, saveMobilePreferences } from "../../state/preferences";
import { requestAgentNotificationPermission } from "../agent-awareness/notificationPermissions";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";

/**
 * Fold's Android notification settings for builds without T3 Connect: agent activity is
 * delivered as local notifications while the app stays connected in the background.
 */
export function LocalNotificationSettingsScreen() {
  const gt = useGT();
  const insets = useSafeAreaInsets();
  return (
    <SettingsScreen title={gt("Notifications")}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <LocalNotificationSettingsSection />
      </ScrollView>
    </SettingsScreen>
  );
}

function LocalNotificationSettingsSection() {
  const gt = useGT();
  const preferences = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomCommand(saveMobilePreferences);
  const [granted, setGranted] = useState(false);
  const [busy, setBusy] = useState(true);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads native notification permission on mount and on every foreground
  useEffect(() => {
    const refresh = async () => {
      const result = await settlePromise(() => Notifications.getPermissionsAsync());
      if (result._tag === "Success") setGranted(result.value.granted);
      else reportAtomCommandResult(result, { label: "notification permission refresh" });
      setBusy(false);
    };
    void refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => subscription.remove();
  }, []);
  const changeEnabled = async (enabled: boolean) => {
    if (!enabled) {
      void savePreferences({ notificationsEnabled: false });
      return;
    }
    setBusy(true);
    const result = await settleAsyncResult(() =>
      runtime.runPromiseExit(requestAgentNotificationPermission),
    );
    setBusy(false);
    if (result._tag === "Failure") {
      reportAtomCommandResult(result, { label: "notification permission request" });
      return;
    }
    const allowed = result.value.type === "granted";
    setGranted(allowed);
    if (allowed) void savePreferences({ notificationsEnabled: true });
    else if (result.value.type === "denied" && !result.value.canAskAgain) {
      Alert.alert(
        gt("Notifications disabled"),
        gt("Open system Settings to enable notifications."),
        [
          { text: gt("Cancel"), style: "cancel" },
          { text: gt("Open Settings"), onPress: () => void Linking.openSettings() },
        ],
      );
    }
  };
  return (
    <SettingsSection title={gt("Agent activity")}>
      <SettingsSwitchRow
        icon="bell.badge"
        label={gt("Device Notifications")}
        subtitle={gt("While connected in the background")}
        disabled={busy || !AsyncResult.isSuccess(preferences)}
        value={
          granted &&
          AsyncResult.isSuccess(preferences) &&
          preferences.value.notificationsEnabled === true
        }
        onValueChange={(enabled) => void changeEnabled(enabled)}
      />
    </SettingsSection>
  );
}
