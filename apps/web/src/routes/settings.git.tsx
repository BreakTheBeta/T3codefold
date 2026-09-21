import { createFileRoute } from "@tanstack/react-router";

import { SettingsPageContainer } from "../components/settings/settingsLayout";
import { SourceControlSettings } from "../components/settings/SourceControlSettings";
import { StorageWorktreeSettings } from "../components/settings/StorageSettings";

function SettingsGitRoute() {
  return (
    <SettingsPageContainer>
      <SourceControlSettings />
      <StorageWorktreeSettings />
    </SettingsPageContainer>
  );
}

export const Route = createFileRoute("/settings/git")({
  component: SettingsGitRoute,
});
