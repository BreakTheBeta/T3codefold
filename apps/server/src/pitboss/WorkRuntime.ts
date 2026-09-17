import { activeLeads, inboxFor, taskLead } from "./Leads.ts";
import { OrchestratorProjectionError } from "../orchestration-v2/Orchestrator.ts";
import { ProjectionStoreThreadNotFoundError } from "../orchestration-v2/ProjectionStore.ts";
import { PeerService } from "./PeerService.ts";
import {
  CommandId,
  MessageId,
  PitbossAction,
  PitbossForwardIntent,
  PitbossError,
  ProjectId,
  ThreadId,
  pitbossTaskNextAction,
  verificationRecipeForTask,
  type PitbossSnapshot,
} from "@t3tools/contracts";
import * as NodeCrypto from "node:crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as Semaphore from "effect/Semaphore";
import { WorkStore, type WorkEffect } from "./WorkStore.ts";
import { readyTasks, workContext, type WorkActor } from "./Work.ts";
import { ThreadLaunchService } from "../orchestration-v2/ThreadLaunchService.ts";
import {
  ThreadManagementProjectionLoadError,
  ThreadManagementThreadNotFoundError,
  ThreadManagementService,
  latestActiveRun,
} from "../orchestration-v2/ThreadManagementService.ts";

