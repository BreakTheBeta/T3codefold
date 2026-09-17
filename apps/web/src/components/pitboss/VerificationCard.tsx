import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "../ui/dialog";
import { useId, useState } from "react";
import {
  hasCurrentVerification,
  verificationProposalApprovalAction,
  type EnvironmentId,
  type PitbossAction,
  type PitbossTask,
  type PitbossVerificationRecipe,
} from "@t3tools/contracts";
import { useAssetUrlState } from "../../assets/assetUrls";
import { Button } from "../ui/button";

export function VerificationArtifact({
  environmentId,
  artifact,
}: {
  environmentId: EnvironmentId;
  artifact: { name: string; attachmentId: string };
}) {
  const asset = useAssetUrlState(environmentId, {
    _tag: "attachment",
    attachmentId: artifact.attachmentId,
    fileName: artifact.name,
    ...(/\.(png|jpe?g|webp)$/i.test(artifact.name)
      ? {
          mimeType: /\.png$/i.test(artifact.name)
            ? "image/png"
            : /\.webp$/i.test(artifact.name)
              ? "image/webp"
              : "image/jpeg",
          disposition: "inline" as const,
        }
      : {}),
  });
  return asset._tag === "Success" ? (
    <a className="text-sm underline" href={asset.url} target="_blank" rel="noreferrer">
      {/\.(png|jpe?g|webp)$/i.test(artifact.name) && (
        <img
          src={asset.url}
          alt={`Verification artifact: ${artifact.name}`}
          loading="lazy"
          className="mb-2 max-h-56 rounded-lg object-contain"
        />
      )}
      Download {artifact.name}
    </a>
  ) : (
    <span className="text-xs text-muted-foreground">{artifact.name} · loading download</span>
  );
}

