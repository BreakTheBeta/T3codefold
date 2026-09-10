import { PitbossPeers } from "./PitbossPeers";
import { PitbossSources } from "./PitbossSources";
import { randomUUID } from "../../lib/utils";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CrownIcon,
  ArrowUpRightIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  ChevronDownIcon,
  CheckCircle2Icon,
  Settings2Icon,
} from "lucide-react";
import {
  CommandId,
  type EnvironmentId,
  type ModelSelection,
  type PitbossAction,
  type PitbossBrief,
  type PitbossTask,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";

const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/50";
const statusClass: Record<PitbossTask["status"], string> = {
  queued: "text-muted-foreground",
  active: "text-sky-600 dark:text-sky-400",
  verifying: "text-amber-600 dark:text-amber-400",
  done: "text-emerald-600 dark:text-emerald-400",
  blocked: "text-orange-600 dark:text-orange-400",
  cancelled: "text-muted-foreground",
};

export function PitbossPin({
  environmentId,
  label,
}: {
  environmentId: EnvironmentId;
  label: string;
}) {
  const query = useEnvironmentQuery(serverEnvironment.pitbossLive({ environmentId, input: {} }));
  const navigate = useNavigate();
  const role = query.data?.role;
  if (!role) return null;
  const questions =
    query.data?.messages.filter(
      (message) =>
        !message.acknowledged && ["question", "decision", "result"].includes(message.kind),
    ).length ?? 0;
  return (
    <button
      type="button"
      onClick={() =>
        void navigate({
          to: "/$environmentId/$threadId",
          params: { environmentId, threadId: role.threadId },
        })
      }
      className="mx-1 my-1 flex w-[calc(100%-0.5rem)] items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-3 text-left hover:bg-amber-500/10 focus-visible:outline-2 focus-visible:outline-amber-500"
    >
      <span className="rounded-lg bg-amber-500/15 p-2 text-amber-600 dark:text-amber-400">
        <CrownIcon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Pitboss</span>
        <span className="block truncate text-xs text-muted-foreground">{label}</span>
      </span>
      <span className="text-xs text-muted-foreground">
        {query.error
          ? "Offline"
          : role.paused
            ? "Paused"
            : questions
              ? `${questions} need you`
              : query.data?.tasks.some(
                    (task) => task.status === "active" || task.status === "verifying",
                  )
                ? "Work active"
                : "Ready"}
      </span>
    </button>
  );
}

export function PitbossPanel(props: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  projectId: ProjectId;
  modelSelection: ModelSelection;
}) {
  const query = useEnvironmentQuery(
    serverEnvironment.pitbossLive({ environmentId: props.environmentId, input: {} }),
  );
  const mutate = useAtomCommand(serverEnvironment.pitbossCommand, { label: "pitboss work" });
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editingBrief, setEditingBrief] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingTask, setEditingTask] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = query.data;
  const role = state?.role;
  const isBoss = role?.threadId === props.threadId;
  const defaultBrief: PitbossBrief = {
    priorities: "",
    quality:
      "Show evidence that the requested behavior works. Preserve existing behavior outside scope.",
    projectIds: [props.projectId],
    maxWorkers: 1,
    maxAttempts: 3,
    workerModel: props.modelSelection,
  };
  const command = async (action: PitbossAction) => {
    if (!state || busy) return false;
    setBusy(true);
    setError(null);
    const result = await mutate({
      environmentId: props.environmentId,
      input: {
        commandId: CommandId.make(randomUUID()),
        expectedRevision: state.revision,
        action,
      },
    });
    setBusy(false);
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) setError(String(squashAtomCommandFailure(result)));
      return false;
    }
    return true;
  };
  if (!state) return null;
  const selected = state.tasks.find((task) => task.id === selectedId);
  const questions = state.messages.filter(
    (message) => !message.acknowledged && ["question", "decision", "result"].includes(message.kind),
  );
  const active = state.tasks.filter(
    (task) => task.status === "active" || task.status === "verifying",
  );
  const next = state.tasks
    .filter((task) => task.status === "queued")
    .toSorted((a, b) => a.priority - b.priority);
  const outcomes = state.tasks.filter((task) =>
    ["done", "blocked", "cancelled"].includes(task.status),
  );
  const openThread = (threadId: ThreadId) =>
    void navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId: props.environmentId, threadId },
    });
  return (
    <section
      aria-label="Pitboss workspace"
      className="shrink-0 border-b border-border bg-amber-500/[0.025]"
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <CrownIcon className="size-4 text-amber-600 dark:text-amber-400" />
        {isBoss ? (
          <>
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-semibold"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
            >
              Pitboss{" "}
              <span className="text-xs font-normal text-muted-foreground">
                {role.paused ? "Paused" : `${active.length} working · ${next.length} up next`}
              </span>
              <ChevronDownIcon className="size-3" />
            </button>
            <span className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void command({ type: "pause", paused: !role.paused })}
            >
              {role.paused ? <PlayIcon className="size-3" /> : <PauseIcon className="size-3" />}
              {role.paused ? "Resume" : "Pause"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditingBrief(!editingBrief);
                setOpen(true);
              }}
            >
              <Settings2Icon className="size-3" />
              Brief
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAdding(!adding);
                setOpen(true);
              }}
            >
              <PlusIcon className="size-3" />
              Add work
            </Button>
          </>
        ) : (
          <>
            <span className="text-xs text-muted-foreground">
              Give this environment a long-lived coordinator.
            </span>
            <span className="flex-1" />
            {role && (
              <Button size="sm" variant="ghost" onClick={() => openThread(role.threadId)}>
                Open pitboss
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditingBrief(!editingBrief);
                setOpen(true);
              }}
            >
              {role ? "Replace pitboss with this thread" : "Make pitboss"}
            </Button>
          </>
        )}
      </div>
      {(error || query.error) && (
        <p role="alert" className="px-4 pb-2 text-sm text-destructive">
          {error ?? query.error}
        </p>
      )}
      {open && (
        <div className="max-h-[55vh] overflow-y-auto px-4 pb-4">
          {role?.paused && isBoss && (
            <p className="mb-3 text-xs text-muted-foreground">
              New autonomous work is paused. Existing workers continue until you stop them.
            </p>
          )}
          {editingBrief && (
            <BriefForm
              key={role?.generation ?? "new"}
              brief={isBoss ? role.brief : defaultBrief}
              busy={busy}
              onCancel={() => setEditingBrief(false)}
              onSave={async (brief) => {
                if (
                  await command(
                    isBoss
                      ? { type: "brief", brief }
                      : {
                          type: "elect",
                          threadId: props.threadId,
                          projectId: props.projectId,
                          brief,
                        },
                  )
                )
                  setEditingBrief(false);
              }}
            />
          )}
          {isBoss && adding && (
            <TaskForm
              busy={busy}
              onCancel={() => setAdding(false)}
              onSave={async (values) => {
                if (
                  await command({
                    type: "create",
                    taskId: randomUUID(),
                    projectId: props.projectId,
                    ...values,
                    priority: 50,
                    dependencies: [],
                    workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
                  })
                )
                  setAdding(false);
              }}
            />
          )}
          {isBoss && !editingBrief && !adding && (
            <>
              {questions.length > 0 && (
                <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Needs attention
                  </h3>
                  {questions.map((message) => (
                    <div key={message.id} className="mb-2 flex items-start gap-3 text-sm">
                      <span className="flex-1">{message.text}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (message.taskId) setSelectedId(message.taskId);
                        }}
                      >
                        Inspect
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void command({ type: "acknowledge", messageId: message.id })}
                      >
                        Acknowledge
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  { label: "Working", tasks: active },
                  { label: "Up next", tasks: next },
                  { label: "Outcomes", tasks: outcomes },
                ].map(({ label, tasks }) => {
                  return (
                    <div
                      key={String(label)}
                      className="rounded-xl border border-border bg-background/70 p-3"
                    >
                      <h3 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {String(label)} <span>{tasks.length}</span>
                      </h3>
                      {tasks.length ? (
                        tasks.slice(0, 10).map((task) => (
                          <button
                            type="button"
                            key={task.id}
                            onClick={() => setSelectedId(task.id)}
                            className="mb-2 block w-full rounded-lg border border-border/70 px-3 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-amber-500"
                          >
                            <span className="block text-sm font-medium">{task.title}</span>
                            <span className={`text-xs ${statusClass[task.status]}`}>
                              {task.status}
                            </span>
                            <span className="mt-1 block truncate text-xs text-muted-foreground">
                              {task.note || task.outcome}
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {label === "Up next"
                            ? "Describe an outcome in chat or add your first task."
                            : label === "Working"
                              ? "Workers appear here when the pitboss assigns work."
                              : "Accepted results and blockers stay visible here."}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {selected && (
                <div className="mt-3 rounded-xl border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{selected.title}</h3>
                      <p className={`text-xs ${statusClass[selected.status]}`}>
                        {selected.status} · criteria v{selected.criteriaVersion}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)}>
                      Close detail
                    </Button>
                  </div>
                  <p className="my-3 text-sm">{selected.outcome}</p>
                  {selected.source && (
                    <p className="mb-3 text-xs text-muted-foreground">
                      {selected.source.kind} · {selected.source.key} · Source status:{" "}
                      {selected.source.status} · T3 work: {selected.status}
                    </p>
                  )}
                  <h4 className="text-xs font-semibold text-muted-foreground">ACCEPTANCE</h4>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{selected.criteria}</p>
                  {selected.verifyCommand && (
                    <pre className="my-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                      {selected.verifyCommand}
                    </pre>
                  )}
                  {selected.attempts.map((attempt) => (
                    <div
                      key={attempt.id}
                      className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-2 text-xs"
                    >
                      <span>
                        Attempt {attempt.generation} · {attempt.model.model} · {attempt.state}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openThread(attempt.threadId)}
                      >
                        Open worker
                        <ArrowUpRightIcon className="size-3" />
                      </Button>
                    </div>
                  ))}
                  {selected.evidence.map((evidence) => (
                    <article key={evidence.id} className="mt-3 rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <CheckCircle2Icon className="size-4" />
                        {evidence.verdict}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          {evidence.provenance.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="mt-2 text-sm">{evidence.summary}</p>
                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                        {evidence.candidate}
                      </p>
                      {evidence.artifactUrls
                        .filter((url) => /^https?:\/\//.test(url))
                        .map((url) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block truncate text-xs underline"
                          >
                            Open evidence: {url}
                          </a>
                        ))}
                      {selected.status === "verifying" && evidence.verdict === "pass" && (
                        <Button
                          className="mt-3"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void command({
                              type: "accept",
                              taskId: selected.id,
                              evidenceId: evidence.id,
                              note: "User inspected and accepted the evidence.",
                            })
                          }
                        >
                          Accept inspected evidence
                        </Button>
                      )}
                    </article>
                  ))}
                  {editingTask && (
                    <TaskForm
                      key={selected.id}
                      initial={selected}
                      busy={busy}
                      onCancel={() => setEditingTask(false)}
                      onSave={async (values) => {
                        if (
                          await command({
                            type: "edit",
                            taskId: selected.id,
                            projectId: selected.projectId,
                            ...values,
                            priority: selected.priority,
                            dependencies: selected.dependencies,
                            workspaceStrategy: selected.workspaceStrategy,
                          })
                        )
                          setEditingTask(false);
                      }}
                    />
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setEditingTask(!editingTask)}
                    >
                      Edit task and criteria
                    </Button>
                    {selected.status === "queued" && selected.attempts.at(-1)?.workspacePath && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void command({
                            type: "assign",
                            taskId: selected.id,
                            model: props.modelSelection,
                            resumeAttemptId: selected.attempts.at(-1)!.id,
                          })
                        }
                      >
                        Resume candidate with {props.modelSelection.model}
                      </Button>
                    )}
                    {selected.status === "queued" && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void command({ type: "assign", taskId: selected.id })}
                      >
                        Assign worker
                      </Button>
                    )}
                    {["active", "verifying"].includes(selected.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void command({
                            type: "rework",
                            taskId: selected.id,
                            note: "User requested rework. Preserve the current patch and evidence.",
                          })
                        }
                      >
                        Stop for rework
                      </Button>
                    )}
                    {["blocked", "done", "cancelled"].includes(selected.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void command({ type: "reopen", taskId: selected.id })}
                      >
                        Reopen
                      </Button>
                    )}
                    {!["done", "cancelled"].includes(selected.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void command({
                            type: "cancel",
                            taskId: selected.id,
                            note: "Cancelled by user",
                          })
                        }
                      >
                        Cancel task
                      </Button>
                    )}
                  </div>
                </div>
              )}
              <PitbossSources environmentId={props.environmentId} projectId={props.projectId} />
              <PitbossPeers
                environmentId={props.environmentId}
                tasks={state.tasks}
                onCommand={command}
              />
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void command({ type: "dismiss" })}
                >
                  Dismiss pitboss role
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function BriefForm({
  brief,
  busy,
  onSave,
  onCancel,
}: {
  brief: PitbossBrief;
  busy: boolean;
  onSave: (brief: PitbossBrief) => Promise<void>;
  onCancel: () => void;
}) {
  const [priorities, setPriorities] = useState(brief.priorities);
  const [quality, setQuality] = useState(brief.quality);
  const [maxWorkers, setMaxWorkers] = useState(brief.maxWorkers);
  const [maxAttempts, setMaxAttempts] = useState(brief.maxAttempts);
  const [workerModel, setWorkerModel] = useState(brief.workerModel.model);
  const [workerRuntimeMode, setWorkerRuntimeMode] = useState(
    brief.workerRuntimeMode ?? "approval-required",
  );
  return (
    <form
      className="grid gap-3 rounded-xl border border-border bg-background p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          ...brief,
          priorities,
          quality,
          maxWorkers,
          maxAttempts,
          workerRuntimeMode,
          workerModel: { ...brief.workerModel, model: workerModel },
        });
      }}
    >
      <h3 className="font-semibold">Give your pitboss a brief</h3>
      <p className="text-xs text-muted-foreground">
        This project · {brief.maxWorkers} worker at a time · {brief.maxAttempts} attempts ·{" "}
        {brief.workerModel.model}. Work begins proactively within this scope.
      </p>
      <label className="grid gap-1 text-xs">
        Priorities
        <textarea
          required
          value={priorities}
          onChange={(event) => setPriorities(event.target.value)}
          className={fieldClass}
          placeholder="What matters most? What should wait?"
        />
      </label>
      <label className="grid gap-1 text-xs">
        Quality expectations
        <textarea
          required
          value={quality}
          onChange={(event) => setQuality(event.target.value)}
          className={fieldClass}
        />
      </label>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="grid gap-1 text-xs">
          Concurrent workers
          <input
            type="number"
            min={1}
            max={8}
            required
            className={fieldClass}
            value={maxWorkers}
            onChange={(event) => setMaxWorkers(event.target.valueAsNumber)}
          />
        </label>
        <label className="grid gap-1 text-xs">
          Attempts per task
          <input
            type="number"
            min={1}
            max={5}
            required
            className={fieldClass}
            value={maxAttempts}
            onChange={(event) => setMaxAttempts(event.target.valueAsNumber)}
          />
        </label>
        <label className="grid gap-1 text-xs">
          Worker model ({brief.workerModel.instanceId})
          <input
            required
            className={fieldClass}
            value={workerModel}
            onChange={(event) => setWorkerModel(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-xs">
          Worker permissions
          <select
            className={fieldClass}
            value={workerRuntimeMode}
            onChange={(event) =>
              setWorkerRuntimeMode(
                event.target.value === "full-access" ? "full-access" : "approval-required",
              )
            }
          >
            <option value="approval-required">Ask for approvals</option>
            <option value="full-access">Full access within the brief</option>
          </select>
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={busy}>
          Save brief
        </Button>
        <Button size="sm" type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
function TaskForm({
  busy,
  onSave,
  onCancel,
  initial,
}: {
  initial?: Pick<PitbossTask, "title" | "outcome" | "criteria" | "verifyCommand">;
  busy: boolean;
  onSave: (values: {
    title: string;
    outcome: string;
    criteria: string;
    verifyCommand: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [outcome, setOutcome] = useState(initial?.outcome ?? "");
  const [criteria, setCriteria] = useState(initial?.criteria ?? "");
  const [verifyCommand, setVerifyCommand] = useState(initial?.verifyCommand ?? "");
  return (
    <form
      className="grid gap-3 rounded-xl border border-border bg-background p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({ title, outcome, criteria, verifyCommand });
      }}
    >
      <h3 className="font-semibold">A clear outcome, with a way to prove it</h3>
      <label className="grid gap-1 text-xs">
        Task
        <input
          required
          className={fieldClass}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-xs">
        Desired outcome
        <textarea
          required
          className={fieldClass}
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-xs">
        Acceptance criteria
        <textarea
          required
          className={fieldClass}
          value={criteria}
          onChange={(event) => setCriteria(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-xs">
        Verification command or recipe
        <input
          className={fieldClass}
          value={verifyCommand}
          onChange={(event) => setVerifyCommand(event.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={busy}>
          {initial ? "Save task" : "Add task"}
        </Button>
        <Button size="sm" type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
