import {
  FACTORY_CARD_KIND_LABEL,
  factoryAgentRows,
  openFactoryCards,
  recentFactoryAnswers,
} from "@t3tools/client-runtime/factory-view";
import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import {
  ThreadId,
  type EnvironmentId,
  type FactoryBoard,
  type FactoryCard,
} from "@t3tools/contracts";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  FactoryIcon,
  PlayIcon,
  RefreshCwIcon,
  StarIcon,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useEnvironmentIdentities } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { cn } from "../../lib/utils";
import { isElectron } from "../../env";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { Alert, AlertDescription } from "../ui/alert";

const TABS = ["Decisions", "Fleet", "Checks"] as const;

export function FactoryPage() {
  const environments = useEnvironmentIdentities();
  const [selected, setSelected] = useState<EnvironmentId | null>(null);
  const environmentId =
    environments.find((e) => e.environmentId === selected)?.environmentId ??
    environments[0]?.environmentId;
  const environmentPicker =
    environments.length > 1 ? (
      <div className="w-36 min-w-0 sm:w-44">
        <Select
          value={environmentId ?? ""}
          onValueChange={(id) => setSelected(id as EnvironmentId)}
        >
          <SelectTrigger size="sm" aria-label="Factory environment">
            <SelectValue>
              {environments.find((env) => env.environmentId === environmentId)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {environments.map((env) => (
              <SelectItem key={env.environmentId} value={env.environmentId}>
                {env.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>
    ) : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {environmentId ? (
        <EnvironmentFactory
          key={environmentId}
          environmentId={environmentId}
          environmentPicker={environmentPicker}
        />
      ) : (
        <>
          <WorkspacePageHeader electron={isElectron}>
            <h1 className="text-sm font-semibold">Factory</h1>
          </WorkspacePageHeader>
          <p className="p-4 text-sm text-muted-foreground">
            Connect an environment to open its Factory.
          </p>
        </>
      )}
    </div>
  );
}

function EnvironmentFactory({
  environmentId,
  environmentPicker,
}: {
  readonly environmentId: EnvironmentId;
  readonly environmentPicker: ReactNode;
}) {
  const query = useEnvironmentQuery(serverEnvironment.factoryBoard({ environmentId, input: {} }));
  const [tab, setTab] = useState<(typeof TABS)[number]>("Decisions");
  const board = query.data;
  const commander = board?.agents.find(
    (a) => a.role === "commander" && a.lifecycle !== "closed" && a.lifecycle !== "retired",
  );
  const cards = board?.cards.filter((c) => c.state === "open") ?? [];
  const unknown =
    board?.executions.filter((execution) => execution.state === "unknown").length ?? 0;
  const failing = board?.triggers.filter((trigger) => trigger.failing).length ?? 0;
  const undelivered = board?.wakes.filter((wake) => wake.state === "undelivered").length ?? 0;
  const tabs = (
    <nav className="flex gap-1" aria-label="Factory sections">
      {TABS.map((name) => (
        <Button
          key={name}
          variant={tab === name ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={tab === name}
          onClick={() => setTab(name)}
        >
          {name}
          {name === "Decisions" && board ? ` · ${cards.length}` : ""}
        </Button>
      ))}
    </nav>
  );
  return (
    <>
      <WorkspacePageHeader electron={isElectron} className="border-b border-border">
        <h1 className="flex shrink-0 items-center gap-2 text-sm font-semibold">
          <FactoryIcon className="size-4" />
          Factory
        </h1>
        <div className="hidden lg:block">{tabs}</div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {environmentPicker}
          {commander && (
            <Link
              to="/$environmentId/$threadId"
              params={{ environmentId, threadId: commander.threadId }}
              aria-label="Open Commander"
              className="inline-flex shrink-0 items-center gap-1 rounded-sm p-1 text-xs font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="hidden sm:inline">Commander</span>
              <ArrowUpRightIcon className="size-4" />
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={query.refresh}
            aria-label="Refresh Factory"
          >
            <RefreshCwIcon />
          </Button>
        </div>
      </WorkspacePageHeader>
      <div className="shrink-0 border-b border-border px-3 py-1.5 lg:hidden">{tabs}</div>
      {!!(unknown || failing || undelivered) && (
        <div className="shrink-0 px-4 py-2">
          <Alert variant={unknown ? "error" : "warning"}>
            <AlertDescription>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                {!!unknown && (
                  <button
                    type="button"
                    onClick={() => setTab("Fleet")}
                    className="rounded-sm text-left underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {unknown} action result{unknown === 1 ? "" : "s"} unknown. Verify before
                    authorising another action.
                  </button>
                )}
                {!!failing && (
                  <button
                    type="button"
                    onClick={() => setTab("Checks")}
                    className="rounded-sm underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {failing} failing check{failing === 1 ? "" : "s"}
                  </button>
                )}
                {!!undelivered && (
                  <button
                    type="button"
                    onClick={() => setTab("Checks")}
                    className="rounded-sm underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {undelivered} undelivered wake{undelivered === 1 ? "" : "s"}
                  </button>
                )}
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}
      {query.error && (
        <p role="alert" className="px-6 py-4 text-destructive">
          {query.error}
        </p>
      )}
      {!board ? (
        <p className="p-4 text-sm text-muted-foreground">
          {query.error ? "Factory is unavailable. Refresh to retry." : "Loading Factory…"}
        </p>
      ) : (
        <>
          {!commander && <CommanderSetup environmentId={environmentId} />}
          {tab === "Decisions" ? (
            <Decisions environmentId={environmentId} board={board} />
          ) : tab === "Checks" ? (
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
        <div className="w-full min-w-0 sm:w-80">
          <Select value={selected?.key ?? ""} onValueChange={(key) => setModelKey(key)}>
            <SelectTrigger aria-label="Commander model">
              <SelectValue placeholder="Choose a model">{selected?.label}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {models.map((model) => (
                <SelectItem key={model.key} value={model.key}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
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

export function Decisions({
  environmentId,
  board,
}: {
  readonly environmentId: EnvironmentId;
  readonly board: FactoryBoard;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const cards = openFactoryCards(board.cards);
  const selected = cards.find((c) => c.id === selectedId) ?? cards[0];
  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside
        className={cn(
          "min-h-0 overflow-y-auto border-r border-border p-2",
          showDetail && selected && "hidden lg:block",
        )}
        aria-label="Open decisions"
      >
        {!cards.length && (
          <p className="p-2 text-sm text-muted-foreground">No decisions need your answer.</p>
        )}
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => {
              setSelectedId(card.id);
              setShowDetail(true);
            }}
            aria-pressed={selected?.id === card.id}
            className={cn(
              "mb-1 w-full rounded-md border border-transparent px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-ring",
              selected?.id === card.id ? "border-border bg-accent" : "hover:bg-accent/60",
            )}
          >
            <span className="block text-sm font-medium leading-snug">{card.body.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {card.body.blocking && (
                <span className="font-medium text-warning-foreground">Blocking</span>
              )}
              <span>{FACTORY_CARD_KIND_LABEL[card.body.kind]}</span>
              <span>{card.body.urgency.replace("this-week", "this week")}</span>
              <time
                dateTime={new Date(card.createdAt).toISOString()}
                aria-label={`Created ${new Date(card.createdAt).toLocaleString()}`}
              >
                {new Date(card.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </time>
            </span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {card.ownerId}
            </span>
          </button>
        ))}
        {board.cards.some((card) => card.state === "answered" || card.state === "acked") && (
          <details className="px-2 py-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Recent answers</summary>
            {recentFactoryAnswers(board.cards).map((card) => (
              <p key={card.id} className="px-2 py-1 text-sm">
                <span className="text-muted-foreground">
                  {card.outcome === "DEFAULTED"
                    ? "Deferred to agent"
                    : card.outcome === "RULED"
                      ? "Your direction"
                      : card.outcome === "CHOSE-against"
                        ? "Chose another option"
                        : "Chosen"}
                </span>{" "}
                · {card.body.title}
              </p>
            ))}
          </details>
        )}
      </aside>
      {selected ? (
        <div className={cn("min-h-0 min-w-0 overflow-y-auto", !showDetail && "hidden lg:block")}>
          <div className="border-b border-border px-4 py-2 lg:hidden">
            <Button variant="ghost" size="sm" onClick={() => setShowDetail(false)}>
              <ArrowLeftIcon />
              All decisions · {cards.length}
            </Button>
          </div>
          <CardDetail
            key={`${selected.id}:${selected.revision}`}
            environmentId={environmentId}
            card={selected}
            owner={board.agents.find((agent) => agent.id === selected.ownerId)}
          />
        </div>
      ) : (
        <div className="p-8 text-sm text-muted-foreground">
          Your agents can keep working. New questions will appear here.
        </div>
      )}
    </div>
  );
}

export function CardDetail({
  environmentId,
  card,
  owner,
}: {
  readonly environmentId: EnvironmentId;
  readonly card: FactoryCard;
  readonly owner: FactoryBoard["agents"][number] | undefined;
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
    if (
      !allowed ||
      busy ||
      (!staged && !note.trim()) ||
      (staged === "ruled" && !note.trim()) ||
      (!!action && !payload.data)
    )
      return;
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
    <section className="flex min-h-full min-w-0 flex-col" aria-label={card.body.title}>
      <div className="w-full max-w-4xl space-y-4 p-4 lg:px-6">
        <div>
          <p className="text-xs text-muted-foreground">
            {card.body.blocking && (
              <span className="mr-2 font-medium text-warning-foreground">Blocking</span>
            )}
            {FACTORY_CARD_KIND_LABEL[card.body.kind]} ·{" "}
            {card.body.urgency.replace("this-week", "this week")} · revision {card.revision}
            {owner ? (
              <>
                {" "}
                ·{" "}
                <Link
                  to="/$environmentId/$threadId"
                  params={{ environmentId, threadId: owner.threadId }}
                  className="rounded-sm underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {owner.id} ↗
                </Link>
              </>
            ) : (
              ` · ${card.ownerId}`
            )}
          </p>
          <h2 className="mt-1 break-words text-lg font-semibold">{card.body.title}</h2>
        </div>
        <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Doing</dt>
          <dd>{card.body.context.doing}</dd>
          <dt className="text-muted-foreground">Why you</dt>
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
        <div className="space-y-2" aria-label="Options">
          {card.body.options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={!allowed || busy}
              aria-pressed={staged === option.id}
              onClick={() => setStaged(option.id)}
              className={cn(
                "w-full space-y-1.5 rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60",
                staged === option.id ? "border-ring bg-accent" : "border-border hover:bg-accent",
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="min-w-0 break-words font-medium">
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
        <details className="space-y-2 text-sm">
          <summary className="cursor-pointer font-medium">Reasoning</summary>
          <p className="text-muted-foreground">{card.body.rationale}</p>
        </details>
        {[...new Set(card.body.caveats)].map((text) => (
          <p key={text} className="text-sm text-muted-foreground">
            {text}
          </p>
        ))}
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
            ) : link.kind === "thread" ? (
              <Link
                key={`${link.kind}:${link.ref}:${link.label ?? ""}`}
                to="/$environmentId/$threadId"
                params={{ environmentId, threadId: ThreadId.make(link.ref) }}
                className="rounded-sm underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                {link.label ?? "Open thread"}
              </Link>
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
            disabled={!allowed || busy}
            aria-pressed={staged === "default"}
          >
            Defer to agent (uses recommendation)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!allowed || busy}
            onClick={() => {
              setStaged("ruled");
              noteRef.current?.focus();
            }}
          >
            Write my own direction
          </Button>
        </div>
        <Textarea
          size="sm"
          ref={noteRef}
          aria-label="Decision note"
          disabled={!allowed || busy}
          placeholder="Add a note, or write your own direction…"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <footer className="sticky bottom-0 mt-auto flex items-center justify-between gap-4 border-t border-border bg-background px-4 py-3">
        <p className="min-w-0 text-sm text-muted-foreground" role="status">
          {staged
            ? `Staged: ${staged === "default" ? "your call" : staged === "ruled" ? "your own direction" : (card.body.options.find((option) => option.id === staged)?.label ?? staged)}`
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
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <h2 className="font-medium">Triggers & runs</h2>
      {board.triggers.map((trigger) => (
        <section key={trigger.id} className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-medium">{trigger.id}</h3>
              <p className="text-xs text-muted-foreground">
                Every {Math.round(trigger.intervalMs / 60_000)} min ·{" "}
                {!trigger.enabled ? "disabled" : trigger.shadow ? "observe only" : "live"} ·{" "}
                {trigger.failing ? "last check failed" : "no failure recorded"}
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
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <h2 className="font-medium">Fleet</h2>
      <p className="text-xs text-muted-foreground">
        Factory roles and lifecycle. Open a thread for its live activity.
      </p>
      <div className="divide-y divide-border rounded-lg border border-border">
        {factoryAgentRows(board.agents).map(({ agent, depth }) => (
          <section
            key={agent.id}
            className="px-3 py-2.5"
            style={{ paddingLeft: `${12 + Math.min(depth, 3) * 20}px` }}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <Link
                to="/$environmentId/$threadId"
                params={{ environmentId, threadId: agent.threadId }}
                className="inline-flex min-w-0 items-center gap-1 rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="break-all">{agent.id}</span>
                <ArrowUpRightIcon className="size-3.5 shrink-0" />
              </Link>
              <span className="text-xs text-muted-foreground">
                {agent.role} · {agent.lifecycle}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {agent.next || "No next step recorded"}
            </p>
            {agent.needs && (
              <p className="mt-1 text-sm text-warning-foreground">Needs: {agent.needs}</p>
            )}
            {agent.parentId && (
              <p className="mt-1 text-xs text-muted-foreground">Reports to {agent.parentId}</p>
            )}
          </section>
        ))}
        {!board.agents.some((agent) => agent.lifecycle !== "closed") && (
          <p className="p-3 text-sm text-muted-foreground">No agents enrolled yet.</p>
        )}
      </div>
      <h3 className="text-sm font-medium">
        Waiting for capacity · {board.spawns.filter((spawn) => spawn.state === "held").length}
      </h3>
      {board.spawns
        .filter((s) => s.state === "held")
        .map((spawn) => (
          <p key={spawn.id} className="text-sm text-muted-foreground">
            {spawn.title} · held for {spawn.modelSelection.model}
          </p>
        ))}
      <h3 className="text-sm font-medium">
        Command lanes · {board.jobs.filter((job) => job.state !== "terminal").length} in progress
      </h3>
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
