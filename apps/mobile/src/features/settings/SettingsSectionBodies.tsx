import { useAuth, useUser } from "@clerk/expo";
import { useNavigation } from "@react-navigation/native";
import type { SettingsSectionId } from "@t3tools/client-runtime/settings-sections";
import { deriveProjectGroupLabel } from "@t3tools/client-runtime/state/project-grouping";
import { Platform } from "react-native";

import { hasCloudPublicConfig } from "../cloud/publicConfig";
import { VoiceSettings } from "../voice-input/VoiceWorkspaceProvider";
import { useSavedRemoteConnections } from "../../state/use-remote-environment-registry";
import { SettingsRow } from "./components/SettingsRow";
import { SettingsSection } from "./components/SettingsSection";
import { AppSettingsSection } from "./SettingsAboutRouteScreen";
import { AppearanceSettingsSections } from "./SettingsAppearanceRouteScreen";
import { FollowUpSettingsSection } from "./SettingsFollowUpRouteScreen";
import { KeyboardSettingsSection } from "./SettingsKeyboardRouteScreen";
import { NotificationSettingsSection } from "./SettingsNotificationsRouteScreen";
import { ProjectGroupingSection } from "./SettingsProjectGroupingRouteScreen";
import {
  AgentBrowserServerSettings,
  MaintenanceServerSettings,
  NewThreadsServerSettings,
  ResponseStreamingServerSettings,
  SERVER_GROUP_PROJECT_KEYS,
  ServerSettingsScopeNotice,
  SourceControlServerSettings,
  useScopedServerSettings,
} from "./SettingsServerControlsRouteScreen";
import { AutoSettleSettingsRows, PlanModeSection } from "./SettingsThreadsRouteScreen";
import { useSettingsEnvironmentFilter } from "./settings-environment-filter";

/**
 * The rows for one shared settings section, without screen chrome. Rendered inside a
 * pushed section screen on phones and in the detail pane of the split layout. GLaDOS
 * owns its own screen and is not rendered here.
 */
export function SettingsSectionBody(props: {
  readonly section: Exclude<SettingsSectionId, "glados">;
}) {
  switch (props.section) {
    case "general":
      return <GeneralSettingsBody />;
    case "appearance":
      return <AppearanceSettingsSections />;
    case "agents":
      return <AgentsSettingsBody />;
    case "threads":
      return <ThreadsSettingsBody />;
    case "git":
      return <GitSettingsBody />;
    case "tools":
      return <ToolsSettingsBody />;
    case "connections":
      return <ConnectionsSettingsBody />;
    case "about":
      return <AppSettingsSection />;
  }
}

const GENERAL_PROJECT_KEYS = [
  ...SERVER_GROUP_PROJECT_KEYS.newThreads,
  ...SERVER_GROUP_PROJECT_KEYS.streaming,
];

function GeneralSettingsBody() {
  const scope = useScopedServerSettings(GENERAL_PROJECT_KEYS);
  return (
    <>
      <ServerSettingsScopeNotice scope={scope} />
      <NewThreadsServerSettings scope={scope} />
      <FollowUpSettingsSection title="While an agent is running" />
      <ResponseStreamingServerSettings scope={scope} />
      <NotificationSettingsSection />
      {Platform.OS === "ios" ? <KeyboardSettingsSection title="Keyboard" /> : null}
      <VoiceSettings />
    </>
  );
}

function AgentsSettingsBody() {
  const scope = useScopedServerSettings(SERVER_GROUP_PROJECT_KEYS.maintenance);
  return (
    <>
      <SettingsSection>
        <SettingsRow icon="chart.bar.xaxis" label="Usage" target="SettingsUsage" />
      </SettingsSection>
      <ServerSettingsScopeNotice scope={scope} />
      <MaintenanceServerSettings scope={scope} />
      <PlanModeSection />
    </>
  );
}

function ThreadsSettingsBody() {
  const { selectedTargets, projectGroups, selectedProjectKey } = useSettingsEnvironmentFilter();
  const selectedProject = projectGroups.find((group) => group.key === selectedProjectKey);
  const scopedProjectMembers =
    selectedProject?.members
      .map((member) => member.project)
      .filter((project) =>
        selectedTargets.some((target) => target.environmentId === project.environmentId),
      ) ?? [];
  const projectLabel =
    scopedProjectMembers.length > 0
      ? deriveProjectGroupLabel({
          representative: scopedProjectMembers[0]!,
          members: scopedProjectMembers,
        })
      : (selectedProject?.label ?? "Unavailable project");

  return (
    <>
      {selectedProjectKey !== null ? (
        <SettingsSection title="Project">
          <SettingsRow
            icon="folder"
            label="Overview"
            value={projectLabel}
            target="SettingsProjectOverview"
          />
        </SettingsSection>
      ) : null}
      <ProjectGroupingSection />
      <AutoSettleSettingsRows />
      <SettingsSection title="Archive">
        <SettingsRow icon="archivebox" label="Archived threads" target="SettingsArchive" />
      </SettingsSection>
    </>
  );
}

function GitSettingsBody() {
  const scope = useScopedServerSettings(SERVER_GROUP_PROJECT_KEYS.sourceControl);
  return (
    <>
      <ServerSettingsScopeNotice scope={scope} />
      <SourceControlServerSettings scope={scope} />
    </>
  );
}

function ToolsSettingsBody() {
  const scope = useScopedServerSettings(SERVER_GROUP_PROJECT_KEYS.browser);
  return (
    <>
      <ServerSettingsScopeNotice scope={scope} />
      <AgentBrowserServerSettings scope={scope} />
      <SettingsSection title="Automations">
        <SettingsRow icon="clock" label="Scheduled tasks" target="SettingsScheduledTasks" />
      </SettingsSection>
    </>
  );
}

function ConnectionsSettingsBody() {
  const { savedConnectionsById } = useSavedRemoteConnections();
  return (
    <SettingsSection>
      {hasCloudPublicConfig() ? <T3AccountRow /> : null}
      <SettingsRow
        icon="desktopcomputer"
        label="Environments"
        value={`${Object.keys(savedConnectionsById).length}`}
        valuePosition="trailing"
        target="SettingsEnvironments"
      />
      <SettingsRow icon="plus" label="Add environment" target="SettingsEnvironmentNew" />
    </SettingsSection>
  );
}

/** Only mounted when Clerk is configured; its hooks need the Clerk provider. */
function T3AccountRow() {
  const navigation = useNavigation();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { user } = useUser();
  const accountLabel = !isLoaded
    ? "Checking"
    : !isSignedIn
      ? "Sign in"
      : (user?.primaryEmailAddress?.emailAddress ?? "Signed in");

  return (
    <SettingsRow
      icon="person.crop.circle"
      label="T3 Account"
      value={accountLabel}
      disabled={!isLoaded}
      onPress={() => navigation.navigate("SettingsSheet", { screen: "SettingsAuth" })}
    />
  );
}
