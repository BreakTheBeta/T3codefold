import { ProjectionStoreThreadNotFoundError } from "../orchestration-v2/ProjectionStore.ts";
import { PeerService } from "./PeerService.ts";
import {
  CommandId,
  MessageId,
  PitbossAction,
  PitbossForwardIntent,
  PitbossError,
  type PitbossSnapshot,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as Semaphore from "effect/Semaphore";
import { WorkStore } from "./WorkStore.ts";
import { managerView, readyTasks, workContext } from "./Work.ts";
import { ThreadLaunchService } from "../orchestration-v2/ThreadLaunchService.ts";
import {
  ThreadManagementService,
  latestActiveRun,
} from "../orchestration-v2/ThreadManagementService.ts";

const decodeForward = Schema.decodeUnknownEffect(Schema.fromJsonString(PitbossForwardIntent));
const decodeAction = Schema.decodeUnknownEffect(Schema.fromJsonString(PitbossAction));
const isMissingThread = Schema.is(ProjectionStoreThreadNotFoundError);
export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const store = yield* WorkStore;
    const peers = yield* PeerService;
    const threads = yield* ThreadManagementService;
    const launch = yield* ThreadLaunchService;
    const drainLock = yield* Semaphore.make(1);
    const drain = Effect.fn("WorkRuntime.drain")(function* () {
      const pending = yield* store.effects();
      for (const effect of pending) {
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
            if (action.type === "elect") {
              if (state.role?.threadId !== action.threadId) return;
              yield* threads.getProjectThread({
                threadId: action.threadId,
                projectId: action.projectId,
              });
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
                runtimeMode: state.role?.brief.workerRuntimeMode ?? "approval-required",
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
            if (action.type === "cancel" || action.type === "rework") {
              const task = state.tasks.find((task) => task.id === action.taskId);
              for (const attempt of task?.attempts ?? []) {
                if (attempt.state !== "stop_requested" || !task) continue;
                const stopped = yield* threads.interruptThread({
                  projectId: task.projectId,
                  threadId: attempt.threadId,
                  commandId: CommandId.make(`${effect.operation_id}:stop:${attempt.id}`),
                  reason: action.note,
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
          const detail = String(result.failure);
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
      const role = state.role;
      if (!role || role.paused) return;
      const needsAttention =
        managerView(state).messages.some((message) => !message.acknowledged) ||
        readyTasks(state).length > 0;
      if (!needsAttention) return;
      const boss = yield* threads.getProjectThread({
        projectId: role.projectId,
        threadId: role.threadId,
      });
      if (latestActiveRun(boss)) return;
      // Same durable work revision produces the same dispatch command even after restart.
      yield* threads.sendToThread({
        projectId: role.projectId,
        threadId: role.threadId,
        commandId: CommandId.make(`pitboss:wake:${role.generation}:${state.revision}`),
        messageId: MessageId.make(`pitboss:wake:${role.generation}:${state.revision}`),
        text: "Review current Merasmus work and unresolved messages. Select eligible work within the brief, or explain what blocks progress. Use work_read and work_command; do not poll.",
        attachments: [],
        mode: "queue",
        createdBy: "agent",
        creationSource: "mcp",
      });
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
