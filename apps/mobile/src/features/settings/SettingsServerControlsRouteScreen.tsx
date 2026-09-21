import { ScreenScrollView as ScrollView } from "../../components/ScreenScrollView";
import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import {
  type ResponseStreamingMode,
  type ServerSettings,
  type ServerSettingsPatch,
  type ThreadEnvMode,
  PROJECT_SCOPED_SERVER_SETTING_KEYS,
  type ProjectScopedServerSettingKey,
} from "@t3tools/contracts";
import { useRef, useState, type ComponentProps } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RUNTIME_MODE_CHOICES } from "../threads/thread-settings-options";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsScreen } from "./components/SettingsScreen";
import {
  AndroidSettingsEnvironmentFilter,
  SettingsEnvironmentFilterHeader,
} from "./components/SettingsEnvironmentFilterHeader";
import { SettingsChoiceRow } from "./components/SettingsChoiceRow";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsControlRow } from "./components/SettingsControlRow";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";
import { SettingsProjectOverridesSection } from "./components/SettingsProjectOverridesSection";
import { useSettingsEnvironmentFilter } from "./settings-environment-filter";
import {
  planMobileScopedSettingsClear,
  planMobileScopedSettingsPatch,
  resolveMobileSettingsTargets,
  type ScopedMobileSettingsTarget,
} from "./settings-scoped-server";

type SettingsPage = "new-threads" | "source-control" | "agent-behavior" | "maintenance";

const PAGE_TITLES: Record<SettingsPage, string> = {
  "new-threads": "New threads",
  "source-control": "Source control",
  "agent-behavior": "Agent behavior",
  maintenance: "Maintenance",
};

/** Project-scoped keys each group edits; drives "clear project overrides". */
export const SERVER_GROUP_PROJECT_KEYS = {
  newThreads: ["defaultThreadEnvMode", "defaultRuntimeMode"],
  streaming: ["responseStreamingMode"],
  browser: ["enableAgentBrowserAccess"],
  sourceControl: ["defaultAutoPull", "newWorktreesStartFromOrigin"],
  maintenance: ["continueThreadsAfterServerUpdate"],
} as const satisfies Record<string, readonly ProjectScopedServerSettingKey[]>;

const PAGE_PROJECT_KEYS: Record<SettingsPage, readonly ProjectScopedServerSettingKey[]> = {
  "new-threads": SERVER_GROUP_PROJECT_KEYS.newThreads,
  "source-control": SERVER_GROUP_PROJECT_KEYS.sourceControl,
  "agent-behavior": [...SERVER_GROUP_PROJECT_KEYS.streaming, ...SERVER_GROUP_PROJECT_KEYS.browser],
  maintenance: SERVER_GROUP_PROJECT_KEYS.maintenance,
};

const WORKSPACE_CHOICES: ReadonlyArray<{
  readonly mode: ThreadEnvMode;
  readonly label: string;
  readonly description: string;
}> = [
  {
    mode: "local",
    label: "Current checkout",
    description: "Start new threads in the existing workspace.",
  },
  {
    mode: "worktree",
    label: "New worktree",
    description: "Give each new thread a separate checkout.",
  },
];

const STREAMING_CHOICES: ReadonlyArray<{
  readonly mode: ResponseStreamingMode;
  readonly label: string;
  readonly description: string;
}> = [
  {
    mode: "turn",
    label: "After the turn",
    description: "Show the answer when the agent finishes.",
  },
  {
    mode: "paragraph",
    label: "Finished paragraphs",
    description: "Show each paragraph or code block as it completes.",
  },
];

export function SettingsEnvironmentNewThreadsRouteScreen() {
  return <ServerSettingsDetail page="new-threads" />;
}

export function SettingsEnvironmentSourceControlRouteScreen() {
  return <ServerSettingsDetail page="source-control" />;
}

export function SettingsEnvironmentAgentBehaviorRouteScreen() {
  return <ServerSettingsDetail page="agent-behavior" />;
}

export function SettingsEnvironmentMaintenanceRouteScreen() {
  return <ServerSettingsDetail page="maintenance" />;
}

