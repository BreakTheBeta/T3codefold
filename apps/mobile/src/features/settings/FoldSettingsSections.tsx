import { useGT } from "gt-react-native";
import { useAtomCommand } from "../../state/use-atom-command";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { Platform } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { mobilePreferencesAtom, saveMobilePreferences } from "../../state/preferences";
import { ListChoiceRow as SettingsChoiceRow } from "../../components/ui/ListChoiceRow";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";

function useMobilePreferenceSettings() {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomCommand(saveMobilePreferences);
  const preferencesReady = AsyncResult.isSuccess(preferencesResult) && !preferencesResult.waiting;
  const preferences = AsyncResult.isSuccess(preferencesResult) ? preferencesResult.value : null;
  return { preferences, preferencesReady, savePreferences };
}

/** Android Vim navigation toggle and key reference, under Settings > Keyboard. */
export function VimNavigationSettings() {
  const gt = useGT();
  const { preferences, preferencesReady, savePreferences } = useMobilePreferenceSettings();
  if (Platform.OS !== "android") return null;
  const vimNavigationEnabled = preferences?.vimNavigationEnabled === true;
  return (
    <>
      <SettingsSection title={gt("Navigation")}>
        <SettingsSwitchRow
          icon="keyboard"
          label={gt("Vim navigation")}
          subtitle={gt(
            "Move between panes and threads with Vim keys when no text field is focused.",
          )}
          disabled={!preferencesReady}
          value={vimNavigationEnabled}
          onValueChange={(enabled) => void savePreferences({ vimNavigationEnabled: enabled })}
        />
      </SettingsSection>
      {vimNavigationEnabled ? (
        <Text className="px-2 text-sm text-foreground-muted">
          {gt(
            "{move} move · {jump} jump · {open} opens · {write} writes · {leave} leaves the composer · {switchPane} switches pane · {maximize} maximizes · {search} searches · {commands} opens commands",
            {
              move: "j/k",
              jump: "gg/G",
              open: "Enter",
              write: "i",
              leave: "Esc",
              switchPane: "Ctrl-w h/l",
              maximize: "Ctrl-w o",
              search: "/",
              commands: "Space",
            },
          )}
        </Text>
      ) : null}
    </>
  );
}

/** Android foldable workspace gestures and pane sizes, under Settings > Project grouping. */
export function WorkspaceGestureSettings() {
  const gt = useGT();
  const { preferences, preferencesReady, savePreferences } = useMobilePreferenceSettings();
  if (Platform.OS !== "android") return null;
  return (
    <SettingsSection title={gt("Workspace gestures")}>
      <SettingsSwitchRow
        icon="sidebar.left"
        label={gt("Thumb navigation")}
        subtitle={gt(
          "Use the bottom handle: swipe sideways through recent threads, up for the sidebar, down for the inspector.",
        )}
        disabled={!preferencesReady}
        value={preferences?.workspaceThumbGesturesEnabled === true}
        onValueChange={(enabled) =>
          void savePreferences({ workspaceThumbGesturesEnabled: enabled })
        }
      />
      <SettingsChoiceRow
        label={gt("Reset pane sizes")}
        description={gt("Return remembered workspace splits to the fold or default width.")}
        selected={false}
        separated
        disabled={!preferencesReady}
        onPress={() =>
          void savePreferences({
            workspaceInspectorRatios: {},
            workspaceInspectorWidth: undefined,
          })
        }
      />
    </SettingsSection>
  );
}
