import { useMemo, useState } from "react";
import { ArrowUpDownIcon, PlusIcon, Trash2Icon, ServerIcon } from "lucide-react";
import type { EnvironmentId, ModelSelection, PitbossBrief } from "@t3tools/contracts";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useProjects, useServerConfigs } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  isProviderInstancePickerReady,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import { getAppModelOptionsForInstance } from "../../modelSelection";
import { TraitsPicker, shouldRenderTraitsControls } from "../chat/TraitsPicker";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Textarea } from "../ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
        items={options}
      >
        <SelectTrigger aria-label={label} className="h-9 w-full sm:h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </div>
  );
}

export function BriefForm({
  environmentId,
  brief,
  busy,
  error,
  onSave,
  onCancel,
}: {
  environmentId: EnvironmentId;
  brief: PitbossBrief;
  busy: boolean;
  error: string | null;
  onSave: (brief: PitbossBrief) => Promise<void>;
  onCancel: () => void;
}) {
  const configs = useServerConfigs();
  const config = configs.get(environmentId);
  const settings = useEnvironmentSettings(environmentId);
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const peers = useEnvironmentQuery(serverEnvironment.pitbossPeers({ environmentId, input: {} }));
  const [priorities, setPriorities] = useState(brief.priorities);
  const [quality, setQuality] = useState(brief.quality);
  const [modelGuidance, setModelGuidance] = useState(
    brief.modelGuidance ??
      "Use the default worker for well-scoped implementation and verification. Choose the alternative when the task needs a different strength, deeper investigation, or recovery from a blocker. Explain the choice and keep the verification standard the same.",
  );
  const [projectIds, setProjectIds] = useState(brief.projectIds);
  const [managedPeerIds, setManagedPeerIds] = useState(brief.managedPeerIds);
  const [models, setModels] = useState<ReadonlyArray<ModelSelection>>([
    brief.workerModel,
    ...(brief.alternateWorkerModel ? [brief.alternateWorkerModel] : []),
  ]);
  const [maxWorkers, setMaxWorkers] = useState(brief.maxWorkers);
  const [maxAttempts, setMaxAttempts] = useState(brief.maxAttempts);
  const [workerRuntimeMode, setWorkerRuntimeMode] = useState(
    brief.workerRuntimeMode ?? "approval-required",
  );
  const entries = useMemo(
    () =>
      config
        ? sortProviderInstanceEntries(
            applyProviderInstanceSettings(
              deriveProviderInstanceEntries(config.providers),
              config.settings,
            ),
          )
        : [],
    [config],
  );
  const modelOptions = useMemo(
    () =>
      new Map(
        entries.map((entry) => {
          const options = getAppModelOptionsForInstance(settings, entry, null);
          for (const saved of models.filter((model) => model.instanceId === entry.instanceId)) {
            if (!options.some((option) => option.slug === saved.model))
              options.push({
                slug: saved.model,
                name: saved.model,
                isCustom: false,
                isUnavailable: true,
              });
          }
          return [entry.instanceId, options];
        }),
      ),
    [entries, settings, models],
  );
  const available = entries.flatMap((entry) =>
    isProviderInstancePickerReady(entry)
      ? (modelOptions.get(entry.instanceId) ?? [])
          .filter((model) => !model.isUnavailable)
          .map((model) => ({ instanceId: entry.instanceId, model: model.slug }))
      : [],
  );
  const nextModel =
    available.find(
      (candidate) =>
        !models.some(
          (model) => model.instanceId === candidate.instanceId && model.model === candidate.model,
        ),
    ) ?? available[0];
  const selectedPeerIds = managedPeerIds ?? peers.data?.peers.map((peer) => peer.config.id) ?? [];
  const moveModel = (index: number, direction: number) =>
    setModels((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  return (
    <form
      className="space-y-6 rounded-xl border border-border bg-background p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          ...brief,
          priorities,
          quality,
          projectIds,
          managedPeerIds,
          workerModel: models[0]!,
          alternateWorkerModel: models[1],
          modelGuidance,
          maxWorkers,
          maxAttempts,
          workerRuntimeMode,
        });
      }}
    >
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div>
        <h3 className="font-semibold">Give GLaDOS a brief</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose where it works, the models it uses, and what a good result looks like.
        </p>
      </div>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Priorities
          <Textarea
            className="[&>textarea]:h-24 [&>textarea]:min-h-24 [&>textarea]:field-sizing-fixed"
            required
            value={priorities}
            onChange={(event) => setPriorities(event.target.value)}
            placeholder="What matters most? What should wait?"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Quality expectations
          <Textarea
            className="[&>textarea]:h-24 [&>textarea]:min-h-24 [&>textarea]:field-sizing-fixed"
            required
            value={quality}
            onChange={(event) => setQuality(event.target.value)}
          />
        </label>
      </fieldset>
      <fieldset disabled={busy} className="grid gap-3 md:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">Where GLaDOS can work</legend>
        <div className="rounded-lg border border-border p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <ServerIcon className="size-4" />
            This environment
            <span className="text-xs font-normal text-muted-foreground">
              {config?.environment.label ?? environmentId}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {projects.map((project) => (
              <label key={project.id} className="flex min-h-9 min-w-0 items-center gap-2 text-sm">
                <Checkbox
                  checked={projectIds.includes(project.id)}
                  onCheckedChange={(checked) =>
                    setProjectIds((current) =>
                      checked
                        ? [...current, project.id]
                        : current.filter((id) => id !== project.id),
                    )
                  }
                />
                <span className="truncate">{project.title}</span>
              </label>
            ))}
          </div>
          {projects.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Waiting for this environment’s projects. Saved project scope is retained.
            </p>
          )}
          {projectIds
            .filter((id) => !projects.some((project) => project.id === id))
            .map((id) => (
              <label
                key={id}
                className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Checkbox
                  checked
                  onCheckedChange={() =>
                    setProjectIds((current) => current.filter((entry) => entry !== id))
                  }
                />
                Unavailable project · {id}
              </label>
            ))}
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-sm font-medium">Connected GLaDOS peers</p>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            Choose peers for outgoing coordination. Shared work still requires approval on both
            environments. Existing agreements and running workers are retained.
          </p>
          {peers.error && (
            <p role="status" className="text-sm text-muted-foreground">
              Peer connections are unavailable. Saved scope is retained.
            </p>
          )}
          {peers.data?.peers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No peers configured. Add one under Connected GLaDOS peers below the work board.
            </p>
          )}
          <div className="space-y-2">
            {peers.data?.peers.map((peer) => (
              <label key={peer.config.id} className="flex min-h-9 items-center gap-2 text-sm">
                <Checkbox
                  checked={selectedPeerIds.includes(peer.config.id)}
                  onCheckedChange={(checked) =>
                    setManagedPeerIds(
                      checked
                        ? [...selectedPeerIds, peer.config.id]
                        : selectedPeerIds.filter((id) => id !== peer.config.id),
                    )
                  }
                />
                <span>
                  {configs.get(peer.config.environmentId)?.environment.label ?? peer.config.id}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {!peer.config.enabled
                    ? "Disconnected"
                    : peer.error
                      ? "Unreachable"
                      : peer.lastSeenAt
                        ? "Connected"
                        : "Awaiting connection"}
                </span>
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="mb-1 text-sm font-semibold">Worker models</legend>
        <p className="text-xs text-muted-foreground">
          Choose one or two worker configurations from this environment. GLaDOS chooses for each
          task using your guidance; remote work uses its home environment’s choices.
        </p>
        <div className="divide-y divide-border rounded-lg border border-border">
          {models.map((model, index) => (
            <div
              key={index === 0 ? "default" : "alternative"}
              className="grid grid-cols-[minmax(0,1fr)_9rem_2.25rem] items-center gap-3 p-3 sm:grid-cols-[5rem_minmax(0,1fr)_10rem_2.25rem]"
            >
              <span className="col-span-3 text-sm font-medium sm:col-span-1">
                {index === 0 ? "Default" : "Alternative"}
              </span>
              <ProviderModelPicker
                activeInstanceId={model.instanceId}
                model={model.model}
                lockedProvider={null}
                instanceEntries={entries}
                modelOptionsByInstance={modelOptions}
                disabled={busy || !config}
                triggerVariant="outline"
                triggerClassName="col-span-3 h-9 min-h-9 w-full max-w-none! text-left sm:col-span-1 sm:h-9"
                triggerAriaLabel={index === 0 ? "Default worker model" : "Alternative worker model"}
                onInstanceModelChange={(instanceId, value) =>
                  setModels((current) =>
                    current.map((entry, i) =>
                      i !== index || (entry.instanceId === instanceId && entry.model === value)
                        ? entry
                        : { instanceId, model: value },
                    ),
                  )
                }
              />
              {entries
                .filter((entry) => entry.instanceId === model.instanceId)
                .map((entry) => {
                  const input = {
                    provider: entry.driverKind,
                    instanceId: model.instanceId,
                    models: entry.models,
                    model: model.model,
                    modelOptions: model.options,
                    prompt: "",
                    onPromptChange: () => {},
                    allowPromptInjectedEffort: false,
                    planModeEnabled: settings.planModeEnabled,
                  };
                  return (
                    <fieldset
                      key={entry.instanceId}
                      aria-label={`${index === 0 ? "Default" : "Alternative"} thinking and model options`}
                      disabled={busy}
                      className="col-span-2 min-w-0 sm:col-span-1"
                    >
                      {shouldRenderTraitsControls(input) ? (
                        <TraitsPicker
                          {...input}
                          triggerVariant="outline"
                          triggerClassName="h-9 min-h-9 w-full max-w-none! sm:h-9"
                          onModelOptionsChange={(options) =>
                            setModels((current) =>
                              current.map((selection, i) => {
                                if (i !== index) return selection;
                                const { options: _previous, ...rest } = selection;
                                return options === undefined ? rest : { ...rest, options };
                              }),
                            )
                          }
                        />
                      ) : (
                        <span className="flex h-9 items-center text-xs text-muted-foreground">
                          No thinking options
                        </span>
                      )}
                    </fieldset>
                  );
                })}
              {models.length === 2 &&
                (index === 0 ? (
                  <Button
                    type="button"
                    size="icon"
                    className="col-start-3 size-9 sm:col-start-4 sm:size-9"
                    variant="ghost"
                    aria-label="Swap default and alternative"
                    disabled={busy}
                    onClick={() => moveModel(0, 1)}
                  >
                    <ArrowUpDownIcon className="size-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="icon"
                    className="col-start-3 size-9 sm:col-start-4 sm:size-9"
                    variant="ghost"
                    aria-label="Remove alternative model"
                    disabled={busy}
                    onClick={() => setModels((current) => current.slice(0, 1))}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                ))}
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 sm:h-9"
          disabled={busy || models.length >= 2 || !nextModel}
          onClick={() => {
            if (nextModel) setModels((current) => [...current, nextModel]);
          }}
        >
          <PlusIcon className="size-4" />
          Add alternative model
        </Button>
        {!config && (
          <p role="status" className="text-xs text-muted-foreground">
            Loading this environment’s model catalog…
          </p>
        )}
        <label className="grid gap-2 text-sm font-medium">
          How GLaDOS should choose
          <Textarea
            className="[&>textarea]:min-h-24"
            value={modelGuidance}
            onChange={(event) => setModelGuidance(event.target.value)}
            placeholder="Which work suits each model? When should GLaDOS choose differently?"
          />
        </label>
      </fieldset>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-3">
        <Choice
          label="Concurrent workers"
          value={String(maxWorkers)}
          onChange={(value) => setMaxWorkers(Number(value))}
          options={Array.from({ length: 10 }, (_, i) => ({
            value: String(i + 1),
            label: `${i + 1} ${i === 0 ? "worker" : "workers"}`,
          }))}
        />
        <Choice
          label="Attempts per task"
          value={String(maxAttempts)}
          onChange={(value) => setMaxAttempts(Number(value))}
          options={Array.from({ length: 5 }, (_, i) => ({
            value: String(i + 1),
            label: `${i + 1} ${i === 0 ? "attempt" : "attempts"}`,
          }))}
        />
        <Choice
          label="Worker permissions"
          value={workerRuntimeMode}
          onChange={(value) =>
            setWorkerRuntimeMode(value === "full-access" ? "full-access" : "approval-required")
          }
          options={[
            { value: "approval-required", label: "Ask for approvals" },
            { value: "full-access", label: "Full access within brief" },
          ]}
        />
      </fieldset>
      <div className="flex items-center gap-2 border-t border-border pt-4">
        <Button
          size="sm"
          className="h-9 min-w-24 sm:h-9"
          type="submit"
          disabled={busy || projectIds.length === 0}
        >
          Save brief
        </Button>
        <Button
          size="sm"
          className="h-9 min-w-24 sm:h-9"
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {projectIds.length} {projectIds.length === 1 ? "project" : "projects"} · {maxWorkers}{" "}
          concurrent
        </span>
      </div>
    </form>
  );
}
