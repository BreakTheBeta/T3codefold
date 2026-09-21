import { createFileRoute } from "@tanstack/react-router";

import { IntegrationsSettingsPanel } from "../components/settings/IntegrationsSettings";
import { ScheduledTasksSettings } from "../components/settings/ScheduledTasksSettings";
import { validateScheduledTasksSearch } from "../components/settings/scheduledTasksSettings.logic";
import { SettingsPageContainer } from "../components/settings/settingsLayout";
import { SnapShotSettings } from "../components/settings/SnapShotSettings";

function SettingsToolsRoute() {
  const target = Route.useSearch();
  return (
    <SettingsPageContainer>
      <IntegrationsSettingsPanel />
      <SnapShotSettings />
      <ScheduledTasksSettings {...target} />
    </SettingsPageContainer>
  );
}

export const Route = createFileRoute("/settings/tools")({
  validateSearch: validateScheduledTasksSearch,
  component: SettingsToolsRoute,
});
