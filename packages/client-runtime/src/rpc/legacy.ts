import {
  WsRpcGroup,
  ORCHESTRATION_V2_WS_METHODS as methods,
  WS_METHODS,
  OrchestrationV2DispatchCommandError,
  OrchestrationV2GetThreadProjectionError,
  OrchestrationV2GetShellSnapshotError,
  OrchestrationV2ThreadLaunchError,
  type OrchestrationV2ShellStreamItem,
  type OrchestrationV2ThreadStreamItem,
  ThreadId,
  MessageId,
  ProjectMutationError,
} from "@t3tools/contracts";
import {
  ClientOrchestrationCommand,
  OrchestrationShellStreamItem,
  OrchestrationThreadStreamItem,
  OrchestrationShellSnapshot,
  type OrchestrationThread,
} from "@t3tools/contracts/legacy-orchestration";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Rpc, RpcClient, RpcGroup } from "effect/unstable/rpc";
import type { WsRpcProtocolClient } from "./protocol.ts";
import { legacyThreadProjection, legacyThreadShell } from "./legacyProjection.ts";
import { applyThreadDetailEvent } from "./legacyReducer.ts";

const decodeLegacyCommand = Schema.decodeUnknownEffect(ClientOrchestrationCommand);

const legacyError = Schema.Struct({ _tag: Schema.String, message: Schema.String });
const legacyGroup = WsRpcGroup.omit(
  methods.dispatchCommand,
  methods.subscribeShell,
  methods.subscribeThread,
  methods.getArchivedShellSnapshot,
).merge(
  RpcGroup.make(
    Rpc.make(methods.dispatchCommand, {
      payload: ClientOrchestrationCommand,
      success: Schema.Struct({ sequence: Schema.Number }),
      error: legacyError,
    }),
    Rpc.make(methods.subscribeShell, {
      payload: Schema.Struct({ requestCompletionMarker: Schema.optionalKey(Schema.Boolean) }),
      success: OrchestrationShellStreamItem,
      error: legacyError,
      stream: true,
    }),
    Rpc.make(methods.subscribeThread, {
      payload: Schema.Struct({
        threadId: Schema.String,
        requestCompletionMarker: Schema.optionalKey(Schema.Boolean),
      }),
      success: OrchestrationThreadStreamItem,
      error: legacyError,
      stream: true,
    }),
    Rpc.make(methods.getArchivedShellSnapshot, {
      payload: Schema.Struct({}),
      success: OrchestrationShellSnapshot,
      error: legacyError,
    }),
  ),
);

