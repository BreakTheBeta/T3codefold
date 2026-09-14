import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CommandId, type EnvironmentId, type PitbossBrief } from "@t3tools/contracts";
import { useProjects, useServerConfigs } from "../../state/entities";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { serverEnvironment } from "../../state/server";
import {
  deriveProviderInstanceEntries,
  isProviderInstancePickerReady,
} from "../../providerInstances";
import { getAppModelOptionsForInstance } from "../../modelSelection";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "../ui/dialog";
import { BriefForm } from "./BriefForm";
import { randomUUID } from "../../lib/utils";

export function CreateHome({
  environmentId,
  label,
}: {
  environmentId: EnvironmentId;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const config = useServerConfigs().get(environmentId);
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const settings = useEnvironmentSettings(environmentId);
  const query = useEnvironmentQuery(serverEnvironment.pitbossLive({ environmentId, input: {} }));
  const mutate = useAtomCommand(serverEnvironment.pitbossCommand, { label: "Create GLaDOS home" });
  const navigate = useNavigate();
  const available = config
    ? deriveProviderInstanceEntries(config.providers)
        .filter(isProviderInstancePickerReady)
        .flatMap((entry) =>
          getAppModelOptionsForInstance(settings, entry, null)
            .filter((model) => !model.isUnavailable)
            .map((model) => ({ instanceId: entry.instanceId, model: model.slug })),
        )
    : [];
  const model =
    projects.find((project) => project.defaultModelSelection)?.defaultModelSelection ??
    available[0];
  const brief: PitbossBrief | undefined = model
    ? {
        priorities: "",
        quality: "Verify requested outcomes and preserve existing work.",
        projectIds: [],
        workerModel: model,
        maxWorkers: 3,
        maxAttempts: 3,
        managedPeerIds: [],
        coordinatorRuntimeMode: "approval-required",
        workerRuntimeMode: "approval-required",
      }
    : undefined;
  if (query.data?.role && !open) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-2 my-1 rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        GLaDOS <span className="text-xs text-muted-foreground">· Set up · {label}</span>
      </button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogPopup className="max-w-4xl max-h-[90dvh] overflow-y-auto">
          <DialogTitle>Create GLaDOS home</DialogTitle>
          <DialogDescription>
            A persistent conversation and folder on {label}. Choose its work scope and permissions
            before saving.
          </DialogDescription>
          {brief ? (
            <BriefForm
              environmentId={environmentId}
              brief={brief}
              busy={busy}
              error={error}
              onCancel={() => setOpen(false)}
              onSave={async (saved) => {
                if (busy || !query.data) return;
                setBusy(true);
                const result = await mutate({
                  environmentId,
                  input: {
                    commandId: CommandId.make(randomUUID()),
                    expectedRevision: query.data.revision,
                    action: { type: "activate-home", brief: saved },
                  },
                });
                setBusy(false);
                if (result._tag === "Failure") {
                  setError(String(squashAtomCommandFailure(result)));
                  return;
                }
                const role = result.value.role;
                if (role) {
                  setOpen(false);
                  void navigate({
                    to: "/$environmentId/$threadId",
                    params: { environmentId, threadId: role.threadId },
                  });
                }
              }}
            />
          ) : (
            <p className="py-4 text-sm">
              Connect an available provider in Settings to create GLaDOS.
            </p>
          )}
        </DialogPopup>
      </Dialog>
    </>
  );
}
