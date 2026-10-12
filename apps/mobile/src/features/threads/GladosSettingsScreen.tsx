import { type StaticScreenProps, useNavigation } from "@react-navigation/native";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";
import { useRef, useState } from "react";
import { Platform, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { ScreenScrollView as ScrollView } from "../../components/ScreenScrollView";
import { useEnvironments } from "../../state/environments";
import {
  useEnvironmentServerConfig,
  useProjects,
  useThreadShell,
  useThreadShells,
} from "../../state/entities";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsActionRow } from "../settings/components/SettingsActionRow";
import { SettingsChoiceRow } from "../settings/components/SettingsChoiceRow";
import { SettingsScreen } from "../settings/components/SettingsScreen";
import { SettingsSection } from "../settings/components/SettingsSection";

type GladosSettingsParams = {
  readonly environmentId?: EnvironmentId;
};

/**
 * Settings stack route (`SettingsGlados`). Threads link here with their environment; without
 * a route (e.g. hosted in a pane) it falls back to the first connected environment.
 */
export function GladosSettingsRouteScreen({
  route,
}: Partial<StaticScreenProps<GladosSettingsParams | undefined>>) {
  const insets = useSafeAreaInsets();
  return (
    <SettingsScreen title="GLaDOS">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <GladosSettingsContent {...route?.params} />
      </ScrollView>
    </SettingsScreen>
  );
}

/** The GLaDOS settings body, without its own scroll container, for routes and split panes. */
export function GladosSettingsContent(props: GladosSettingsParams) {
  const navigation = useNavigation();
  const { environments } = useEnvironments();
  const connectedEnvironments = environments.filter(
    (environment) => environment.connection.phase === "connected",
  );
  const [pickedEnvironmentId, setPickedEnvironmentId] = useState<EnvironmentId | null>(null);
  const environmentId =
    props.environmentId ??
    pickedEnvironmentId ??
    connectedEnvironments[0]?.environmentId ??
    environments[0]?.environmentId ??
    null;
  const connected =
    environments.find((entry) => entry.environmentId === environmentId)?.connection.phase ===
    "connected";
  const settings = useEnvironmentServerConfig(environmentId)?.settings ?? null;
  const thread = useThreadShell(
    environmentId && settings?.gladosThreadId
      ? scopeThreadRef(environmentId, settings.gladosThreadId)
      : null,
  );
  const projects = useProjects();
  const recentThreads = useThreadShells()
    .filter((entry) => entry.environmentId === environmentId && entry.archivedAt === null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 8);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, "GLaDOS settings");
  const instructionsEdited = useRef(false);
  const disabled = !connected || settings === null;

  return (
    <View className="gap-6">
      {!props.environmentId && connectedEnvironments.length > 1 ? (
        <SettingsSection title="Environment">
          {connectedEnvironments.map((entry, index) => (
            <SettingsChoiceRow
              key={entry.environmentId}
              label={entry.label}
              description={entry.displayUrl ?? "Each environment has its own GLaDOS."}
              selected={entry.environmentId === environmentId}
              separated={index > 0}
              disabled={false}
              onPress={() => setPickedEnvironmentId(entry.environmentId)}
            />
          ))}
        </SettingsSection>
      ) : null}

      <SettingsSection>
        <View className="gap-1 p-4">
          <Text className="text-lg font-t3-medium text-foreground">
            {thread ? thread.title : "No GLaDOS thread"}
          </Text>
          <Text className="text-sm text-foreground-muted">
            {thread
              ? "Your coordinator on this machine. It plans with you and hands work to delegated agents."
              : "Choose a thread to coordinate your work. Its model and permissions are the thread's own."}
          </Text>
        </View>
        {thread && environmentId ? (
          <>
            <Separator />
            <SettingsActionRow
              icon="arrow.up.right"
              label="Open GLaDOS"
              onPress={() => navigation.navigate("Thread", { environmentId, threadId: thread.id })}
            />
            <Separator />
            <SettingsActionRow
              icon="xmark"
              label="Stop using as GLaDOS"
              disabled={disabled}
              onPress={() =>
                void updateSettings({ environmentId, input: { patch: { gladosThreadId: null } } })
              }
            />
          </>
        ) : null}
      </SettingsSection>

      {!thread && environmentId && recentThreads.length > 0 ? (
        <SettingsSection title="Make a thread GLaDOS">
          {recentThreads.map((entry, index) => (
            <SettingsChoiceRow
              key={entry.id}
              label={entry.title}
              description={
                projects.find((project) => project.id === entry.projectId)?.title ?? "Thread"
              }
              selected={false}
              separated={index > 0}
              disabled={disabled}
              onPress={() =>
                void updateSettings({
                  environmentId,
                  input: { patch: { gladosThreadId: entry.id } },
                })
              }
            />
          ))}
        </SettingsSection>
      ) : null}

      <SettingsSection title="Standing instructions">
        <View className="gap-2 p-4">
          <Text className="text-sm text-foreground-muted">
            Priorities, limits and what good work looks like. GLaDOS reads these on every turn.
          </Text>
          <TextInput
            key={`${environmentId}:${settings?.gladosInstructions}`}
            accessibilityLabel="GLaDOS standing instructions"
            defaultValue={settings?.gladosInstructions ?? ""}
            onChangeText={() => {
              instructionsEdited.current = true;
            }}
            onEndEditing={(event) => {
              const value = event.nativeEvent.text.trim();
              if (
                environmentId &&
                !disabled &&
                instructionsEdited.current &&
                value !== settings.gladosInstructions
              )
                void updateSettings({
                  environmentId,
                  input: { patch: { gladosInstructions: value } },
                });
              instructionsEdited.current = false;
            }}
            editable={!disabled}
            multiline
            scrollEnabled
            textAlignVertical="top"
            placeholder="Billing reliability first. Never merge without a passing test run."
            placeholderTextColorClassName="accent-foreground-muted"
            className="max-h-48 min-h-24 font-sans text-base text-foreground"
          />
        </View>
      </SettingsSection>
    </View>
  );
}

function Separator() {
  return <View className="h-px bg-border-subtle" />;
}
