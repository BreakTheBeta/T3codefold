import * as WorktreeSetupTracker from "../project/WorktreeSetupTracker.ts";
import * as TerminalManager from "../terminal/Manager.ts";
import * as Deferred from "effect/Deferred";
import {
  CommandId,
  type ChatAttachment,
  type MessageId,
  type ModelSelection,
  type OrchestrationV2Actor,
  type OrchestrationV2CreationSource,
  type OrchestrationV2ThreadProjection,
  type ProviderInteractionMode,
  ProjectId,
  type RunId,
  type RuntimeMode,
  ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import { buildTemporaryWorktreeBranchName, isTemporaryWorktreeBranch } from "@t3tools/shared/git";

import * as GitWorkflow from "../git/GitWorkflowService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as ProjectSetupScriptRunner from "../project/ProjectSetupScriptRunner.ts";
import * as ProviderRegistry from "../provider/Services/ProviderRegistry.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import * as CommandReceiptStore from "./CommandReceiptStore.ts";
import * as IdAllocator from "./IdAllocator.ts";
import { makeProviderFailure } from "./ProviderFailure.ts";
import { randomUuidV4 } from "./RandomUuid.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";

export type ThreadLaunchWorkspaceStrategy =
  | { readonly type: "root"; readonly branch?: string | undefined }
  | {
      readonly type: "existing_worktree";
      readonly worktreePath: string;
      readonly branch?: string | undefined;
    }
  | {
      readonly type: "worktree";
      readonly baseRef: string;
      readonly branch?: string | undefined;
      readonly startFromOrigin?: boolean | undefined;
    };

export interface ThreadLaunchInitialMessage {
  readonly context?: import("@t3tools/contracts").OrchestrationMessageContext;
  readonly messageId?: MessageId;
  readonly text: string;
  readonly attachments: ReadonlyArray<ChatAttachment>;
}

export interface ThreadLaunchInput {
  readonly commandId: CommandId;
  readonly threadId?: ThreadId;
  readonly reuseExistingThread?: boolean;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly generateTitle?: boolean;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly workspaceStrategy: ThreadLaunchWorkspaceStrategy;
  readonly initialMessage?: ThreadLaunchInitialMessage;
  readonly createdBy: OrchestrationV2Actor;
  readonly creationSource: OrchestrationV2CreationSource;
}

export interface ThreadLaunchResult {
  readonly threadId: ThreadId;
  readonly projection: OrchestrationV2ThreadProjection;
  readonly resumed: boolean;
}

export class ThreadLaunchError extends Schema.TaggedError<ThreadLaunchError>()(
  "ThreadLaunchError",
  {
    operation: Schema.Literals([
      "resolve-project",
      "read-receipt",
      "generate-metadata",
      "provision-worktree",
      "run-setup-script",
      "create-thread",
      "update-thread",
      "dispatch-message",
      "release-run",
      "fail-run",
    ]),
    commandId: CommandId,
    projectId: ProjectId,
    threadId: Schema.optional(ThreadId),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Thread launch ${this.commandId} failed during ${this.operation}.`;
  }
}

export class ThreadLaunchService extends Context.Service<
  ThreadLaunchService,
  {
    readonly launch: (
      input: ThreadLaunchInput,
    ) => Effect.Effect<ThreadLaunchResult, ThreadLaunchError>;
  }
>()("t3/orchestration-v2/ThreadLaunchService") {}

const isThreadLaunchError = Schema.is(ThreadLaunchError);

function failureDetail(error: unknown): string {
  if (isThreadLaunchError(error)) {
    const cause = error.cause;
    const detail = cause instanceof Error ? cause.message : String(cause);
    return `Workspace preparation failed during ${error.operation.replaceAll("-", " ")}: ${detail}`;
  }
  return `Workspace preparation failed: ${error instanceof Error ? error.message : String(error)}`;
}

export const make = Effect.gen(function* () {
  const projects = yield* ProjectService.ProjectService;
  const git = yield* GitWorkflow.GitWorkflowService;
  const setupTracker = yield* WorktreeSetupTracker.WorktreeSetupTracker;
  const terminals = yield* TerminalManager.TerminalManager;
  const setupScripts = yield* ProjectSetupScriptRunner.ProjectSetupScriptRunner;
  const providerRegistry = yield* ProviderRegistry.ProviderRegistry;
  const serverSettings = yield* ServerSettings.ServerSettingsService;
  const textGeneration = yield* TextGeneration.TextGeneration;
  const receipts = yield* CommandReceiptStore.CommandReceiptStoreV2;
  const ids = yield* IdAllocator.IdAllocatorV2;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const preparationScope = yield* Scope.make("sequential");
  const scheduledLaunches = yield* Ref.make<ReadonlySet<CommandId>>(new Set());
  yield* Effect.addFinalizer(() => Scope.close(preparationScope, Exit.void));

  const mapError =
    (input: ThreadLaunchInput, operation: ThreadLaunchError["operation"], threadId?: ThreadId) =>
    (cause: unknown) =>
      new ThreadLaunchError({
        operation,
        commandId: input.commandId,
        projectId: input.projectId,
        ...(threadId === undefined ? {} : { threadId }),
        cause,
      });

  const readReceipt = (input: ThreadLaunchInput, commandId: CommandId) =>
    receipts
      .getByCommandId(commandId)
      .pipe(Effect.mapError(mapError(input, "read-receipt", input.threadId)));

  const validateReusableThread = Effect.fn("ThreadLaunchService.validateReusableThread")(function* (
    input: ThreadLaunchInput,
    threadId: ThreadId,
  ) {
    const projection = yield* threads
      .getThreadProjection(threadId)
      .pipe(Effect.mapError(mapError(input, "update-thread", threadId)));
    if (
      projection.thread.projectId !== input.projectId ||
      projection.thread.archivedAt !== null ||
      projection.thread.deletedAt !== null ||
      projection.messages.length > 0 ||
      projection.runs.length > 0
    ) {
      return yield* mapError(
        input,
        "update-thread",
        threadId,
      )("Only an empty active thread in the target project can change workspace during launch.");
    }
  });

  const prepareInBackground = Effect.fn("ThreadLaunchService.prepareInBackground")(function* (
    input: ThreadLaunchInput,
    threadId: ThreadId,
    runId: RunId | null,
  ) {
    const project = yield* projects.getById(input.projectId).pipe(
      Effect.mapError(mapError(input, "resolve-project", threadId)),
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(mapError(input, "resolve-project", threadId)("Project no longer exists.")),
          onSome: Effect.succeed,
        }),
      ),
    );

    const initialMessage = input.initialMessage;
    const generateBranchNameFor = (cwd: string, message: ThreadLaunchInitialMessage) =>
      Effect.gen(function* () {
        const settings = yield* serverSettings.getSettings;
        const modelSelection =
          settings.sourceControlWriterModelSelection === null
            ? settings.textGenerationModelSelection
            : ServerSettings.resolveSourceControlWriterModelSelection(
                settings,
                yield* providerRegistry.getProviders,
              );
        return yield* textGeneration
          .generateBranchName({
            cwd,
            message: message.text,
            attachments: message.attachments,
            modelSelection,
          })
          .pipe(Effect.map((result) => result.branch));
      });

    // The server owns worktree naming: without an explicit branch, provision
    // under a temporary `t3code/<hash>` name so the worktree never waits on
    // name generation, then rename in the background below.
    const requestedBranch = input.workspaceStrategy.branch;
    let branch: string | null;
    if (input.workspaceStrategy.type === "worktree" && requestedBranch === undefined) {
      const uuid = yield* randomUuidV4;
      branch = buildTemporaryWorktreeBranchName(() => uuid.replaceAll("-", ""));
    } else {
      branch = requestedBranch ?? null;
    }
    let worktreePath =
      input.workspaceStrategy.type === "existing_worktree"
        ? input.workspaceStrategy.worktreePath
        : null;
    if (
      input.workspaceStrategy.type === "worktree" &&
      (yield* git
        .isRepository(project.workspaceRoot)
        .pipe(Effect.mapError(mapError(input, "provision-worktree", threadId))))
    ) {
      if (runId !== null) {
        yield* threads
          .dispatch({
            type: "prepared-run.progress",
            commandId: CommandId.make(`${input.commandId}:progress:worktree`),
            threadId,
            runId,
            phase: "worktree",
          })
          .pipe(Effect.mapError(mapError(input, "update-thread", threadId)));
      }
      let startRef = input.workspaceStrategy.baseRef;
      // "Start from origin" is a stored default; repos without the requested
      // remote branch fall back to the local base branch.
      const startFromOrigin =
        input.workspaceStrategy.startFromOrigin === true &&
        (yield* git
          .remoteExists({ cwd: project.workspaceRoot, remoteName: "origin" })
          .pipe(Effect.mapError(mapError(input, "provision-worktree", threadId))));
      if (startFromOrigin) {
        yield* setupTracker.stageStatus(threadId, "fetch", "running");
        yield* git
          .fetchRemote({ cwd: project.workspaceRoot, remoteName: "origin" })
          .pipe(Effect.mapError(mapError(input, "provision-worktree", threadId)));
        const remoteBaseExists = yield* git
          .remoteBranchExists({
            cwd: project.workspaceRoot,
            refName: input.workspaceStrategy.baseRef,
            remoteName: "origin",
          })
          .pipe(Effect.mapError(mapError(input, "provision-worktree", threadId)));
        if (remoteBaseExists) {
          startRef = yield* git
            .resolveRemoteTrackingCommit({
              cwd: project.workspaceRoot,
              refName: input.workspaceStrategy.baseRef,
              fallbackRemoteName: "origin",
            })
            .pipe(
              Effect.map((resolved) => resolved.commitSha),
              Effect.mapError(mapError(input, "provision-worktree", threadId)),
            );
        }
      }
      yield* setupTracker.stageStatus(threadId, "fetch", startFromOrigin ? "done" : "skipped");
      if (
        yield* git
          .hasCommit({ cwd: project.workspaceRoot, refName: startRef })
          .pipe(Effect.mapError(mapError(input, "provision-worktree", threadId)))
      ) {
        yield* setupTracker.stageStatus(threadId, "checkout", "running");
        const worktree = yield* git
          .createWorktree(
            {
              cwd: project.workspaceRoot,
              refName: startRef,
              newRefName: branch!,
              baseRefName: input.workspaceStrategy.baseRef,
              path: null,
            },
            {
              progress: {
                onCheckoutProgress: ({ percent, completed, total }) =>
                  setupTracker.stage(threadId, "checkout", {
                    percent,
                    detail: `${completed}/${total} files`,
                  }),
                onWorktreeClaimed: (claimedPath) => {
                  worktreePath = claimedPath;
                  return setupTracker
                    .update(threadId, (snapshot) => ({ ...snapshot, worktreePath: claimedPath }))
                    .pipe(Effect.andThen(setupTracker.stageStatus(threadId, "checkout", "done")));
                },
                onSubmodulesStarted: () =>
                  setupTracker.stageStatus(threadId, "submodules", "running"),
                onSubmoduleLine: (line) => setupTracker.appendTail(threadId, "submodules", line),
                onSubmodulesFinished: ({ ok, detail }) =>
                  setupTracker.stageStatus(threadId, "submodules", ok ? "done" : "warning", detail),
              },
            },
          )
          .pipe(Effect.mapError(mapError(input, "provision-worktree", threadId)));
        worktreePath = worktree.worktree.path;
        branch = worktree.worktree.refName;
        yield* setupTracker.update(threadId, (snapshot) => ({
          ...snapshot,
          branch,
          worktreePath,
          stages: snapshot.stages.map((stage) =>
            stage.id === "submodules" && stage.status === "pending"
              ? { ...stage, status: "skipped" }
              : stage,
          ),
        }));
        yield* setupTracker.stageStatus(threadId, "checkout", "done");
      }
    }
    const useProjectCheckout = input.workspaceStrategy.type === "worktree" && worktreePath === null;
    if (useProjectCheckout) {
      branch = null;
      yield* setupTracker.update(threadId, (snapshot) => ({
        ...snapshot,
        branch: null,
        stages: snapshot.stages.map((stage) =>
          ["fetch", "checkout", "submodules"].includes(stage.id)
            ? { ...stage, status: "skipped", detail: "using project checkout" }
            : stage,
        ),
      }));
    }

    yield* threads
      .dispatch({
        type: "thread.metadata.update",
        commandId: CommandId.make(`${input.commandId}:workspace`),
        threadId,
        branch,
        worktreePath,
      })
      .pipe(Effect.mapError(mapError(input, "update-thread", threadId)));

    // Rename temporary branches (server-invented above, or sent by clients
    // that name worktrees themselves) in the background so generation latency
    // never delays provisioning or the provider turn. The temporary name
    // simply sticks if generation or the rename fails.
    if (
      worktreePath !== null &&
      branch !== null &&
      initialMessage !== undefined &&
      isTemporaryWorktreeBranch(branch)
    ) {
      const oldBranch = branch;
      const worktreeCwd = worktreePath;
      yield* generateBranchNameFor(worktreeCwd, initialMessage).pipe(
        Effect.flatMap((newBranch) => git.renameBranch({ cwd: worktreeCwd, oldBranch, newBranch })),
        Effect.flatMap((renamed) =>
          threads.dispatch({
            type: "thread.metadata.update",
            commandId: CommandId.make(`${input.commandId}:branch-rename`),
            threadId,
            branch: renamed.branch,
            worktreePath: worktreeCwd,
          }),
        ),
        Effect.catchCause((cause) =>
          Effect.logWarning("Thread worktree branch rename failed", {
            commandId: input.commandId,
            threadId,
            oldBranch,
            cause,
          }),
        ),
        Effect.forkIn(preparationScope),
      );
    }

    const cwd = worktreePath ?? project.workspaceRoot;
    if (runId !== null) {
      yield* threads
        .dispatch({
          type: "prepared-run.progress",
          commandId: CommandId.make(`${input.commandId}:progress:setup`),
          threadId,
          runId,
          phase: "setup",
        })
        .pipe(Effect.mapError(mapError(input, "update-thread", threadId)));
    }
    yield* setupTracker.stageStatus(threadId, "setup-script", "running");
    const setup = yield* useProjectCheckout
      ? Effect.succeed({ status: "no-script" } as const)
      : setupScripts
          .runForThread({
            threadId,
            projectId: input.projectId,
            projectCwd: project.workspaceRoot,
            worktreePath: cwd,
            observeCompletion: {
              onOutputLine: (line) => setupTracker.appendTail(threadId, "setup-script", line),
            },
            project: {
              workspaceRoot: project.workspaceRoot,
              scripts: project.scripts,
            },
          })
          .pipe(
            Effect.catch((error) =>
              setupTracker
                .stageStatus(threadId, "setup-script", "failed", error.message)
                .pipe(Effect.as(null)),
            ),
          );

    let setupFailed = setup === null;
    if (setup?.status === "started") {
      yield* setupTracker.update(threadId, (snapshot) => ({
        ...snapshot,
        setupScript: {
          name: setup.scriptName,
          command: setup.scriptCommand,
          terminalId: setup.terminalId,
        },
      }));
      if (setup.completion) {
        const completion = yield* setup.completion.pipe(
          Effect.onInterrupt(() =>
            terminals.close({ threadId, terminalId: setup.terminalId }).pipe(Effect.ignore),
          ),
        );
        yield* setupTracker.stage(threadId, "setup-script", {
          detail: `Exit code: ${completion.exitCode ?? "unknown"}`,
        });
        if (completion.exitCode !== 0) {
          setupFailed = true;
        }
      }
    }
    yield* setupTracker.stageStatus(
      threadId,
      "setup-script",
      setup?.status === "no-script" ? "skipped" : setupFailed ? "failed" : "done",
    );
    yield* setupTracker.markUncancellable(threadId);
    yield* setupTracker.stageStatus(threadId, "agent", "running");
    if (runId !== null) {
      yield* threads
        .dispatch({
          type: "prepared-run.release",
          commandId: CommandId.make(`${input.commandId}:release`),
          threadId,
          runId,
        })
        .pipe(Effect.mapError(mapError(input, "release-run", threadId)));
    }
  });

  const failPreparedRun = (
    input: ThreadLaunchInput,
    threadId: ThreadId,
    runId: RunId | null,
    cause: unknown,
  ) =>
    runId === null
      ? Effect.logWarning("Thread workspace preparation failed", {
          commandId: input.commandId,
          threadId,
          cause,
        })
      : threads
          .dispatch({
            type: "prepared-run.fail",
            commandId: CommandId.make(`${input.commandId}:fail`),
            threadId,
            runId,
            failure: makeProviderFailure({
              cause,
              message: failureDetail(cause),
              class: "validation_error",
              retryable: false,
            }),
          })
          .pipe(
            Effect.mapError(mapError(input, "fail-run", threadId)),
            Effect.catchCause((persistCause) =>
              Effect.logWarning("Failed to persist thread workspace preparation failure", {
                commandId: input.commandId,
                threadId,
                cause,
                persistCause,
              }),
            ),
          );

  const reservePreparation = (commandId: CommandId) =>
    Ref.modify(scheduledLaunches, (scheduled) => {
      if (scheduled.has(commandId)) return [false, scheduled] as const;
      const next = new Set(scheduled);
      next.add(commandId);
      return [true, next] as const;
    });

  const releasePreparation = (commandId: CommandId) =>
    Ref.update(scheduledLaunches, (scheduled) => {
      const next = new Set(scheduled);
      next.delete(commandId);
      return next;
    });

  const schedulePreparation = Effect.fn("ThreadLaunchService.schedulePreparation")(function* (
    input: ThreadLaunchInput,
    threadId: ThreadId,
    runId: RunId | null,
  ) {
    const ready = yield* Deferred.make<void>();
    const fiber = yield* Deferred.await(ready).pipe(
      Effect.andThen(prepareInBackground(input, threadId, runId)),
      Effect.interruptible,
      Effect.onExit((exit) => {
        if (Exit.isSuccess(exit)) return setupTracker.finish(threadId, "done");
        const cancelled = Cause.hasInterruptsOnly(exit.cause);
        return failPreparedRun(
          input,
          threadId,
          runId,
          cancelled ? new Error("Worktree setup cancelled.") : Cause.squash(exit.cause),
        ).pipe(
          Effect.andThen(
            setupTracker.finish(
              threadId,
              cancelled ? "cancelled" : "failed",
              cancelled ? null : failureDetail(Cause.squash(exit.cause)),
            ),
          ),
        );
      }),
      Effect.catchCause(() => Effect.void),
      Effect.ensuring(releasePreparation(input.commandId)),
      Effect.interruptible,
      Effect.forkIn(preparationScope),
    );
    yield* setupTracker.begin({
      threadId,
      branch: input.workspaceStrategy.branch ?? null,
      baseRef: input.workspaceStrategy.type === "worktree" ? input.workspaceStrategy.baseRef : null,
      stages:
        input.workspaceStrategy.type === "worktree"
          ? ["fetch", "checkout", "submodules", "setup-script", "agent"]
          : ["setup-script", "agent"],
      fiber,
    });
    yield* Deferred.succeed(ready, undefined);
  });

  const launch: ThreadLaunchService["Service"]["launch"] = Effect.fn("ThreadLaunchService.launch")(
    function* (input) {
      const project = yield* projects.getById(input.projectId).pipe(
        Effect.mapError(mapError(input, "resolve-project")),
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(mapError(input, "resolve-project")("Project not found.")),
            onSome: Effect.succeed,
          }),
        ),
      );
      if (input.reuseExistingThread === true && input.threadId === undefined) {
        return yield* mapError(
          input,
          "update-thread",
        )("Reusing an existing thread requires a thread id.");
      }

      const launchReceipt = yield* readReceipt(input, input.commandId);
      return yield* Effect.gen(function* () {
        const candidateThreadId =
          input.threadId ??
          (yield* ids.allocate
            .thread({ projectId: input.projectId })
            .pipe(Effect.mapError(mapError(input, "create-thread"))));

        if (input.reuseExistingThread === true && Option.isNone(launchReceipt)) {
          yield* validateReusableThread(input, candidateThreadId);
        }

        const initialBranch = input.workspaceStrategy.branch ?? null;
        const initialWorktreePath =
          input.workspaceStrategy.type === "existing_worktree"
            ? input.workspaceStrategy.worktreePath
            : null;
        const claimDispatch =
          input.reuseExistingThread === true
            ? threads.dispatch({
                type: "thread.metadata.update",
                commandId: input.commandId,
                threadId: candidateThreadId,
              })
            : threads.dispatch({
                type: "thread.create",
                commandId: input.commandId,
                threadId: candidateThreadId,
                projectId: input.projectId,
                title: input.title,
                modelSelection: input.modelSelection,
                runtimeMode: input.runtimeMode,
                interactionMode: input.interactionMode,
                branch: initialBranch,
                worktreePath: initialWorktreePath,
                createdBy: input.createdBy,
                creationSource: input.creationSource,
              });
        const claimed = yield* claimDispatch.pipe(
          Effect.mapError(
            mapError(
              input,
              input.reuseExistingThread === true ? "update-thread" : "create-thread",
              candidateThreadId,
            ),
          ),
        );
        const threadId =
          claimed.storedEvents.find((stored) => stored.event.type.startsWith("thread."))?.event
            .threadId ?? candidateThreadId;
        if (project.id !== input.projectId) {
          return yield* mapError(input, "resolve-project", threadId)("Project identity changed.");
        }

        let runId: RunId | null = null;
        let messageWasAlreadyAccepted = false;
        if (input.initialMessage !== undefined) {
          const messageCommandId = CommandId.make(`${input.commandId}:initial-message`);
          const messageReceipt = yield* readReceipt(input, messageCommandId);
          messageWasAlreadyAccepted = Option.isSome(messageReceipt);
          const messageId =
            input.initialMessage.messageId ??
            (yield* ids.allocate
              .message({ threadId, ordinal: 1 })
              .pipe(Effect.mapError(mapError(input, "dispatch-message", threadId))));
          const dispatched = yield* threads
            .dispatch({
              type: "message.dispatch",
              commandId: messageCommandId,
              threadId,
              messageId,
              text: input.initialMessage.text,
              ...(input.initialMessage.context === undefined
                ? {}
                : { context: input.initialMessage.context }),
              attachments: input.initialMessage.attachments,
              ...(input.generateTitle === true ? { titleSeed: input.title } : {}),
              modelSelection: input.modelSelection,
              dispatchMode: { type: "defer_start" },
              createdBy: input.createdBy,
              creationSource: input.creationSource,
            })
            .pipe(Effect.mapError(mapError(input, "dispatch-message", threadId)));
          const runCreated = dispatched.storedEvents.find(
            (stored) => stored.event.type === "run.created",
          );
          runId = runCreated?.event.type === "run.created" ? runCreated.event.payload.id : null;
          if (runId === null) {
            return yield* mapError(
              input,
              "dispatch-message",
              threadId,
            )("Initial message was accepted without a durable run.");
          }
        }

        const projection = yield* threads
          .getThreadProjection(threadId)
          .pipe(Effect.mapError(mapError(input, "create-thread", threadId)));
        const runIsPreparing =
          runId !== null &&
          projection.runs.some((run) => run.id === runId && run.status === "preparing");
        const shouldSchedule = runId === null ? Option.isNone(launchReceipt) : runIsPreparing;
        if (shouldSchedule) {
          const ownsPreparation = yield* reservePreparation(input.commandId);
          if (ownsPreparation) {
            yield* Effect.gen(function* () {
              const preparationStillRequired =
                runId === null
                  ? true
                  : yield* threads.getThreadProjection(threadId).pipe(
                      Effect.map((current) =>
                        current.runs.some((run) => run.id === runId && run.status === "preparing"),
                      ),
                      Effect.mapError(mapError(input, "update-thread", threadId)),
                    );
              if (preparationStillRequired) {
                yield* schedulePreparation(input, threadId, runId);
              } else {
                yield* releasePreparation(input.commandId);
              }
            }).pipe(Effect.onError(() => releasePreparation(input.commandId)));
          }
        }

        return {
          threadId,
          projection,
          resumed: Option.isSome(launchReceipt) || messageWasAlreadyAccepted,
        };
      });
    },
  );

  return ThreadLaunchService.of({ launch });
});

export const layer = Layer.effect(ThreadLaunchService, make);
