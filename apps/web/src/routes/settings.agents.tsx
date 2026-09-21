import { createFileRoute } from "@tanstack/react-router";
import { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";

import { ProviderSettings } from "../components/settings/ProviderSettingsPanel";
import { AgentDefaultsSettingsSections } from "../components/settings/SettingsPanels";
import { SettingsPageContainer } from "../components/settings/settingsLayout";
import { useSettingsScope } from "../components/settings/SettingsScopeContext";

/**
 * Providers are machine state, so the provider list shows one environment at
 * a time: the chosen one, or the representative of the selection. A project
 * crumb narrows the candidates to the environments that project is
 * registered on. The agent-wide rows below fan out like everywhere else.
 */
function SettingsAgentsRoute() {
  const target = Route.useSearch();
  const { environment, scope } = useSettingsScope();
  return (
    <SettingsPageContainer width="wide" className="@container/providers gap-8">
      {environment ? (
        <ProviderSettings
          environmentId={environment.environmentId}
          {...(target.instanceId ? { instanceId: target.instanceId } : {})}
          scoped
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {scope.kind === "environment"
            ? `Reconnect ${scope.label} to set up its providers.`
            : "Connect an environment to set up its providers."}
        </p>
      )}
      <AgentDefaultsSettingsSections />
    </SettingsPageContainer>
  );
}

export const Route = createFileRoute("/settings/agents")({
  validateSearch: (raw: Record<string, unknown>) => ({
    ...(typeof raw.environmentId === "string" && raw.environmentId.trim()
      ? { environmentId: EnvironmentId.make(raw.environmentId) }
      : {}),
    ...(typeof raw.instanceId === "string" && raw.instanceId.trim()
      ? { instanceId: ProviderInstanceId.make(raw.instanceId) }
      : {}),
  }),
  component: SettingsAgentsRoute,
});