export type ScopedServerSettings = ReturnType<typeof useScopedServerSettings>;

/**
 * Server settings scoped by the settings environment/project filter. One scope
 * shares pending-write state, so a section screen creates one and hands it to
 * every server-backed group it renders.
 */
export function useScopedServerSettings(projectKeys: readonly ProjectScopedServerSettingKey[]) {
  const { selectedTargets, projectGroups, selectedProjectKey } = useSettingsEnvironmentFilter();
  const selectedProject = projectGroups.find((group) => group.key === selectedProjectKey);
  const projectSelected = selectedProjectKey !== null;
  const targets = resolveMobileSettingsTargets(
    selectedTargets,
    projectSelected ? (selectedProject?.members.map((member) => member.project) ?? []) : null,
  );
  const [pendingWrites, setPendingWrites] = useState(0);
  const writeInFlight = useRef(false);
  const [pendingTargets, setPendingTargets] = useState<
    readonly ScopedMobileSettingsTarget[] | null
  >(null);
  const displayTargets = pendingWrites > 0 && pendingTargets !== null ? pendingTargets : targets;
  const hasConnectedSelection = targets.length > 0;
  const reference = displayTargets[0] ?? null;
  const uniform = <K extends keyof ServerSettings>(key: K): ServerSettings[K] | null => {
    if (reference === null) return null;
    const value = reference.settings[key];
    return displayTargets.every((entry) => entry.settings[key] === value) ? value : null;
  };
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "environment settings update",
    reportFailure: true,
  });
  const run = (writes: ReturnType<typeof planMobileScopedSettingsPatch>) => {
    if (writes.length === 0) return;
    writeInFlight.current = true;
    setPendingTargets(targets);
    setPendingWrites((count) => count + 1);
    void Promise.allSettled(
      writes.map((entry) =>
        updateSettings({ environmentId: entry.environmentId, input: { patch: entry.patch } }),
      ),
    ).finally(() => {
      writeInFlight.current = false;
      setPendingTargets(null);
      setPendingWrites((count) => count - 1);
    });
  };
  const write = (patch: ServerSettingsPatch) => {
    if (writeInFlight.current || !hasConnectedSelection) return;
    run(planMobileScopedSettingsPatch(targets, projectSelected, patch));
  };
  const clearProjectOverrides = () => {
    if (writeInFlight.current) return;
    run(planMobileScopedSettingsClear(targets, projectKeys));
  };
  const supportsProjectOverrides = targets.every(
    (target) =>
      target.environment.serverConfig.environment.capabilities.projectSettingsOverrides === true,
  );
  const disabled =
    pendingWrites > 0 || !hasConnectedSelection || (projectSelected && !supportsProjectOverrides);
  const supportsContinuation = targets.every(
    (target) =>
      target.environment.serverConfig.environment.capabilities.threadRestartContinuation === true,
  );
  const disabledFor = (key: string) =>
    disabled ||
    (projectSelected &&
      !PROJECT_SCOPED_SERVER_SETTING_KEYS.includes(
        key as (typeof PROJECT_SCOPED_SERVER_SETTING_KEYS)[number],
      ));

  return {
    ready: hasConnectedSelection && reference !== null,
    projectSelected,
    projectLabel: selectedProject?.label ?? "Unavailable project",
    hasProjectOverrides: targets.some((target) =>
      projectKeys.some((key) => target.sources[key] === "project"),
    ),
    supportsProjectOverrides,
    supportsContinuation,
    pending: pendingWrites > 0,
    uniform,
    write,
    clearProjectOverrides,
    disabledFor,
  };
}

/** The empty-selection message or the project-override banner for a scope. */
export function ServerSettingsScopeNotice(props: { readonly scope: ScopedServerSettings }) {
  const { scope } = props;
  if (!scope.ready) {
    return (
      <Text className="px-2 text-base text-foreground-muted">
        {scope.projectSelected
          ? "Select a project with a checkout on a connected environment."
          : "Connect or select an environment to edit these settings."}
      </Text>
    );
  }
  if (!scope.projectSelected) return null;
  return (
    <SettingsProjectOverridesSection
      projectLabel={scope.projectLabel}
      hasOverrides={scope.hasProjectOverrides}
      supportsOverrides={scope.supportsProjectOverrides}
      pending={scope.pending}
      onClear={scope.clearProjectOverrides}
    />
  );
}