export function VerificationCard({
  task,
  recipe,
  recipes,
  busy,
  paused,
  automatic = false,
  environmentId,
  command,
}: {
  task: PitbossTask;
  recipe: PitbossVerificationRecipe | undefined;
  recipes: readonly PitbossVerificationRecipe[];
  busy: boolean;
  paused: boolean;
  automatic?: boolean;
  environmentId: EnvironmentId;
  command: (action: PitbossAction) => Promise<boolean>;
}) {
  const proposal = task.proposedVerificationRecipe;
  const proposalApproval = verificationProposalApprovalAction(task);
  const proposedSaved =
    proposal &&
    recipes.some(
      (saved) =>
        (saved.profileId ?? "default") === (proposal.profileId ?? "default") &&
        saved.version >= proposal.version,
    );
  const run = task.verification;
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const latest = task.evidence.at(-1);
  const pending = run?.state === "pending" || run?.state === "running";
  const writers = task.attempts.some((attempt) =>
    ["pending", "running", "submitted", "stop_requested"].includes(attempt.state),
  );
  return (
    <section
      className="my-4 space-y-3 rounded-xl border border-border bg-muted/20 p-4"
      aria-label="Captured verification"
    >
      {proposal && !proposedSaved && (
        <div className="rounded-lg border border-primary/40 p-3">
          <h4 className="text-sm font-semibold">Verification setup proposed</h4>
          <p className="my-2 text-xs text-muted-foreground">
            {proposal.name} ·{" "}
            {automatic && task.attempts.length > 0
              ? "The proof requirements would change after work started. Review the change before it applies."
              : "Review the prepared checks and save to continue."}
          </p>
          <div className="flex flex-wrap gap-2">
            {proposalApproval && (
              <Button
                size="sm"
                disabled={busy || !!task.homeEnvironmentId}
                onClick={() => void command(proposalApproval)}
              >
                Approve and save exact proposal
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCreating(true);
                setEditing(true);
              }}
            >
              Review proposed settings
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Captured verification</h4>
          <p className="text-xs text-muted-foreground">
            {recipe
              ? `${recipe.name} · recipe v${recipe.version}`
              : automatic
                ? "GLaDOS prepares checks for new work within your brief."
                : "Review a prepared recipe to enable captured checks."}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setCreating(false);
            setEditing(!editing);
          }}
        >
          {editing ? "Close recipe" : recipe ? "Edit recipe" : "Configure recipe"}
        </Button>
      </div>
      <label className="block space-y-1 text-xs">
        Evidence profile for this task
        <select
          aria-label="Evidence profile for this task"
          className="block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          value={
            task.verificationProfileId === null
              ? "reported"
              : (task.verificationProfileId ?? "default")
          }
          disabled={busy || pending || writers}
          onChange={(event) =>
            void command({
              type: "verification-profile",
              taskId: task.id,
              profileId: event.target.value === "reported" ? null : event.target.value,
            })
          }
        >
          <option value="reported">Reported evidence — user review</option>
          {!recipes.some((entry) => (entry.profileId ?? "default") === "default") && (
            <option value="default">Project default — not configured</option>
          )}
          {recipes.map((entry) => (
            <option
              key={entry.profileId ?? "default"}
              value={entry.profileId ?? "default"}
              disabled={entry.enabled === false}
            >
              {entry.name} · {entry.mode ?? "commit"}
              {entry.enabled === false ? " (disabled)" : ""}
            </option>
          ))}
        </select>
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => {
          setCreating(true);
          setEditing(true);
        }}
      >
        New evidence profile
      </Button>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogPopup className="max-w-2xl max-h-[90dvh] overflow-y-auto p-5">
          <DialogTitle>{creating ? "New evidence profile" : "Edit evidence profile"}</DialogTitle>
          <DialogDescription>
            Review how GLaDOS checks this kind of work. Saving approves the profile and selects it
            for this task.
          </DialogDescription>
          {editing && (
            <RecipeEditor
              key={recipe?.version ?? 0}
              task={task}
              recipe={
                creating && proposal
                  ? recipes.find(
                      (entry) =>
                        (entry.profileId ?? "default") === (proposal.profileId ?? "default"),
                    )
                  : creating
                    ? undefined
                    : recipe
              }
              proposal={creating && !proposedSaved ? proposal : undefined}
              environmentId={environmentId}
              busy={busy}
              onSave={async (action) => {
                const saved = await command(action);
                if (saved) setEditing(false);
                return saved;
              }}
            />
          )}
        </DialogPopup>
      </Dialog>
      {recipe && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void command({
              type: "verification-recipe",
              recipe: { ...recipe, version: recipe.version + 1, enabled: recipe.enabled === false },
            })
          }
        >
          {recipe.enabled === false ? "Enable captured checks" : "Disable captured checks"}
        </Button>
      )}
      {run && (
        <>
          <p role="status" className="text-sm font-medium">
            {pending
              ? `Verification ${run.state}`
              : run.receipt?.verdict === "inconclusive"
                ? "Blocked / inconclusive"
                : run.receipt?.verdict === "pass"
                  ? "Recipe passed"
                  : "Recipe failed"}
            {run.state === "completed" &&
            latest &&
            !hasCurrentVerification(task, recipe, latest.candidate) &&
            run.receipt?.verdict === "pass"
              ? " · stale evidence"
              : ""}
          </p>
          <p className="break-all font-mono text-xs text-muted-foreground">{run.candidate}</p>
          <p className="text-sm">{run.receipt?.summary}</p>
          <p className="text-xs text-muted-foreground">
            {run.recipe.mode ?? "commit"} · {run.receipt?.environmentId ?? "task home"}
            {run.receipt?.target ? ` · ${run.receipt.target}` : ""}
            {run.receipt?.expiresAt ? ` · expires ${run.receipt.expiresAt}` : ""}
          </p>
          {run.receipt?.checks.map((check) => (
            <details key={check.name} className="rounded-lg border border-border p-2">
              <summary className="cursor-pointer text-xs">
                {check.name} · {check.timedOut ? "timed out" : `exit ${check.code}`}
              </summary>
              <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap text-xs">
                {check.command}
                {"\n"}
                {check.stdout}
                {check.stderr}
              </pre>
            </details>
          ))}
          <div className="flex flex-col gap-2">
            {run.receipt?.artifacts.map((artifact) => (
              <VerificationArtifact
                key={artifact.attachmentId}
                artifact={artifact}
                environmentId={environmentId}
              />
            ))}
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Captured checks cover the approved recipe. The lead still reviews the integrated result,
        user experience and untested paths.
      </p>
      {recipe && recipe.enabled !== false && (
        <Button
          size="sm"
          disabled={busy || paused || pending || writers || !latest || !!task.homeEnvironmentId}
          onClick={() =>
            latest && void command({ type: "verify", taskId: task.id, evidenceId: latest.id })
          }
        >
          {pending ? "Verification in progress" : "Run captured verification"}
        </Button>
      )}
      {writers && (
        <p className="text-xs text-muted-foreground">
          Wait for the worker to stop before checking its candidate.
        </p>
      )}
    </section>
  );
}
function RecipeEditor({
  task,
  recipe,
  proposal,
  environmentId,
  busy,
  onSave,
}: {
  task: PitbossTask;
  recipe: PitbossVerificationRecipe | undefined;
  proposal: PitbossVerificationRecipe | undefined;
  environmentId: EnvironmentId;
  busy: boolean;
  onSave: (action: PitbossAction) => Promise<boolean>;
}) {
  const formId = useId();
  const initial = proposal ?? recipe;
  const [profileId, setProfileId] = useState(initial?.profileId ?? "default");
  const [mode, setMode] = useState<"commit" | "artifact" | "observation">(
    initial?.mode ?? "commit",
  );
  const [inputPath, setInputPath] = useState(initial?.inputPath ?? "");
  const [target, setTarget] = useState(initial?.target ?? "");
  const [maxAge, setMaxAge] = useState(initial?.maxAgeSeconds ?? 0);
  const [effects, setEffects] = useState<"observe" | "host-commands">(
    initial?.effects ?? "observe",
  );
  const [name, setName] = useState(initial?.name ?? "Project acceptance");
  const [doctor, setDoctor] = useState(initial?.doctor ?? "");
  const [verify, setVerify] = useState(initial?.verify ?? task.verifyCommand);
  const [cleanup, setCleanup] = useState(initial?.cleanup ?? "");
  const [artifacts, setArtifacts] = useState(initial?.artifacts.join("\n") ?? "");
  const [timeout, setTimeout] = useState(initial?.timeoutSeconds ?? 60);
  const fields = [
    ["Recipe name", name, setName],
    ["Readiness command", doctor, setDoctor],
    ["Verification command", verify, setVerify],
    ["Cleanup command (optional)", cleanup, setCleanup],
    ["Required artifacts (one relative path per line)", artifacts, setArtifacts],
  ] as const;
  return (
    <form
      className="space-y-3 rounded-lg bg-background p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          type: "verification-recipe",
          selectForTaskId: task.id,
          recipe: {
            projectId: task.projectId,
            profileId: profileId.trim(),
            mode,
            environmentId,
            effects,
            ...(inputPath.trim() ? { inputPath: inputPath.trim() } : {}),
            ...(mode === "observation" ? { target: target.trim() } : {}),
            ...(maxAge ? { maxAgeSeconds: maxAge } : {}),
            version: (recipe?.version ?? 0) + 1,
            name,
            enabled: true,
            doctor,
            verify,
            cleanup,
            timeoutSeconds: timeout,
            artifacts: artifacts
              .split("\n")
              .map((entry) => entry.trim())
              .filter(Boolean),
          },
        });
      }}
    >
      <p className="text-xs text-muted-foreground">
        Approve commands for this environment. Code runs in a disposable clone; artifact checks
        receive only the input file in a temporary directory; observations run in the project
        workspace. Commands have host permissions. The effect policy is an instruction, not a
        sandbox. Readiness must check required services, tools and hardware; include cleanup for
        processes you start.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          Profile ID
          <input
            className="block h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            value={profileId}
            disabled={!!recipe}
            required
            onChange={(event) => setProfileId(event.target.value)}
            placeholder="gameplay, listening, research, health"
          />
        </label>
        <label className="space-y-1 text-xs">
          Subject
          <select
            className="block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Subject"
            value={mode}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "commit" || value === "artifact" || value === "observation") {
                setMode(value);
                if (value === "observation" && !maxAge) setMaxAge(300);
              }
            }}
          >
            <option value="commit">Code commit</option>
            <option value="artifact">File / audio / research packet</option>
            <option value="observation">Host / service observation</option>
          </select>
        </label>
        {mode !== "commit" && (
          <label className="space-y-1 text-xs">
            {mode === "artifact" ? "Input file (relative path)" : "Configuration file (optional)"}
            <input
              className="block h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              value={inputPath}
              required={mode === "artifact"}
              onChange={(event) => setInputPath(event.target.value)}
            />
          </label>
        )}
        {mode === "observation" && (
          <label className="space-y-1 text-xs">
            Target service or resource
            <input
              className="block h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              value={target}
              required
              onChange={(event) => setTarget(event.target.value)}
            />
          </label>
        )}
        <label className="space-y-1 text-xs">
          Evidence lifetime
          <select
            className="block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Evidence lifetime"
            value={maxAge}
            onChange={(event) => setMaxAge(Number(event.target.value))}
          >
            {[0, 60, 300, 3600, 86400, 604800].map((seconds) => (
              <option
                key={seconds}
                value={seconds}
                disabled={mode === "observation" && seconds === 0}
              >
                {seconds === 0 ? "Until candidate changes" : `${seconds / 60} minutes`}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          Permitted effects
          <select
            className="block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Permitted effects"
            value={effects}
            onChange={(event) =>
              setEffects(event.target.value === "observe" ? "observe" : "host-commands")
            }
          >
            <option value="observe">Observe only</option>
            <option value="host-commands">Approved commands may change host state</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Bound to environment {environmentId}. Missing capability is inconclusive; this does not move
        tasks to another host.
      </p>
      {fields.map(([label, value, setValue], index) => (
        <div key={label} className="block space-y-1 text-xs">
          <label htmlFor={`${formId}-${index}`}>{label}</label>
          <textarea
            id={`${formId}-${index}`}
            className="block min-h-16 w-full rounded-md border border-input bg-transparent p-2 text-sm"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required={
              label === "Recipe name" ||
              label === "Readiness command" ||
              label === "Verification command"
            }
          />
        </div>
      ))}
      <label className="block space-y-1 text-xs">
        Time limit per command
        <select
          className="block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          value={timeout}
          onChange={(event) => setTimeout(Number(event.target.value))}
        >
          {[30, 60, 120, 300].map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds} seconds
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" disabled={busy}>
        Save and select profile v{(recipe?.version ?? 0) + 1}
      </Button>
    </form>
  );
}