const encodeWake = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const decodeForward = Schema.decodeUnknownEffect(Schema.fromJsonString(PitbossForwardIntent));
const decodeAction = Schema.decodeUnknownEffect(Schema.fromJsonString(PitbossAction));
const WakeIntent = Schema.Struct({
  recipientId: Schema.String,
  leadId: Schema.optional(Schema.String),
  projectId: ProjectId,
  threadId: ThreadId,
  generation: Schema.Number,
  keys: Schema.Array(Schema.String),
});
const decodeWake = Schema.decodeUnknownEffect(Schema.fromJsonString(WakeIntent));
const isProjectionMissing = Schema.is(ProjectionStoreThreadNotFoundError);
const isManagementMissing = Schema.is(ThreadManagementThreadNotFoundError);
const isProjectionError = Schema.is(OrchestratorProjectionError);
const isManagementError = Schema.is(ThreadManagementProjectionLoadError);
function isMissingThread(error: unknown): boolean {
  if (isProjectionMissing(error) || isManagementMissing(error)) return true;
  return (isProjectionError(error) || isManagementError(error)) && isMissingThread(error.cause);
}
interface WakeRecipient {
  readonly id: string;
  readonly projectId: typeof ProjectId.Type;
  readonly threadId: typeof ThreadId.Type;
  readonly generation: number;
  readonly leadId?: string | undefined;
}
function wakeEvents(state: PitbossSnapshot, recipient: WakeRecipient) {
  const messages = inboxFor(state, recipient.leadId).filter(
    (message) => !message.acknowledged && message.threadId !== recipient.threadId,
  );
  const available =
    state.tasks.filter((task) =>
      task.attempts.some((attempt) =>
        ["pending", "running", "submitted", "stop_requested"].includes(attempt.state),
      ),
    ).length < (state.role?.brief.maxWorkers ?? 0);
  const owned = state.tasks.filter((task) => taskLead(state, task)?.id === recipient.leadId);
  const assignable = new Set(
    readyTasks(state)
      .filter((task) => owned.includes(task))
      .map((task) => task.id),
  );
  const owner = recipient.leadId ? `project lead ${recipient.leadId}` : "GLaDOS";
  const events: Array<{
    readonly key: string;
    readonly obligationKey: string;
    readonly text: string;
    readonly deliverable: boolean;
  }> = [];
  const obligationKey = (task: (typeof state.tasks)[number], action: string) => {
    const attempt = task.attempts.at(-1);
    const evidence = task.evidence.at(-1);
    const recipe = verificationRecipeForTask(state, task);
    const subject = encodeWake([
      task.criteriaVersion,
      evidence?.id ?? null,
      evidence?.candidate ?? null,
      evidence?.criteriaVersion ?? null,
      evidence?.verdict ?? null,
      evidence?.provenance ?? null,
      task.reworkRequestedAt ?? null,
      task.verificationProfileId ?? null,
      recipe?.profileId ?? null,
      recipe?.version ?? null,
      task.verification?.id ?? null,
      task.verification?.candidate ?? null,
      task.verification?.criteriaVersion ?? null,
      task.verification?.recipe.profileId ?? null,
      task.verification?.recipe.version ?? null,
    ]);
    const identity = NodeCrypto.createHash("sha256").update(subject).digest("hex");
    return `task:${task.id}:owner:${task.ownershipRevision ?? 0}:attempt:${attempt?.id ?? "none"}:action:${action}:subject:${identity}`;
  };
  // Prefer the newest changed context when several durable messages describe one obligation.
  for (const message of messages.toReversed()) {
    const task = state.tasks.find((entry) => entry.id === message.taskId);
    if (task && ["done", "cancelled"].includes(task.status)) continue;
    const attempt = task?.attempts.find((entry) => entry.threadId === message.threadId);
    const action = task ? pitbossTaskNextAction(state, task) : null;
    const eventKind = task?.decisions?.some(
      (decision) => decision.id === message.id && decision.answer === undefined,
    )
      ? "decision"
      : message.kind;
    const subject = task
      ? `task ${task.id} · attempt ${attempt?.id ?? "none"} · owner ${owner}`
      : `portfolio · owner ${owner}`;
    const resultText =
      action === "await-writer"
        ? `Result submitted · ${subject}: ${message.text.slice(0, 600)} Changed: candidate evidence was recorded without accepting it. Next: wait for the worker to stop, then run the required verification.`
        : action === "verify"
          ? `Result ready for verification · ${subject}: ${message.text.slice(0, 600)} Changed: the worker stopped and retained candidate evidence. Next: run the approved verification, then review its receipt.`
          : action === "accept"
            ? `Acceptance needed · ${subject}: ${message.text.slice(0, 600)} Changed: the latest coordinator review passed for the current candidate and proof contract. Next: explicitly accept it or record why more work is required.`
            : action === "recover"
              ? `Recovery needed · ${subject}: ${message.text.slice(0, 600)} Changed: the latest review did not establish acceptable evidence. Next: rework or cancel with an honest superseded reason.`
              : `Result ready for review · ${subject}: ${message.text.slice(0, 600)} Changed: the worker stopped and retained candidate evidence. Next: inspect the reported evidence and record review; do not accept the stopped turn itself.`;
    const progressText =
      task && task.evidence.length > 0 && action === "review"
        ? `Task updated · ${subject}: ${message.text.slice(0, 600)} Changed: the recorded update preserved the retained result. Next: review the retained candidate against the current criteria before verification.`
        : `progress · ${subject}: ${message.text.slice(0, 600)} Next: inspect the update and act only if its recorded state requires it.`;
    const text =
      eventKind === "question"
        ? `question · ${subject}: ${message.text.slice(0, 600)} Next: answer within the charter or record a user decision.`
        : eventKind === "decision"
          ? `decision · ${subject}: ${message.text.slice(0, 600)} Next: Resolve the recorded decision before resuming this task.`
          : message.kind === "result"
            ? resultText
            : progressText;
    // Questions and decisions are independent obligations even when they concern the same task.
    // Results and progress still coalesce around the task's current next action, so repeated status
    // reports cannot keep waking a coordinator whose obligation did not change.
    const obligation =
      eventKind === "question" || eventKind === "decision"
        ? `message:${message.id}`
        : task
          ? obligationKey(task, action ?? eventKind)
          : `message:${message.id}`;
    events.push({
      key: task
        ? `message:${message.id}:owner:${task.ownershipRevision ?? 0}:action:${action ?? eventKind}`
        : `message:${message.id}`,
      obligationKey: obligation,
      text,
      deliverable: true,
    });
  }
  for (const task of owned) {
    const action = pitbossTaskNextAction(state, task);
    const attempt = task.attempts.at(-1);
    if (!action || !["assign", "verify", "review", "recover", "accept"].includes(action)) continue;
    if (action === "assign" && !assignable.has(task.id)) continue;
    const key = obligationKey(task, action);
    const subject = `task ${task.id} · attempt ${attempt?.id ?? "none"} · owner ${owner}`;
    const text =
      action === "assign"
        ? task.reworkRequestedAt
          ? `Rework ready · ${subject}. Changed: an explicit rework request reopened the retained candidate. Next: assign a managed worker with resumeAttemptId ${attempt?.id ?? "none"}; the prior evidence remains historical and is not accepted.`
          : `Ready to assign · ${subject}. Changed: prerequisites are satisfied and no retained result needs review. Next: assign a managed worker or record the condition that blocks assignment.`
        : action === "verify"
          ? `Verification needed · ${subject}. Changed: a stopped candidate has current evidence and an approved profile. Next: run the approved verification; do not assign duplicate implementation work.`
          : action === "review"
            ? `Result ready for review · ${subject}. Changed: a stopped candidate is retained. Next: inspect it and record current review before verification or acceptance; do not assign duplicate implementation work.`
            : action === "accept"
              ? `Acceptance needed · ${subject}. Changed: the latest coordinator review passed for the current candidate and proof contract. Next: inspect that review and explicitly accept or record why more work is required.`
              : `Recovery needed · ${subject}. Changed: the latest retained result is not acceptable evidence. Next: inspect the retained thread, then rework or cancel with an honest superseded reason; do not invent evidence for historical work.`;
    events.push({
      key,
      obligationKey: key,
      text,
      deliverable: action !== "assign" || available,
    });
  }
  return events;
}
export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const store = yield* WorkStore;
    const peers = yield* PeerService;
    const threads = yield* ThreadManagementService;
    const launch = yield* ThreadLaunchService;
    const drainLock = yield* Semaphore.make(1);
    let lastLeadId: string | undefined;
    const processWake = Effect.fn("WorkRuntime.processWake")(function* (effect: WorkEffect) {
      const intent = yield* decodeWake(effect.payload_json);
      const finish = (keys: ReadonlyArray<string>) =>
        store.finishWake(effect.operation_id, encodeWake({ ...intent, keys }));
      const state = yield* store.read();
      if (!state.role) {
        yield* finish([]);
        return;
      }
      if (state.role.paused) return;
      const recipient: WakeRecipient | undefined = intent.leadId
        ? activeLeads(state)
            .filter((lead) => lead.id === intent.leadId)
            .map((lead) => ({
              id: lead.id,
              projectId: lead.projectId,
              threadId: lead.threadId,
              generation: lead.generation,
              leadId: lead.id,
            }))[0]
        : {
            id: "glados",
            projectId: state.role.projectId,
            threadId: state.role.threadId,
            generation: state.role.generation,
          };
      const current = recipient ? wakeEvents(state, recipient) : [];
      const currentByKey = new Map(current.map((event) => [event.key, event]));
      const matched = intent.keys.flatMap((key) => {
        const event = currentByKey.get(key);
        return event ? [event] : [];
      });
      if (
        !recipient ||
        recipient.id !== intent.recipientId ||
        recipient.generation !== intent.generation ||
        matched.length === 0
      ) {
        yield* finish([]);
        return;
      }
      const deliverable = matched.filter((event) => event.deliverable);
      if (deliverable.length === 0) return;
      const thread = yield* Effect.result(
        threads.getProjectThread({ projectId: recipient.projectId, threadId: recipient.threadId }),
      );
      if (thread._tag === "Success" && latestActiveRun(thread.success)) return;
      if (thread._tag === "Failure") {
        yield* store.retryEffect(effect.operation_id, String(thread.failure));
        return;
      }
      const delivered = yield* Effect.result(
        threads.sendToThread({
          projectId: recipient.projectId,
          threadId: recipient.threadId,
          commandId: CommandId.make(effect.operation_id),
          messageId: MessageId.make(effect.operation_id),
          text: ["Managed work changed:", ...deliverable.map((event) => event.text)].join("\n"),
          attachments: [],
          mode: "queue",
          createdBy: "system",
          creationSource: "server",
        }),
      );
      if (delivered._tag === "Failure") {
        yield* store.retryEffect(effect.operation_id, String(delivered.failure));
        return;
      }
      yield* finish(
        deliverable.flatMap((event) =>
          event.key === event.obligationKey ? [event.key] : [event.key, event.obligationKey],
        ),
      );
    });
    const drain = Effect.fn("WorkRuntime.drain")(function* () {
      const pending = yield* store.effects();
      for (const effect of pending) {
        if (effect.kind === "wake") {
          yield* processWake(effect);
          continue;
        }
        const current = yield* store.read();
        const leadStatusAction =
          effect.kind === "lead-status" ? yield* decodeAction(effect.payload_json) : undefined;
        if (
          current.role?.paused &&
          (effect.kind === "create-lead" ||
            effect.kind === "assign" ||
            (leadStatusAction?.type === "lead-status" && leadStatusAction.status === "active"))
        )
          continue;
        if (
          effect.kind === "create-lead" ||
          (leadStatusAction?.type === "lead-status" && leadStatusAction.status === "active")
        ) {
          const action = leadStatusAction ?? (yield* decodeAction(effect.payload_json));
          const target =
            action.type === "create-lead" || action.type === "lead-status"
              ? action.leadId
              : undefined;
          const busy = yield* Effect.forEach(
            activeLeads(current).filter((lead) => lead.id !== target),
            (lead) =>
              threads.getProjectThread({ projectId: lead.projectId, threadId: lead.threadId }).pipe(
                Effect.map((thread) => !!latestActiveRun(thread)),
                Effect.catch((error) =>
                  isMissingThread(error) ? Effect.succeed(false) : Effect.fail(error),
                ),
              ),
          );
          if (busy.some(Boolean)) continue;
        }
        if (leadStatusAction?.type === "lead-status" && leadStatusAction.status === "active") {
          const lead = activeLeads(current).find((entry) => entry.id === leadStatusAction.leadId);
          if (lead) {
            const thread = yield* threads
              .getProjectThread({ projectId: lead.projectId, threadId: lead.threadId })
              .pipe(
                Effect.map((projection) => projection),
                Effect.catch((error) =>
                  isMissingThread(error) ? Effect.succeed(undefined) : Effect.fail(error),
                ),
              );
            if (thread && latestActiveRun(thread)) continue;
          }
        }
        const result = yield* Effect.result(
          Effect.gen(function* () {
            if (effect.kind === "forward") {
              const forward = yield* decodeForward(effect.payload_json);
              yield* peers.send(forward.peerId, forward.message);
              return;
            }
            const action = yield* decodeAction(effect.payload_json);
            const state = yield* store.read();
            if (action.type === "send-peer") {
              const message = state.messages.find((entry) => entry.id === effect.operation_id);
              if (!message?.threadId)
                return yield* new PitbossError({
                  code: "invalid",
                  message: "The originating thread is unavailable.",
                });
              yield* peers.send(action.peerId, {
                id: effect.operation_id,
                text: action.text,
                replyTo: action.replyTo,
                originThreadId: message.threadId,
                createdAt: message.createdAt,
              });
            }
            if (action.type === "propose-coordination") {
              const known = yield* peers.list();
              const peer = known.peers.find((entry) => entry.config.id === action.peerId);
              if (!peer)
                return yield* new PitbossError({
                  code: "invalid",
                  message:
                    "The proposed peer is no longer configured. Configure it before proposing again.",
                });
              yield* peers.execute({
                type: "propose",
                peerId: action.peerId,
                proposal: {
                  id: effect.operation_id,
                  scope: peer.config.scope,
                  coordinator: action.coordinator,
                  participants: [known.environmentId, peer.config.environmentId],
                },
              });
            }
            if (
              (action.type === "elect" ||
                (action.type === "brief" && action.applyCoordinatorPermissions)) &&
              state.role
            ) {
              if (action.type === "elect" && state.role.threadId !== action.threadId) return;
              const mode = state.role.brief.coordinatorRuntimeMode;
              if (mode !== undefined) {
                yield* threads.dispatch({
                  type: "thread.runtime-mode.set",
                  commandId: CommandId.make(`${effect.operation_id}:permissions`),
                  threadId: state.role.threadId,
                  runtimeMode: mode,
                });
              }
            }
            if (action.type === "elect") {
              if (state.role?.threadId !== action.threadId) return;
              const electedThread = yield* threads.getProjectThread({
                threadId: action.threadId,
                projectId: action.projectId,
              });
              if (electedThread.thread.archivedAt !== null)
                yield* threads.dispatch({
                  type: "thread.unarchive",
                  commandId: CommandId.make(`${effect.operation_id}:restore`),
                  threadId: action.threadId,
                });
              yield* threads.dispatch({
                type: "thread.pin",
                commandId: CommandId.make(`${effect.operation_id}:pin`),
                threadId: action.threadId,
              });
            }
            if (
              ((action.type === "elect" && action.startCoordinator) ||
                (action.type === "brief" && action.applyCoordinatorPermissions)) &&
              state.role &&
              !state.role.paused &&
              state.role.brief.coordinatorRuntimeMode === "full-access" &&
              state.role.brief.workerRuntimeMode === "full-access" &&
              state.role.brief.projectIds.length > 0
            ) {
              const coordinator = yield* threads.getProjectThread({
                projectId: state.role.projectId,
                threadId: state.role.threadId,
              });
              if (!latestActiveRun(coordinator))
                yield* threads.sendToThread({
                  projectId: state.role.projectId,
                  threadId: state.role.threadId,
                  commandId: CommandId.make(`${effect.operation_id}:start`),
                  messageId: MessageId.make(`${effect.operation_id}:start`),
                  text: "Full auto is enabled for GLaDOS and new workers within the saved brief. Read work_read, inspect the approved projects, and create and assign bounded useful work from the saved priorities. Preserve existing tasks and decisions. Use the saved verificationMode: in automatic mode inspect capabilities and configure checks for unattempted work with propose-verification yourself; otherwise prepare one recipe proposal for user review. Never waive verification. End your turn when no independent work is actionable.",
                  mode: "auto",
                  attachments: [],
                  createdBy: "system",
                  creationSource: "server",
                });
            }
            if (action.type === "create-lead" || action.type === "lead-status") {
              const lead = state.leads?.find((entry) => entry.id === action.leadId);
              if (!lead) return;
              const existing =
                action.type === "lead-status"
                  ? yield* threads
                      .getProjectThread({ projectId: lead.projectId, threadId: lead.threadId })
                      .pipe(
                        Effect.map((projection) => projection),
                        Effect.catch((error) =>
                          isMissingThread(error) ? Effect.succeed(undefined) : Effect.fail(error),
                        ),
                      )
                  : undefined;
              if (action.type === "lead-status" && action.status === "dormant") {
                const run = existing && latestActiveRun(existing);
                if (run)
                  yield* threads.interruptThread({
                    projectId: lead.projectId,
                    threadId: lead.threadId,
                    runId: run.id,
                    commandId: CommandId.make(`${effect.operation_id}:stop`),
                    reason: "Project lead was made dormant",
                  });
                return;
              }
              if (!activeLeads(state).some((entry) => entry.id === lead.id)) return;
              if (existing) {
                if (action.type === "lead-status" && action.runtimeMode !== undefined)
                  yield* threads.dispatch({
                    type: "thread.runtime-mode.set",
                    commandId: CommandId.make(`${effect.operation_id}:permissions`),
                    threadId: lead.threadId,
                    runtimeMode: action.runtimeMode,
                  });
                return;
              }
              yield* launch.launch({
                commandId: CommandId.make(effect.operation_id),
                threadId: lead.threadId,
                projectId: lead.projectId,
                title: `Project lead · ${lead.id}`,
                initialMessage: {
                  text: workContext(state, lead.threadId) ?? lead.charter,
                  attachments: [],
                },
                modelSelection: lead.model,
                runtimeMode:
                  lead.runtimeMode ?? state.role?.brief.workerRuntimeMode ?? "approval-required",
                interactionMode: "default",
                workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
                createdBy: "agent",
                creationSource: "mcp",
              });
            }
            if (action.type === "assign") {
              const task = state.tasks.find((task) => task.id === action.taskId);
              const attempt = task?.attempts.find((attempt) => attempt.id === effect.operation_id);
              if (!task || !attempt || attempt.state !== "pending") return;
              yield* launch.launch({
                commandId: CommandId.make(attempt.id),
                threadId: attempt.threadId,
                projectId: task.projectId,
                title: task.title,
                modelSelection: attempt.model,
                runtimeMode:
                  attempt.runtimeMode ?? state.role?.brief.workerRuntimeMode ?? "approval-required",
                interactionMode: "default",
                workspaceStrategy: task.workspaceStrategy,
                initialMessage: {
                  text: workContext(state, attempt.threadId) ?? task.outcome,
                  attachments: [],
                },
                createdBy: "agent",
                creationSource: "mcp",
              });
              yield* store.updateAttempt(task.id, attempt.id, "running", "Worker launched");
            }
            if (
              action.type === "cancel" ||
              action.type === "close" ||
              action.type === "rework" ||
              action.type === "revise-result" ||
              action.type === "request-decision"
            ) {
              const task = state.tasks.find((task) => task.id === action.taskId);
              for (const attempt of task?.attempts ?? []) {
                if (attempt.state !== "stop_requested" || !task) continue;
                const stopped = yield* threads.interruptThread({
                  projectId: task.projectId,
                  threadId: attempt.threadId,
                  commandId: CommandId.make(`${effect.operation_id}:stop:${attempt.id}`),
                  reason:
                    action.type === "request-decision"
                      ? action.question
                      : action.type === "close"
                        ? action.reason
                        : action.note,
                });
                if (stopped.type !== "interrupt_requested")
                  yield* store.updateAttempt(
                    task.id,
                    attempt.id,
                    "stopped",
                    "Previous writer stopped; artifacts remain in its thread/workspace",
                  );
              }
            }
          }),
        );
        if (result._tag === "Failure") {
          const detail = `${effect.kind} (${effect.operation_id}): ${String(result.failure)}`;
          const state = yield* store.read();
          for (const task of state.tasks) {
            const attempt = task.attempts.find((attempt) => attempt.id === effect.operation_id);
            // A failed launch may already have created a process. Keep ownership until inspection resolves it.
            if (attempt)
              yield* store.updateAttempt(
                task.id,
                attempt.id,
                "stop_requested",
                `Dispatch needs inspection: ${detail}`,
              );
          }
          yield* store.finishEffect(effect.operation_id, detail);
        } else yield* store.finishEffect(effect.operation_id);
      }
      let state: PitbossSnapshot = yield* store.read();
      for (const task of state.tasks) {
        const authority = state.sourceAuthorities?.find(
          (entry) => entry.scope === task.source?.scope,
        );
        if (task.homeEnvironmentId && authority && task.homeEnvironmentId !== authority.self)
          continue;
        const attempt = task.attempts.at(-1);
        if (!attempt || !["running", "submitted", "stop_requested"].includes(attempt.state))
          continue;
        const observed = yield* Effect.result(threads.getThreadProjection(attempt.threadId));
        if (observed._tag === "Failure" && isMissingThread(observed.failure)) {
          yield* store.updateAttempt(
            task.id,
            attempt.id,
            "stopped",
            "No thread was created. Dispatch failed before a writer existed; review and reopen to retry.",
          );
        }
        if (
          observed._tag === "Success" &&
          observed.success.thread.worktreePath &&
          attempt.workspacePath !== observed.success.thread.worktreePath
        ) {
          yield* store.updateAttempt(
            task.id,
            attempt.id,
            attempt.state,
            attempt.detail,
            observed.success.thread.worktreePath,
          );
        }
        if (
          observed._tag === "Success" &&
          observed.success.runs.length > 0 &&
          !latestActiveRun(observed.success)
        ) {
          yield* store.updateAttempt(
            task.id,
            attempt.id,
            "stopped",
            task.status === "active"
              ? "Worker finished without submitting evidence. Inspect its thread and request rework."
              : "Worker stopped; evidence and workspace retained",
          );
        }
      }
      state = yield* store.read();
      // A single revise-result command owns the whole recovery transition. It first drains the
      // old writer above, then this durable request becomes an ordinary checked assignment. Using
      // WorkStore.command keeps attempt, capacity, ownership, model and runtime-mode fences in the
      // same decider as every other launch.
      for (const task of state.tasks) {
        const request = task.revisionRequest;
        if (!request || state.role?.paused) continue;
        const authority = state.sourceAuthorities?.find(
          (entry) => entry.scope === task.source?.scope,
        );
        const lead = task.leadId
          ? activeLeads(state).find((entry) => entry.id === task.leadId)
          : undefined;
        const actor: WorkActor | undefined =
          authority?.proposalId &&
          authority.coordinator &&
          authority.homeEnvironmentId === authority.self &&
          authority.coordinator !== authority.self
            ? {
                type: "peer",
                environmentId: authority.coordinator,
                scope: authority.scope,
                proposalId: authority.proposalId,
              }
            : lead
              ? { type: "agent", threadId: lead.threadId }
              : !task.leadId && state.role
                ? { type: "agent", threadId: state.role.threadId }
                : undefined;
        const ready = readyTasks(state, actor?.type === "peer" ? actor.scope : undefined).some(
          (entry) => entry.id === task.id,
        );
        if (!actor || !ready) continue;
        const attempt = task.attempts.at(-1);
        const assigned = yield* Effect.result(
          store.command(
            {
              commandId: CommandId.make(`${request.id}:assign`),
              expectedRevision: state.revision,
              ...(actor.type === "agent"
                ? {
                    authorityGeneration:
                      lead?.generation ??
                      (state.role?.threadId === actor.threadId ? state.role.generation : undefined),
                  }
                : {}),
              action: {
                type: "assign",
                taskId: task.id,
                ...(request.model ? { model: request.model } : {}),
                ...(request.runtimeMode ? { runtimeMode: request.runtimeMode } : {}),
                ...(attempt?.state === "stopped" && attempt.workspacePath
                  ? { resumeAttemptId: attempt.id }
                  : {}),
              },
            },
            actor,
            actor.type === "agent"
              ? {
                  runtimeMode:
                    request.runtimeMode ??
                    lead?.runtimeMode ??
                    state.role?.brief.workerRuntimeMode ??
                    "approval-required",
                }
              : undefined,
          ),
        );
        if (assigned._tag === "Success") {
          state = yield* store.read();
          break;
        }
        const detail = `Managed revision could not start: ${assigned.failure.message}`;
        const parked = yield* Effect.result(
          store.command(
            {
              commandId: CommandId.make(`${request.id}:blocked`),
              expectedRevision: state.revision,
              ...(actor.type === "agent"
                ? {
                    authorityGeneration:
                      lead?.generation ??
                      (state.role?.threadId === actor.threadId ? state.role.generation : undefined),
                  }
                : {}),
              action: { type: "rework", taskId: task.id, note: detail },
            },
            actor,
          ),
        );
        if (parked._tag === "Failure") continue;
        yield* store.receiveMessage({
          id: `${request.id}:blocked-message`,
          taskId: task.id,
          threadId: null,
          kind: "question",
          text: `${detail}. Correct the saved model, permissions, workspace, or ownership before retrying.`,
          createdAt: DateTime.formatIso(yield* DateTime.now),
          acknowledged: false,
        });
        state = yield* store.read();
        break;
      }
      const role = state.role;
      if (!role || role.paused) return;
      const leads = activeLeads(state);
      const leadRuns = yield* Effect.forEach(leads, (lead) =>
        threads.getProjectThread({ projectId: lead.projectId, threadId: lead.threadId }).pipe(
          Effect.map((thread) => ({ lead, active: !!latestActiveRun(thread), available: true })),
          Effect.catch((error) =>
            isMissingThread(error)
              ? Effect.succeed({ lead, active: false, available: false })
              : Effect.fail(error),
          ),
        ),
      );
      const recipients = [
        {
          id: "glados",
          projectId: role.projectId,
          threadId: role.threadId,
          generation: role.generation,
          leadId: undefined as string | undefined,
        },
        ...(!leadRuns.some((entry) => entry.active)
          ? leadRuns
              .filter((entry) => entry.available)
              .map((entry) => entry.lead)
              .toSorted((a, b) => Number(a.id === lastLeadId) - Number(b.id === lastLeadId))
              .map((lead) => ({
                id: lead.id,
                projectId: lead.projectId,
                threadId: lead.threadId,
                generation: lead.generation,
                leadId: lead.id,
              }))
          : []),
      ];
      let wokeLead = false;
      for (const recipient of recipients) {
        if (recipient.leadId && wokeLead) continue;
        const recorded = new Set(yield* store.wakeKeys(recipient.id, recipient.generation));
        const obligations = new Set<string>();
        const events = wakeEvents(state, recipient)
          .filter((event) => event.deliverable && !recorded.has(event.key))
          .filter((event) => {
            if (obligations.has(event.obligationKey)) return false;
            obligations.add(event.obligationKey);
            return true;
          })
          .slice(0, 8);
        if (!events.length) continue;
        const thread = yield* threads.getProjectThread({
          projectId: recipient.projectId,
          threadId: recipient.threadId,
        });
        if (latestActiveRun(thread)) continue;
        const operationId = `pitboss:wake:${NodeCrypto.createHash("sha256")
          .update(
            encodeWake([recipient.id, recipient.generation, events.map((event) => event.key)]),
          )
          .digest("hex")}`;
        const intent = {
          recipientId: recipient.id,
          ...(recipient.leadId ? { leadId: recipient.leadId } : {}),
          projectId: recipient.projectId,
          threadId: recipient.threadId,
          generation: recipient.generation,
          keys: events.map((event) => event.key),
        };
        const queued = yield* store.queueWake(operationId, encodeWake(intent));
        if (queued)
          yield* processWake({
            operation_id: operationId,
            kind: "wake",
            payload_json: encodeWake(intent),
            attempts: 0,
            error: null,
          });
        if (recipient.leadId) {
          wokeLead = true;
          lastLeadId = recipient.leadId;
        }
      }
    }, drainLock.withPermits(1));
    // Subscribe first, then perform recovery. Event receipts, not model polling, drive subsequent work.
    const wakes = Stream.merge(
      store.changes,
      threads.streamDomainEvents.pipe(
        Stream.filter((event) => event.type === "run.updated"),
        Stream.map(() => undefined),
      ),
    );
    yield* wakes.pipe(
      Stream.buffer({ capacity: 1, strategy: "sliding" }),
      Stream.runForEach(() => drain().pipe(Effect.catchCause(Effect.logWarning))),
      Effect.forkScoped,
    );
    yield* drain().pipe(Effect.catchCause(Effect.logWarning));
  }),
);
