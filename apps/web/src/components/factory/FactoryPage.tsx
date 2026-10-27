import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import type { EnvironmentId, FactoryBoard, FactoryCard } from "@t3tools/contracts";
import { FactoryIcon, PlayIcon, RefreshCwIcon, StarIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useEnvironmentIdentities } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { cn } from "../../lib/utils";

const TABS = ["Decisions", "Triggers & runs", "Fleet"] as const;

export function FactoryPage() {
  const environments = useEnvironmentIdentities();
  const [selected, setSelected] = useState<EnvironmentId | null>(null);
  const environmentId =
    environments.find((e) => e.environmentId === selected)?.environmentId ??
    environments[0]?.environmentId;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <FactoryIcon className="size-5" />
          Factory
        </h1>
        <Select
          value={environmentId ?? ""}
          onValueChange={(id) => setSelected(id as EnvironmentId)}
        >
          <SelectTrigger aria-label="Factory environment">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {environments.map((env) => (
              <SelectItem key={env.environmentId} value={env.environmentId}>
                {env.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </header>
      {environmentId ? (
        <EnvironmentFactory key={environmentId} environmentId={environmentId} />
      ) : (
        <p className="p-6 text-muted-foreground">Connect an environment to open its Factory.</p>
      )}
    </div>
  );
}

function EnvironmentFactory({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const query = useEnvironmentQuery(serverEnvironment.factoryBoard({ environmentId, input: {} }));
  const [tab, setTab] = useState<(typeof TABS)[number]>("Decisions");
  const board = query.data;
  const commander = board?.agents.find((a) => a.role === "commander" && a.lifecycle === "active");
  const cards = board?.cards.filter((c) => c.state === "open") ?? [];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <p
          className={cn(
            "text-sm",
            cards.length ? "text-warning-foreground" : "text-muted-foreground",
          )}
        >
          {cards.length} need you · {cards.filter((c) => c.body.blocking).length} blocking
          <span className="ml-4 text-muted-foreground">
            {board?.agents.filter((a) => a.lifecycle === "active").length ?? 0} active agents
          </span>
        </p>
        <Button variant="ghost" size="sm" onClick={query.refresh} aria-label="Refresh Factory">
          <RefreshCwIcon />
          Refresh
        </Button>
      </div>
      <nav className="flex gap-2 border-b border-border px-6 py-3" aria-label="Factory sections">
        {TABS.map((name) => (
          <Button
            key={name}
            variant={tab === name ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={tab === name}
            onClick={() => setTab(name)}
          >
            {name}
          </Button>
        ))}
      </nav>
      {query.error && (
        <p role="alert" className="px-6 py-4 text-destructive">
          {query.error}
        </p>
      )}
      {!board ? (
        <p className="p-6 text-muted-foreground">Loading Factory…</p>
      ) : (
        <>
          {!commander && <CommanderSetup environmentId={environmentId} />}
          {tab === "Decisions" ? (
            <Decisions environmentId={environmentId} board={board} />
          ) : tab === "Triggers & runs" ? (
            <Triggers environmentId={environmentId} board={board} />
          ) : (
            <Fleet environmentId={environmentId} board={board} />
          )}
        </>
      )}
    </>
  );
}

function CommanderSetup({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const allowed = useAtomValue(
    serverEnvironment.factoryEnsureCommander.permissionAtom(environmentId),
  );
  const ensure = useAtomCommand(
    serverEnvironment.factoryEnsureCommander,
    "Start Factory Commander",
  );
  const [modelKey, setModelKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const models = (config?.providers ?? [])
    .filter((p) => p.enabled && p.installed)
    .flatMap((p) =>
      p.models.map((m) => ({
        key: `${p.instanceId}:${m.slug}`,
        instanceId: p.instanceId,
        model: m.slug,
        label: `${p.instanceId} · ${m.name}`,
      })),
    );
  const selected =
    models.find((m) => m.key === modelKey) ??
    models.find((m) => m.model === "claude-opus-5-5") ??
    models[0];
  return (
    <section className="m-6 space-y-4 rounded-lg border border-border p-5">
      <h2 className="font-medium">Open your Factory</h2>
      <p className="max-w-2xl text-sm text-muted-foreground">
        A pinned Commander coordinates Subcommanders and Workers across this environment. Decisions
        appear here when your answer is needed.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selected?.key ?? ""} onValueChange={(key) => setModelKey(key)}>
          <SelectTrigger aria-label="Commander model">
            <SelectValue placeholder="Choose a model" />
          </SelectTrigger>
          <SelectPopup>
            {models.map((model) => (
              <SelectItem key={model.key} value={model.key}>
                {model.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Button
          disabled={!allowed || busy || !selected}
          onClick={async () => {
            if (!selected) return;
            setBusy(true);
            try {
              await ensure({
                environmentId,
                input: {
                  modelSelection: { instanceId: selected.instanceId, model: selected.model },
                },
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Starting…" : "Start Commander"}
        </Button>
      </div>
      <p className="max-w-3xl text-xs text-muted-foreground">
        Factory action tools enforce approval for outward actions. Agents are instructed to use
        them; direct shells, other tools and script effects can bypass this workflow.
      </p>
    </section>
  );
}

function Decisions({
  environmentId,
  board,
}: {
  readonly environmentId: EnvironmentId;
  readonly board: FactoryBoard;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cards = board.cards
    .filter((c) => c.state === "open")
    .sort(
      (a, b) =>
        Number(b.body.blocking) - Number(a.body.blocking) ||
        ["now", "today", "this-week"].indexOf(a.body.urgency) -
          ["now", "today", "this-week"].indexOf(b.body.urgency) ||
        a.createdAt - b.createdAt,
    );
  const selected = cards.find((c) => c.id === selectedId) ?? cards[0];
  return (
    <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <aside
        className="space-y-2 border-b border-border p-4 lg:border-r lg:border-b-0"
        aria-label="Open decisions"
      >
        {!cards.length && (
          <p className="p-2 text-sm text-muted-foreground">No decisions need your answer.</p>
        )}
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => setSelectedId(card.id)}
            aria-pressed={selected?.id === card.id}
            className={cn(
              "w-full rounded-md border p-3 text-left",
              selected?.id === card.id
                ? "border-warning/40 bg-warning-surface"
                : "border-border hover:bg-accent",
            )}
          >
            <span className="block text-xs text-muted-foreground">
              {card.ownerId} · {card.body.urgency}
              {card.body.blocking ? " · blocking" : ""}
            </span>
            <span className="mt-1 block text-sm font-medium">{card.body.title}</span>
          </button>
        ))}
        <h3 className="pt-5 text-xs font-medium text-muted-foreground">Recent answers</h3>
        {board.cards
          .filter((c) => c.state === "answered" || c.state === "acked")
          .slice(-12)
          .reverse()
          .map((card) => (
            <p key={card.id} className="px-2 py-1 text-sm">
              <span className="text-muted-foreground">{card.outcome}</span> · {card.body.title}
            </p>
          ))}
      </aside>
      {selected ? (
        <CardDetail
          key={`${selected.id}:${selected.revision}`}
          environmentId={environmentId}
          card={selected}
        />
      ) : (
        <div className="p-8 text-sm text-muted-foreground">
          Your agents can keep working. New questions will appear here.
        </div>
      )}
    </div>
  );
}

function CardDetail({
  environmentId,
  card,
}: {
  readonly environmentId: EnvironmentId;
  readonly card: FactoryCard;
}) {
  const [staged, setStaged] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const allowed = useAtomValue(serverEnvironment.factoryAnswerCard.permissionAtom(environmentId));
  const answer = useAtomCommand(serverEnvironment.factoryAnswerCard, "Answer Factory decision");
  const action = card.body.action;
  const payload = useEnvironmentQuery(
    action
      ? serverEnvironment.factoryPayload({ environmentId, input: { sha256: action.payloadSha256 } })
      : null,
  );
  const send = async () => {
    if (!allowed || busy || (!staged && !note.trim())) return;
    setBusy(true);
    try {
      await answer({
        environmentId,
        input: {
          cardId: card.id,
          revision: card.revision,
          ...(staged === "default"
            ? { yourCall: true }
            : staged && staged !== "ruled"
              ? { optionId: staged }
              : {}),
          ...(note.trim() ? { note } : {}),
        },
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="flex min-w-0 flex-col"
      aria-label={card.body.title}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement)
          return;
        const number = Number(event.key);
        if (number >= 1 && number <= 9 && card.body.options[number - 1]) {
          event.preventDefault();
          setStaged(card.body.options[number - 1]!.id);
        } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          setStaged(card.body.options.find((o) => o.recommended)?.id ?? null);
        } else if (event.key === "Enter" && staged) {
          event.preventDefault();
          void send();
        } else if (event.key === "d") setStaged("default");
        else if (event.key === "n") noteRef.current?.focus();
      }}
    >
      <div className="space-y-6 p-6">
        <div>
          <p className="text-xs text-muted-foreground">
            {card.id} · revision {card.revision} · {card.ownerId}
          </p>
          <h2 className="mt-1 text-xl font-semibold">{card.body.title}</h2>
        </div>
        <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Doing</dt>
          <dd>{card.body.context.doing}</dd>
          <dt className="text-muted-foreground">Why me</dt>
          <dd>{card.body.context.whyNotMe}</dd>
          <dt className="text-muted-foreground">Waiting</dt>
          <dd>{card.body.context.costOfWaiting}</dd>
        </dl>
        {action && (
          <div className="space-y-2 rounded-md border border-border p-4">
            <p className="text-sm font-medium">Exact action payload</p>
            <p className="break-all font-mono text-xs">SHA-256 {action.payloadSha256}</p>
            {payload.data ? (
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs">
                {JSON.stringify(payload.data.envelope, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">{payload.error ?? "Loading action…"}</p>
            )}
            <p className="text-xs text-muted-foreground">
              A changed merge head voids consent. An uncertain execution result requires
              reconciliation, never an automatic repeat.
            </p>
          </div>
        )}
        <div className="space-y-3" aria-label="Options">
          {card.body.options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={!allowed || busy}
              aria-pressed={staged === option.id}
              onClick={() => setStaged(option.id)}
              className={cn(
                "w-full space-y-2 rounded-lg border p-4 text-left disabled:opacity-60",
                staged === option.id
                  ? "border-warning/50 bg-warning-surface"
                  : "border-border hover:bg-accent",
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="font-medium">
                  {option.id} · {option.label}
                </span>
                {option.recommended && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <StarIcon className="size-3" />
                    Recommended
                  </span>
                )}
              </span>
              <span className="block text-sm text-muted-foreground">Next: {option.nextStep}</span>
              <span className="block text-xs text-muted-foreground">
                Cost: {option.cost} · {option.reversibility}
              </span>
              <span className="block text-sm">{option.consequences}</span>
            </button>
          ))}
        </div>
        <div className="space-y-2 text-sm">
          <h3 className="font-medium">Why</h3>
          <p className="text-muted-foreground">{card.body.rationale}</p>
          {[...new Set(card.body.caveats)].map((text) => (
            <p key={text} className="text-muted-foreground">
              {text}
            </p>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {Array.from(
            new Map(
              card.body.links.map((link) => [`${link.kind}:${link.ref}:${link.label ?? ""}`, link]),
            ).values(),
          ).map((link) =>
            /^https?:\/\//.test(link.ref) ? (
              <a
                key={`${link.kind}:${link.ref}:${link.label ?? ""}`}
                href={link.ref}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {link.label ?? link.ref}
              </a>
            ) : (
              <span
                key={`${link.kind}:${link.ref}:${link.label ?? ""}`}
                className="text-muted-foreground"
              >
                {link.label ?? link.ref}
              </span>
            ),
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStaged("default")}
            aria-pressed={staged === "default"}
          >
            Your call: take the recommendation
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStaged("ruled");
              noteRef.current?.focus();
            }}
          >
            Your own call
          </Button>
        </div>
        <Textarea
          ref={noteRef}
          aria-label="Decision note"
          placeholder="Add a note, or write your own direction…"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <footer className="sticky bottom-0 mt-auto flex items-center justify-between gap-4 border-t border-border bg-background px-6 py-4">
        <p className="text-sm text-muted-foreground">
          {staged
            ? `Staged: ${staged === "default" ? "your call" : staged === "ruled" ? "your own direction" : staged}`
            : "Choose an option. Nothing is sent until Send."}
        </p>
        <Button
          disabled={
            !allowed ||
            busy ||
            (!staged && !note.trim()) ||
            (staged === "ruled" && !note.trim()) ||
            (!!action && !payload.data)
          }
          onClick={() => void send()}
        >
          {busy ? "Sending…" : "Send"}
        </Button>
      </footer>
    </section>
  );
}

function Triggers({
  environmentId,
  board,
}: {
  readonly environmentId: EnvironmentId;
  readonly board: FactoryBoard;
}) {
  const run = useAtomCommand(serverEnvironment.factoryRunTrigger, "Run Factory check");
  const shadow = useAtomCommand(
    serverEnvironment.factorySetTriggerShadow,
    "Change Factory shadow mode",
  );
  const retry = useAtomCommand(serverEnvironment.factoryRetryWake, "Retry Factory wake");
  const allowed = useAtomValue(serverEnvironment.factoryRunTrigger.permissionAtom(environmentId));
  return (
    <div className="space-y-6 p-6">
      <h2 className="font-medium">Triggers & runs</h2>
      {board.triggers.map((trigger) => (
        <section key={trigger.id} className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-medium">{trigger.id}</h3>
              <p className="text-xs text-muted-foreground">
                Every {Math.round(trigger.intervalMs / 60_000)} min ·{" "}
                {trigger.shadow ? "shadow" : "live"} · {trigger.failing ? "failing" : "healthy"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!allowed}
                onClick={() =>
                  void shadow({ environmentId, input: { id: trigger.id, shadow: !trigger.shadow } })
                }
              >
                {trigger.shadow ? "Make live" : "Use shadow"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!allowed}
                onClick={() => void run({ environmentId, input: { id: trigger.id } })}
              >
                <PlayIcon />
                Run now
              </Button>
            </div>
          </div>
          {board.runs
            .filter((r) => r.triggerId === trigger.id)
            .slice(-5)
            .reverse()
            .map((record) => (
              <details key={record.id} className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  {record.outcome} · {record.newItemCount}/{record.itemCount} new ·{" "}
                  {Math.round(record.tookMs)} ms
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">
                  {record.stderr || "No stderr."}
                </pre>
              </details>
            ))}
        </section>
      ))}
      <h3 className="font-medium">Undelivered wakes</h3>
      {board.wakes
        .filter((w) => w.state === "undelivered")
        .map((wake) => (
          <div
            key={wake.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
          >
            <span>{wake.text}</span>
            <Button
              size="sm"
              disabled={!allowed}
              onClick={() => void retry({ environmentId, input: { wakeId: wake.id } })}
            >
              Retry
            </Button>
          </div>
        ))}
    </div>
  );
}

function Fleet({
  environmentId,
  board,
}: {
  readonly environmentId: EnvironmentId;
  readonly board: FactoryBoard;
}) {
  const cancel = useAtomCommand(serverEnvironment.factoryCancelLaneJob, "Cancel Factory command");
  const allowed = useAtomValue(
    serverEnvironment.factoryCancelLaneJob.permissionAtom(environmentId),
  );
  return (
    <div className="space-y-6 p-6">
      <h2 className="font-medium">Fleet</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {board.agents
          .filter((a) => a.lifecycle !== "closed")
          .map((agent) => (
            <section key={agent.id} className="space-y-2 rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">
                {agent.role} · {agent.lifecycle}
              </p>
              <Link
                to="/$environmentId/$threadId"
                params={{ environmentId, threadId: agent.threadId }}
                className="font-medium underline"
              >
                {agent.id}
              </Link>
              {agent.parentId && (
                <p className="text-xs text-muted-foreground">Reports to {agent.parentId}</p>
              )}
              <p className="text-sm">{agent.next || "No next step recorded"}</p>
              {agent.needs && (
                <p className="text-sm text-warning-foreground">Needs: {agent.needs}</p>
              )}
            </section>
          ))}
      </div>
      <h3 className="font-medium">Admission</h3>
      {board.spawns
        .filter((s) => s.state === "held")
        .map((spawn) => (
          <p key={spawn.id} className="text-sm text-muted-foreground">
            {spawn.title} · held for {spawn.modelSelection.model}
          </p>
        ))}
      <h3 className="font-medium">Command lanes</h3>
      {board.jobs.slice(-20).map((job) => (
        <div
          key={job.id}
          className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
        >
          <div>
            <p className="text-sm">{job.argv.join(" ")}</p>
            <p className="text-xs text-muted-foreground">
              {job.state} · {job.status ?? job.gitRoot}
            </p>
          </div>
          {job.state !== "terminal" && (
            <Button
              size="sm"
              variant="outline"
              disabled={!allowed}
              onClick={() => void cancel({ environmentId, input: { id: job.id } })}
            >
              Cancel
            </Button>
          )}
        </div>
      ))}
      {board.executions
        .filter((e) => e.state === "unknown")
        .map((execution) => (
          <p
            key={execution.id}
            role="alert"
            className="rounded-md border border-destructive p-4 text-sm"
          >
            Action {execution.cardId} has an unknown result. Verify its external result before
            authorising any new action.
          </p>
        ))}
    </div>
  );
}
