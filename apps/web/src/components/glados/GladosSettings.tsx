import { useNavigate } from "@tanstack/react-router";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";

import { useEnvironmentSettings, useUpdateEnvironmentSettings } from "../../hooks/useSettings";
import { useThreadShell } from "../../state/entities";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "../settings/settingsLayout";
import { useSettingsScope } from "../settings/SettingsScopeContext";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

/** GLaDOS for the selected environment (/settings/glados): which thread it is, and what it knows. */
export function GladosSettingsPanel() {
  const { environment } = useSettingsScope();
  return (
    <SettingsPageContainer>
      {environment ? (
        <GladosSettings key={environment.environmentId} environmentId={environment.environmentId} />
      ) : (
        <SettingsSection title="GLaDOS">
          <SettingsRow title="Choose a machine to set up GLaDOS." />
        </SettingsSection>
      )}
    </SettingsPageContainer>
  );
}

function GladosSettings({ environmentId }: { environmentId: EnvironmentId }) {
  const navigate = useNavigate();
  const settings = useEnvironmentSettings(environmentId);
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const thread = useThreadShell(
    settings.gladosThreadId ? scopeThreadRef(environmentId, settings.gladosThreadId) : null,
  );
  // A deleted thread drops out of the shells, so a stale setting reads as no GLaDOS.
  const threadId = thread?.id ?? null;

  return (
    <SettingsSection title="GLaDOS">
      <SettingsRow
        title={threadId ? thread?.title : "No GLaDOS thread"}
        description={
          threadId
            ? "Your coordinator on this machine. It plans with you and hands work to delegated agents."
            : 'Open any thread and choose "Make this thread GLaDOS" from the command palette. Its model and permissions are the thread\'s own.'
        }
        control={
          threadId ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateSettings({ gladosThreadId: null })}
              >
                Stop using as GLaDOS
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  void navigate({
                    to: "/$environmentId/$threadId",
                    params: { environmentId, threadId },
                  })
                }
              >
                Open GLaDOS
              </Button>
            </>
          ) : null
        }
      />
      <SettingsRow
        title="Standing instructions"
        description="Priorities, limits and what good work looks like. GLaDOS reads these on every turn."
      >
        <div className="mt-3 max-w-2xl pb-3.5">
          <Textarea
            key={settings.gladosInstructions}
            aria-label="GLaDOS standing instructions"
            rows={6}
            defaultValue={settings.gladosInstructions}
            placeholder="Billing reliability first. Never merge without a passing test run."
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value !== settings.gladosInstructions)
                updateSettings({ gladosInstructions: value });
            }}
          />
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
