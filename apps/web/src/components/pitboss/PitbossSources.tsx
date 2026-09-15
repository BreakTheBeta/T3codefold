import { useEffect, useState } from "react";
import type {
  EnvironmentId,
  PitbossSourceConfig,
  PitbossSourceRequest,
  ProjectId,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";

export function PitbossSources({
  environmentId,
  projectId,
}: {
  environmentId: EnvironmentId;
  projectId: ProjectId;
}) {
  const sources = useEnvironmentQuery(
    serverEnvironment.pitbossSources({ environmentId, input: {} }),
  );
  const mutate = useAtomCommand(serverEnvironment.pitbossSourceCommand, {
    label: "GLaDOS task sources",
  });
  const refreshSources = sources.refresh;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    refreshSources();
    const timer = setInterval(refreshSources, 15000);
    return () => clearInterval(timer);
  }, [open, refreshSources]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<PitbossSourceConfig["kind"]>("vikunja");
  const [id, setId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [scope, setScope] = useState("");
  const [token, setToken] = useState("");
  const execute = async (input: PitbossSourceRequest) => {
    setBusy(true);
    setError(null);
    const result = await mutate({ environmentId, input });
    setBusy(false);
    sources.refresh();
    if (result._tag === "Failure") {
      setError(String(squashAtomCommandFailure(result)));
      return;
    }
    setToken("");
    sources.refresh();
  };
  return (
    <details
      className="mt-3 rounded-xl border border-border bg-background p-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-semibold">Task sources</summary>
      <p className="my-2 text-xs text-muted-foreground">
        Imports become candidates for review. Tracker status and accepted T3 work stay separate.
        Connections refresh every minute while enabled.
      </p>
      {(error || sources.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? sources.error}
        </p>
      )}
      {sources.data?.sources.map((source) => (
        <div
          key={source.config.id}
          className="my-2 flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-xs"
        >
          <span className="flex-1">
            {source.config.id} · {source.config.kind} ·{" "}
            {source.error ?? (source.lastSyncAt ? `Last sync ${source.lastSyncAt}` : "Not synced")}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || !source.config.enabled}
            onClick={() => void execute({ type: "sync", id: source.config.id })}
          >
            Sync now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void execute({
                type: "configure",
                config: { ...source.config, enabled: !source.config.enabled },
              })
            }
          >
            {source.config.enabled ? "Disable" : "Enable"}
          </Button>
        </div>
      ))}
      <details className="mt-3" open={!sources.data?.sources.length}>
        <summary className="cursor-pointer text-xs font-medium">Add or update a source</summary>
        <form
          className="mt-3 grid gap-2 text-xs md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void execute({
              type: "configure",
              config: {
                id,
                kind,
                baseUrl,
                tenantId: new URL(baseUrl).origin,
                remoteProjectId: scope,
                projectId,
                enabled: true,
              },
              token,
            });
          }}
        >
          <label className="grid gap-1">
            Tracker
            <select
              value={kind}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "jira" || value === "linear" || value === "vikunja") setKind(value);
              }}
              className="rounded border border-border bg-background p-2"
            >
              <option value="vikunja">Vikunja</option>
              <option value="jira">Jira</option>
              <option value="linear">Linear</option>
            </select>
          </label>
          <label className="grid gap-1">
            Connection name
            <input
              required
              pattern={"[a-zA-Z0-9_\\-]{1,80}"}
              value={id}
              onChange={(event) => setId(event.target.value)}
              className="rounded border border-border bg-background p-2"
            />
          </label>
          <label className="grid gap-1">
            Server URL
            <input
              required
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder={kind === "linear" ? "https://api.linear.app" : "http://localhost:18456"}
              className="rounded border border-border bg-background p-2"
            />
          </label>
          <label className="grid gap-1">
            {kind === "linear" ? "Team ID" : "Project ID or key"}
            <input
              required
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              className="rounded border border-border bg-background p-2"
            />
          </label>
          <label className="grid gap-1">
            Read credential
            <input
              required
              type="password"
              autoComplete="new-password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="rounded border border-border bg-background p-2"
            />
          </label>
          <div className="flex items-end">
            <Button size="sm" type="submit" disabled={busy}>
              Connect source
            </Button>
          </div>
        </form>
      </details>
    </details>
  );
}