export const makeLegacyWsRpcClient = Effect.gen(function* () {
  const raw = yield* RpcClient.make(legacyGroup);
  const detailError = (threadId: ThreadId) => (error: { message: string }) =>
    new OrchestrationV2GetThreadProjectionError({ threadId, message: error.message });
  const shellError = (error: { message: string }) =>
    new OrchestrationV2GetShellSnapshotError({ message: error.message });
  const subscribeThread: WsRpcProtocolClient[typeof methods.subscribeThread] = (input) =>
    Stream.suspend(() => {
      let current: OrchestrationThread | undefined;
      return raw[methods.subscribeThread]({
        threadId: input.threadId,
        ...(input.requestCompletionMarker ? { requestCompletionMarker: true } : {}),
      }).pipe(
        Stream.mapError(detailError(input.threadId)),
        Stream.map((item): OrchestrationV2ThreadStreamItem | null => {
          if (item.kind === "synchronized") return item;
          if (item.kind === "snapshot") {
            current = item.snapshot.thread;
            return {
              kind: "snapshot",
              snapshotSequence: item.snapshot.snapshotSequence,
              projection: legacyThreadProjection(current),
            };
          }
          if (current === undefined) return null;
          const result = applyThreadDetailEvent(current, item.event);
          if (result.kind === "unchanged") return null;
          current =
            result.kind === "deleted"
              ? { ...current, deletedAt: item.event.occurredAt }
              : result.thread;
          return {
            kind: "snapshot",
            snapshotSequence: item.event.sequence,
            projection: legacyThreadProjection(current),
          };
        }),
        Stream.filter((item): item is OrchestrationV2ThreadStreamItem => item !== null),
      );
    });
  const getProjection: WsRpcProtocolClient[typeof methods.getThreadProjection] = (input) =>
    subscribeThread(input).pipe(
      Stream.filter((item) => item.kind === "snapshot"),
      Stream.take(1),
      Stream.runHead,
      Effect.flatMap((item) =>
        Option.isSome(item) && item.value.kind === "snapshot"
          ? Effect.succeed(item.value.projection)
          : Effect.fail(
              new OrchestrationV2GetThreadProjectionError({
                threadId: input.threadId,
                message: "The older server did not return this thread.",
              }),
            ),
      ),
    );
  const dispatch: WsRpcProtocolClient[typeof methods.dispatchCommand] = (command) =>
    Effect.gen(function* () {
      const createdAt = DateTime.formatIso(yield* DateTime.now);
      const fail = (message: string) =>
        new OrchestrationV2DispatchCommandError({
          commandId: command.commandId,
          commandType: command.type,
          message,
        });
      let translated: unknown = { ...command, createdAt };
      switch (command.type) {
        case "thread.visit":
          return { sequence: 0 };
        case "thread.metadata.update":
          translated = { ...command, type: "thread.meta.update" };
          break;
        case "provider.switch":
        case "thread.model-selection.set":
          translated = { ...command, type: "thread.meta.update" };
          break;
        case "run.interrupt":
          translated = {
            ...command,
            type: "thread.turn.interrupt",
            turnId: command.runId,
            createdAt,
          };
          break;
        case "provider-session.detach":
          translated = { ...command, type: "thread.session.stop", createdAt };
          break;
        case "runtime-request.dismiss":
          translated = { ...command, type: "thread.user-input.dismiss", createdAt };
          break;
        case "runtime-request.respond":
          translated = {
            ...command,
            type:
              command.answers !== undefined
                ? "thread.user-input.respond"
                : "thread.approval.respond",
            createdAt,
          };
          break;
        case "message.dispatch": {
          if (
            command.dispatchMode.type !== "start_immediately" &&
            command.dispatchMode.type !== "steer_active"
          )
            return yield* fail(
              "This server does not support server-side queued runs. Send this message after the current turn finishes.",
            );
          const projection = yield* getProjection({ threadId: command.threadId }).pipe(
            Effect.mapError((error) => fail(error.message)),
          );
          translated = {
            type: "thread.turn.start",
            commandId: command.commandId,
            threadId: command.threadId,
            message: {
              messageId: command.messageId,
              role: "user",
              text: command.text,
              attachments: command.attachments,
            },
            modelSelection: command.modelSelection,
            titleSeed: command.titleSeed,
            runtimeMode: projection.thread.runtimeMode,
            interactionMode: projection.thread.interactionMode,
            sourceProposedPlan: command.sourcePlanRef,
            createdAt,
          };
          break;
        }
      }
      const input = yield* decodeLegacyCommand(translated).pipe(
        Effect.mapError(() => fail(`This older server does not support ${command.type}.`)),
      );
      return yield* raw[methods.dispatchCommand](input).pipe(
        Effect.mapError((error) => fail(error.message)),
      );
    });
  const client: WsRpcProtocolClient = {
    ...raw,
    [methods.dispatchCommand]: dispatch,
    [methods.getThreadProjection]: getProjection,
    [methods.subscribeThread]: subscribeThread,
    [methods.subscribeShell]: (input) =>
      raw[methods.subscribeShell](
        input.requestCompletionMarker ? { requestCompletionMarker: true } : {},
      ).pipe(
        Stream.mapError(shellError),
        Stream.map((item): OrchestrationV2ShellStreamItem => {
          switch (item.kind) {
            case "synchronized":
              return item;
            case "snapshot":
              return {
                kind: "snapshot",
                snapshot: {
                  schemaVersion: 1,
                  snapshotSequence: item.snapshot.snapshotSequence,
                  projects: item.snapshot.projects,
                  threads: item.snapshot.threads
                    .filter((thread) => thread.archivedAt === null)
                    .map(legacyThreadShell),
                  archivedThreads: item.snapshot.threads
                    .filter((thread) => thread.archivedAt !== null)
                    .map(legacyThreadShell),
                },
              };
            case "project-upserted":
              return { ...item, kind: "project.updated" };
            case "project-removed":
              return { ...item, kind: "project.removed" };
            case "thread-upserted":
              return {
                kind: "thread.updated",
                sequence: item.sequence,
                location: item.thread.archivedAt === null ? "active" : "archive",
                thread: legacyThreadShell(item.thread),
              };
            case "thread-removed":
              return { ...item, kind: "thread.removed", location: "active" };
          }
        }),
      ),
    [methods.getArchivedShellSnapshot]: () =>
      raw[methods.getArchivedShellSnapshot]({}).pipe(
        Effect.mapError(shellError),
        Effect.map((snapshot) => ({
          schemaVersion: 1,
          snapshotSequence: snapshot.snapshotSequence,
          projects: snapshot.projects,
          threads: snapshot.threads.map(legacyThreadShell),
        })),
      ),
    [methods.launchThread]: (input) =>
      Effect.gen(function* () {
        const threadId = input.threadId ?? ThreadId.make(`legacy:${input.commandId}`);
        if (input.initialMessage === undefined)
          return yield* new OrchestrationV2ThreadLaunchError({
            commandId: input.commandId,
            projectId: input.projectId,
            message: "An initial message is required on this older server.",
          });
        const messageId =
          input.initialMessage.messageId ?? MessageId.make(`legacy:${input.commandId}`);
        const strategy = input.workspaceStrategy;
        const createdAt = DateTime.formatIso(yield* DateTime.now);
        const shell = yield* raw[methods.subscribeShell]({}).pipe(
          Stream.filter((item) => item.kind === "snapshot"),
          Stream.take(1),
          Stream.runHead,
        );
        const project =
          Option.isSome(shell) && shell.value.kind === "snapshot"
            ? shell.value.snapshot.projects.find((project) => project.id === input.projectId)
            : undefined;
        if (project === undefined)
          return yield* new OrchestrationV2ThreadLaunchError({
            commandId: input.commandId,
            projectId: input.projectId,
            message: "Project is unavailable on this server.",
          });
        yield* raw[methods.dispatchCommand]({
          type: "thread.turn.start",
          commandId: input.commandId,
          threadId,
          message: { ...input.initialMessage, messageId, role: "user" },
          modelSelection: input.modelSelection,
          runtimeMode: input.runtimeMode,
          interactionMode: input.interactionMode,
          createdAt,
          ...(input.generateTitle ? { titleSeed: input.title } : {}),
          bootstrap: {
            ...(input.reuseExistingThread
              ? {}
              : {
                  createThread: {
                    createdAt,
                    projectId: input.projectId,
                    title: input.title,
                    modelSelection: input.modelSelection,
                    runtimeMode: input.runtimeMode,
                    interactionMode: input.interactionMode,
                    branch: strategy.branch ?? null,
                    worktreePath:
                      strategy.type === "existing_worktree" ? strategy.worktreePath : null,
                  },
                }),
            ...(strategy.type === "worktree"
              ? {
                  prepareWorktree: {
                    projectCwd: project.workspaceRoot,
                    baseBranch: strategy.baseRef,
                    branch: strategy.branch,
                    startFromOrigin: strategy.startFromOrigin,
                  },
                }
              : {}),
          },
        });
        const projection = yield* getProjection({ threadId });
        return { threadId, projection, resumed: input.reuseExistingThread === true };
      }).pipe(
        Effect.mapError(
          (error) =>
            new OrchestrationV2ThreadLaunchError({
              commandId: input.commandId,
              projectId: input.projectId,
              message: error.message,
            }),
        ),
      ),
    [WS_METHODS.projectsMutate]: (input) =>
      Effect.gen(function* () {
        const createdAt = DateTime.formatIso(yield* DateTime.now);
        const translated = yield* decodeLegacyCommand({
          ...input,
          type: input.type === "project.update" ? "project.meta.update" : input.type,
          createdAt,
        });
        let previousProject;
        if (input.type === "project.delete") {
          const previous = yield* raw[methods.subscribeShell]({}).pipe(
            Stream.filter((item) => item.kind === "snapshot"),
            Stream.take(1),
            Stream.runHead,
          );
          previousProject =
            Option.isSome(previous) && previous.value.kind === "snapshot"
              ? previous.value.snapshot.projects.find((project) => project.id === input.projectId)
              : undefined;
          if (!previousProject)
            return yield* new ProjectMutationError({
              commandId: input.commandId,
              message: "Project is already absent from this server.",
            });
        }
        yield* raw[methods.dispatchCommand](translated);
        if (previousProject) return { ...previousProject, deletedAt: createdAt };
        const snapshot = yield* raw[methods.subscribeShell]({}).pipe(
          Stream.filter((item) => item.kind === "snapshot"),
          Stream.take(1),
          Stream.runHead,
        );
        const project =
          Option.isSome(snapshot) && snapshot.value.kind === "snapshot"
            ? snapshot.value.snapshot.projects.find((project) => project.id === input.projectId)
            : undefined;
        if (!project)
          return yield* new ProjectMutationError({
            commandId: input.commandId,
            message: "Project is no longer present on this server.",
          });
        return { ...project, deletedAt: null };
      }).pipe(
        Effect.mapError(
          (error) =>
            new ProjectMutationError({ commandId: input.commandId, message: error.message }),
        ),
      ),
  };
  return client;
});
