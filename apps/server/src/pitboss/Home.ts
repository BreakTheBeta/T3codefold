import {
  CommandId,
  PitbossError,
  ProjectId,
  ThreadId,
  type PitbossCommand,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";
import { ProjectService } from "../project/ProjectService.ts";
import { ThreadLaunchService } from "../orchestration-v2/ThreadLaunchService.ts";
import { ThreadManagementService } from "../orchestration-v2/ThreadManagementService.ts";
import { WorkspacePaths } from "../workspace/WorkspacePaths.ts";
import { WorkStore } from "./WorkStore.ts";

const isPitbossError = Schema.is(PitbossError);

/** One environment-owned home. Stable identities let retries recover partial provisioning. */
export const makeHome = Effect.fn("GLaDOS.makeHome")(function* (stateDir: string) {
  const work = yield* WorkStore;
  const workspacePaths = yield* WorkspacePaths;
  const projects = yield* ProjectService;
  const threads = yield* ThreadManagementService;
  const launch = yield* ThreadLaunchService;
  const path = yield* Path.Path;
  const lock = yield* Semaphore.make(1);
  return Effect.fn("GLaDOS.openHome")(
    function* (input: PitbossCommand) {
      if (input.action.type !== "activate-home")
        return yield* new PitbossError({ code: "invalid", message: "Expected a home request." });
      const current = yield* work.read();
      if (current.role) {
        const elected = yield* threads.getProjectThread({
          projectId: current.role.projectId,
          threadId: current.role.threadId,
        });
        if (elected.thread.archivedAt !== null)
          yield* threads.dispatch({
            type: "thread.unarchive",
            commandId: CommandId.make(`${input.commandId}:restore`),
            threadId: current.role.threadId,
          });
        return current;
      }
      if (input.expectedRevision !== current.revision)
        return yield* new PitbossError({
          code: "conflict",
          message: "Work changed. Refresh before creating GLaDOS.",
        });
      const workspaceRoot = yield* workspacePaths.normalizeWorkspaceRoot(
        path.join(stateDir, "glados"),
        { createIfMissing: true },
      );
      const home = yield* projects.bootstrap({
        commandId: CommandId.make(`${input.commandId}:project`),
        projectId: ProjectId.make("glados-home"),
        title: "GLaDOS",
        workspaceRoot,
        createWorkspaceRootIfMissing: true,
        defaultModelSelection: input.action.brief.workerModel,
      });
      const threadId = ThreadId.make(`glados-home:${home.project.id}`);
      const existing = yield* threads.listProjectThreads({
        projectId: home.project.id,
        includeSubagents: true,
      });
      if (!existing.some((thread) => thread.id === threadId)) {
        yield* launch.launch({
          commandId: CommandId.make(`${input.commandId}:thread`),
          threadId,
          projectId: home.project.id,
          title: "GLaDOS",
          modelSelection: input.action.brief.workerModel,
          runtimeMode: input.action.brief.coordinatorRuntimeMode ?? "approval-required",
          interactionMode: "default",
          workspaceStrategy: { type: "root" },
          createdBy: "user",
          creationSource: "web",
        });
      } else {
        yield* threads.dispatch({
          type: "thread.runtime-mode.set",
          commandId: CommandId.make(`${input.commandId}:permissions`),
          threadId,
          runtimeMode: input.action.brief.coordinatorRuntimeMode ?? "approval-required",
        });
      }
      // The original revision fences a concurrent election; never replace its authority.
      return yield* work.command(
        {
          ...input,
          action: {
            type: "elect",
            startCoordinator: true,
            threadId,
            projectId: home.project.id,
            brief: input.action.brief,
          },
        },
        { type: "user" },
      );
    },
    lock.withPermit,
    Effect.mapError((cause) =>
      isPitbossError(cause)
        ? cause
        : new PitbossError({
            code: "unavailable",
            message: `GLaDOS home could not be opened: ${String(cause)}. Retry to reuse any files already created.`,
          }),
    ),
  );
});
