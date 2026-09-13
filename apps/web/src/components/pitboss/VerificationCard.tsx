import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "../ui/dialog";
import { useId, useState } from "react";
import {
  hasCurrentVerification,
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
  busy,
  paused,
  environmentId,
  command,
}: {
  task: PitbossTask;
  recipe: PitbossVerificationRecipe | undefined;
  busy: boolean;
  paused: boolean;
  environmentId: EnvironmentId;
  command: (action: PitbossAction) => Promise<boolean>;
}) {
  const run = task.verification;
  const [editing, setEditing] = useState(false);
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Captured verification</h4>
          <p className="text-xs text-muted-foreground">
            {recipe
              ? `${recipe.name} · recipe v${recipe.version}`
              : "Approve a recipe to enable server-captured checks."}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>
          {editing ? "Close recipe" : recipe ? "Edit recipe" : "Configure recipe"}
        </Button>
      </div>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogPopup className="max-w-2xl max-h-[90dvh] overflow-y-auto p-5">
          <DialogTitle>Project verification recipe</DialogTitle>
          <DialogDescription>
            Approve how GLaDOS checks committed work in this project.
          </DialogDescription>
          {editing && (
            <RecipeEditor
              key={recipe?.version ?? 0}
              task={task}
              recipe={recipe}
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
          Wait for the worker to stop before checking its committed candidate.
        </p>
      )}
    </section>
  );
}
function RecipeEditor({
  task,
  recipe,
  busy,
  onSave,
}: {
  task: PitbossTask;
  recipe: PitbossVerificationRecipe | undefined;
  busy: boolean;
  onSave: (action: PitbossAction) => Promise<boolean>;
}) {
  const formId = useId();
  const [name, setName] = useState(recipe?.name ?? "Project acceptance");
  const [doctor, setDoctor] = useState(recipe?.doctor ?? "node --version");
  const [verify, setVerify] = useState(recipe?.verify ?? task.verifyCommand);
  const [cleanup, setCleanup] = useState(recipe?.cleanup ?? "");
  const [artifacts, setArtifacts] = useState(recipe?.artifacts.join("\n") ?? "");
  const [timeout, setTimeout] = useState(recipe?.timeoutSeconds ?? 60);
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
          recipe: {
            projectId: task.projectId,
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
        Approving this recipe allows leads to run these host commands against project commits in
        disposable checkouts. This isolates files; it is not a security sandbox. Include setup and
        readiness checks, meaningful user journeys, and cleanup for any processes you start.
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
        Approve recipe v{(recipe?.version ?? 0) + 1}
      </Button>
    </form>
  );
}