function mixedTrailing(scope: ScopedServerSettings, key: keyof ServerSettings) {
  return !scope.pending && scope.uniform(key) === null ? (
    <MixedValuesLabel projectSelected={scope.projectSelected} />
  ) : null;
}

export function NewThreadsServerSettings(props: { readonly scope: ScopedServerSettings }) {
  const { scope } = props;
  if (!scope.ready) return null;
  return (
    <>
      <SettingsSection
        title="Default workspace"
        trailing={mixedTrailing(scope, "defaultThreadEnvMode")}
      >
        {WORKSPACE_CHOICES.map((choice, index) => (
          <SettingsChoiceRow
            key={choice.mode}
            label={choice.label}
            description={choice.description}
            selected={scope.uniform("defaultThreadEnvMode") === choice.mode}
            separated={index > 0}
            disabled={scope.disabledFor("defaultThreadEnvMode")}
            onPress={() => scope.write({ defaultThreadEnvMode: choice.mode })}
          />
        ))}
      </SettingsSection>
      <SettingsSection
        title="Default permissions"
        trailing={mixedTrailing(scope, "defaultRuntimeMode")}
      >
        {RUNTIME_MODE_CHOICES.map((choice, index) => (
          <SettingsChoiceRow
            key={choice.mode}
            label={choice.label}
            description={choice.description}
            selected={scope.uniform("defaultRuntimeMode") === choice.mode}
            separated={index > 0}
            disabled={scope.disabledFor("defaultRuntimeMode")}
            onPress={() => scope.write({ defaultRuntimeMode: choice.mode })}
          />
        ))}
      </SettingsSection>
    </>
  );
}

export function ResponseStreamingServerSettings(props: {
  readonly scope: ScopedServerSettings;
  readonly title?: string;
}) {
  const { scope } = props;
  if (!scope.ready) return null;
  return (
    <SettingsSection
      title={props.title ?? "Response streaming"}
      trailing={mixedTrailing(scope, "responseStreamingMode")}
    >
      {STREAMING_CHOICES.map((choice, index) => (
        <SettingsChoiceRow
          key={choice.mode}
          label={choice.label}
          description={choice.description}
          selected={scope.uniform("responseStreamingMode") === choice.mode}
          separated={index > 0}
          disabled={scope.disabledFor("responseStreamingMode")}
          onPress={() => scope.write({ responseStreamingMode: choice.mode })}
        />
      ))}
    </SettingsSection>
  );
}

export function AgentBrowserServerSettings(props: { readonly scope: ScopedServerSettings }) {
  const { scope } = props;
  if (!scope.ready) return null;
  return (
    <SettingsSection title="Preview browser">
      <FanoutSwitchRow
        icon="globe"
        label="Agent browser access"
        subtitle="Allow agents to use the in-app preview browser."
        value={scope.uniform("enableAgentBrowserAccess")}
        disabled={scope.disabledFor("enableAgentBrowserAccess")}
        onValueChange={(value) => scope.write({ enableAgentBrowserAccess: value })}
      />
    </SettingsSection>
  );
}

export function SourceControlServerSettings(props: { readonly scope: ScopedServerSettings }) {
  const { scope } = props;
  if (!scope.ready) return null;
  return (
    <>
      <SettingsSection title="Default branch">
        <FanoutSwitchRow
          icon="arrow.down.circle"
          label="Automatically pull"
          subtitle="Keep the default branch current when there are no local changes."
          value={scope.uniform("defaultAutoPull")}
          disabled={scope.disabledFor("defaultAutoPull")}
          onValueChange={(value) => scope.write({ defaultAutoPull: value })}
        />
      </SettingsSection>
      <SettingsSection title="Worktrees">
        <FanoutSwitchRow
          icon="arrow.triangle.branch"
          label="Start from origin"
          subtitle="Base new worktrees on the remote branch."
          value={scope.uniform("newWorktreesStartFromOrigin")}
          disabled={scope.disabledFor("newWorktreesStartFromOrigin")}
          onValueChange={(value) => scope.write({ newWorktreesStartFromOrigin: value })}
        />
      </SettingsSection>
    </>
  );
}

