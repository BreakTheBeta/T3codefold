import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "@t3tools/client-runtime/settings-sections";
import { Platform, Pressable, View } from "react-native";

import { SymbolView } from "../../../components/AppSymbol";
import { AppText as Text } from "../../../components/AppText";
import { MaterialListRow } from "../../../components/MaterialListRow";
import { cn } from "../../../lib/cn";
import { useSettingsEnvironmentFilter } from "../settings-environment-filter";
import { describeSettingsScope, SETTINGS_SECTION_ICONS } from "../settingsSections.logic";
import { SettingsScopeMenu } from "./SettingsEnvironmentFilterHeader";
import { SettingsSection } from "./SettingsSection";

/**
 * The nine shared settings sections, in shared order. Compact layouts show summaries and
 * chevrons; the split layout shows labels with the selected section highlighted.
 */
export function SettingsSectionList(props: {
  readonly selected?: SettingsSectionId;
  readonly onSelect: (section: SettingsSectionId) => void;
}) {
  const compact = props.selected === undefined;
  return (
    <SettingsSection>
      {SETTINGS_SECTIONS.map((section, index) => {
        const selected = section.id === props.selected;
        const icon = (
          <SymbolView
            name={SETTINGS_SECTION_ICONS[section.id]}
            size={Platform.OS === "android" ? 24 : 22}
            tintColorClassName="accent-icon"
            type="monochrome"
            weight="regular"
          />
        );
        if (Platform.OS === "android") {
          return (
            <MaterialListRow
              key={section.id}
              className={selected ? "bg-subtle" : "bg-grouped-card"}
              title={section.label}
              subtitle={compact ? section.summary : undefined}
              leading={icon}
              trailing={compact ? undefined : null}
              accessibilityState={{ selected }}
              onPress={() => props.onSelect(section.id)}
            />
          );
        }
        return (
          <Pressable
            key={section.id}
            accessibilityRole="button"
            accessibilityLabel={section.label}
            accessibilityState={{ selected }}
            onPress={() => props.onSelect(section.id)}
            className={cn(
              "flex-row items-center gap-4 px-4 active:opacity-70",
              compact ? "py-3" : "py-3.5",
              index > 0 && "border-t border-border-subtle",
              selected && "bg-subtle",
            )}
          >
            {icon}
            <View className="min-w-0 flex-1">
              <Text className="text-lg text-foreground" numberOfLines={1}>
                {section.label}
              </Text>
              {compact ? (
                <Text className="text-sm text-foreground-muted" numberOfLines={1}>
                  {section.summary}
                </Text>
              ) : null}
            </View>
            {compact ? (
              <SymbolView
                name="chevron.right"
                size={16}
                tintColorClassName="accent-chevron"
                type="monochrome"
                weight="semibold"
              />
            ) : null}
          </Pressable>
        );
      })}
    </SettingsSection>
  );
}

/** "Editing <scope>": which environments and project server-backed settings apply to. */
export function SettingsScopeRow() {
  const {
    availableTargets,
    selectedTargets,
    selectedIds,
    selectableProjectGroups,
    selectedProjectKey,
  } = useSettingsEnvironmentFilter();
  const scope = describeSettingsScope({
    allSelected: selectedIds === null,
    availableLabels: availableTargets.map((target) => target.label),
    selectedLabels: selectedTargets.map((target) => target.label),
    projectLabel:
      selectedProjectKey === null
        ? null
        : (selectableProjectGroups.find((group) => group.key === selectedProjectKey)?.label ??
          "Unavailable project"),
  });

  return (
    <SettingsSection>
      <SettingsScopeMenu>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Editing ${scope}. Change settings scope`}
          className="flex-row items-center gap-4 p-4 active:opacity-70"
        >
          <SymbolView
            name="link"
            size={Platform.OS === "android" ? 24 : 22}
            tintColorClassName="accent-icon"
            type="monochrome"
            weight="regular"
          />
          <Text className="shrink-0 text-lg text-foreground">Editing</Text>
          <Text
            className="min-w-0 flex-1 text-right text-base text-foreground-muted"
            ellipsizeMode="middle"
            numberOfLines={1}
          >
            {scope}
          </Text>
          <SymbolView
            name="chevron.down"
            size={14}
            tintColorClassName="accent-chevron"
            type="monochrome"
            weight="semibold"
          />
        </Pressable>
      </SettingsScopeMenu>
    </SettingsSection>
  );
}