export function MaintenanceServerSettings(props: { readonly scope: ScopedServerSettings }) {
  const { scope } = props;
  if (!scope.ready) return null;
  return (
    <SettingsSection title="Updates">
      <FanoutSwitchRow
        icon="arrow.clockwise"
        label="Check provider updates"
        subtitle={
          scope.projectSelected
            ? "Environment-wide setting. Select All projects to change it."
            : "Check installed provider CLIs for newer versions."
        }
        value={scope.uniform("enableProviderUpdateChecks")}
        disabled={scope.disabledFor("enableProviderUpdateChecks")}
        onValueChange={(value) => scope.write({ enableProviderUpdateChecks: value })}
      />
      <View className="border-t border-border-subtle">
        <FanoutSwitchRow
          icon="arrow.uturn.forward"
          label="Continue after restart"
          subtitle={
            scope.supportsContinuation
              ? "Resume interrupted threads after an update or restart."
              : "Update older servers to control restart continuation."
          }
          value={scope.uniform("continueThreadsAfterServerUpdate")}
          disabled={
            scope.disabledFor("continueThreadsAfterServerUpdate") || !scope.supportsContinuation
          }
          onValueChange={(value) => scope.write({ continueThreadsAfterServerUpdate: value })}
        />
      </View>
    </SettingsSection>
  );
}

function ServerSettingsDetail(props: { readonly page: SettingsPage }) {
  const insets = useSafeAreaInsets();
  const scope = useScopedServerSettings(PAGE_PROJECT_KEYS[props.page]);

  return (
    <>
      <SettingsEnvironmentFilterHeader />
      <SettingsScreen
        title={PAGE_TITLES[props.page]}
        trailing={<AndroidSettingsEnvironmentFilter />}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          className="flex-1"
          contentContainerClassName="gap-6 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
        >
          <ServerSettingsScopeNotice scope={scope} />
          {props.page === "new-threads" ? <NewThreadsServerSettings scope={scope} /> : null}
          {props.page === "source-control" ? <SourceControlServerSettings scope={scope} /> : null}
          {props.page === "agent-behavior" ? (
            <>
              <ResponseStreamingServerSettings scope={scope} />
              <AgentBrowserServerSettings scope={scope} />
            </>
          ) : null}
          {props.page === "maintenance" ? <MaintenanceServerSettings scope={scope} /> : null}
        </ScrollView>
      </SettingsScreen>
    </>
  );
}

function MixedValuesLabel(props: { readonly projectSelected: boolean }) {
  return (
    <Text
      accessibilityLabel={
        props.projectSelected
          ? "Selected project checkouts use different values"
          : "Selected environments use different values"
      }
      className="px-2 text-sm text-foreground-muted android:px-4"
    >
      Mixed
    </Text>
  );
}

function FanoutSwitchRow(props: {
  readonly icon: ComponentProps<typeof SymbolView>["name"];
  readonly label: string;
  readonly subtitle: string;
  readonly value: boolean | null;
  readonly disabled: boolean;
  readonly onValueChange: (value: boolean) => void;
}) {
  if (props.value !== null) {
    return (
      <SettingsSwitchRow
        icon={props.icon}
        label={props.label}
        subtitle={props.subtitle}
        value={props.value}
        disabled={props.disabled}
        onValueChange={props.onValueChange}
      />
    );
  }

  return (
    <SettingsControlRow
      disabled={props.disabled}
      icon={props.icon}
      label={props.label}
      subtitle={props.subtitle}
    >
      <Pressable
        accessibilityLabel={`Set ${props.label} on for selected environments`}
        accessibilityRole="button"
        disabled={props.disabled}
        className="rounded-full bg-subtle px-3 py-2 active:opacity-70"
        onPress={() => props.onValueChange(true)}
      >
        <Text className="text-sm font-t3-medium text-foreground">Mixed · Set on</Text>
      </Pressable>
    </SettingsControlRow>
  );
}
