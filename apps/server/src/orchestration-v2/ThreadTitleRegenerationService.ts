import {
  type ChatAttachment,
  CommandId,
  type MessageId,
  type ServerSettingsError,
  type ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import type { ProjectionRepositoryError } from "../persistence/Errors.ts";
import { ProjectionProjectRepository } from "../persistence/Services/ProjectionProjects.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import type { OrchestratorV2Error } from "./Orchestrator.ts";
import { ThreadManagementService } from "./ThreadManagementService.ts";

export { formatThreadTitleContext } from "../textGeneration/ThreadTitleContext.ts";
import { formatThreadTitleContext } from "../textGeneration/ThreadTitleContext.ts";

export class ThreadTitleRegenerationService extends Context.Service<
  ThreadTitleRegenerationService,
  {
    readonly execute: (input: {
      readonly threadId: ThreadId;
      readonly requestId: CommandId;
      readonly kind:
        | { readonly type: "initial"; readonly messageId: MessageId }
        | { readonly type: "regenerate" };
    }) => Effect.Effect<
      void,
      OrchestratorV2Error | ProjectionRepositoryError | ServerSettingsError
    >;
  }
>()("t3/orchestration-v2/ThreadTitleRegenerationService") {}

export const make = Effect.gen(function* () {
  const threads = yield* ThreadManagementService;
  const projects = yield* ProjectionProjectRepository;
  const serverSettings = yield* ServerSettings.ServerSettingsService;
  const textGeneration = yield* TextGeneration.TextGeneration;

  const complete = (input: {
    readonly threadId: ThreadId;
    readonly requestId: CommandId;
    readonly title?: string;
    readonly needsRefinement?: boolean;
  }) =>
    threads
      .dispatch({
        type: "thread.title.regeneration.complete",
        commandId: CommandId.make(`${input.requestId}:title-complete`),
        threadId: input.threadId,
        requestId: input.requestId,
        needsRefinement: input.needsRefinement ?? false,
        ...(input.title === undefined ? {} : { title: input.title }),
      })
      .pipe(Effect.asVoid);

  const execute: ThreadTitleRegenerationService["Service"]["execute"] = Effect.fn(
    "ThreadTitleRegenerationService.execute",
  )(function* (input) {
    const outcome:
      | { readonly type: "stale" }
      | { readonly type: "complete"; readonly title?: string; readonly needsRefinement?: boolean } =
      yield* Effect.gen(function* () {
        const projection = yield* threads.getThreadProjection(input.threadId);
        if (projection.thread.titleRegeneration?.requestId !== input.requestId) {
          return { type: "stale" as const };
        }

        const project = yield* projects.getById({ projectId: projection.thread.projectId });
        if (Option.isNone(project)) {
          return { type: "complete" as const };
        }

        let context: {
          readonly message: string;
          readonly attachments: ReadonlyArray<ChatAttachment>;
        };
        if (input.kind.type === "initial") {
          const messageId = input.kind.messageId;
          const message = projection.messages.find(
            (candidate) => candidate.id === messageId && !candidate.streaming,
          );
          context =
            message === undefined
              ? { message: "", attachments: [] }
              : { message: message.text, attachments: message.attachments };
        } else {
          context = formatThreadTitleContext(
            projection.messages.filter((message) => !message.streaming),
          );
        }
        if (context.message.length === 0 && context.attachments.length === 0) {
          return { type: "complete" as const };
        }

        const settings = yield* serverSettings.getSettings;
        const result = yield* textGeneration.generateThreadTitle({
          cwd: projection.thread.worktreePath ?? project.value.workspaceRoot,
          message: context.message,
          attachments: context.attachments,
          ...(input.kind.type === "regenerate" ? { previousTitle: projection.thread.title } : {}),
          modelSelection: settings.textGenerationModelSelection,
        });
        const generatedTitle = result.title.trim();
        return generatedTitle === "New thread" ||
          (input.kind.type === "regenerate" && generatedTitle === projection.thread.title.trim())
          ? { type: "complete" as const }
          : {
              type: "complete" as const,
              title: result.title,
              needsRefinement: input.kind.type === "initial" && result.needsRefinement === true,
            };
      }).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.interrupt
            : Effect.logWarning("Thread title generation failed", {
                threadId: input.threadId,
                requestId: input.requestId,
                cause,
              }).pipe(Effect.as({ type: "complete" as const })),
        ),
      );

    if (outcome.type === "stale") {
      return;
    }
    yield* complete({
      ...input,
      needsRefinement: outcome.needsRefinement ?? false,
      ...(outcome.title === undefined ? {} : { title: outcome.title }),
    });
  });

  return ThreadTitleRegenerationService.of({ execute });
});

export const layer = Layer.effect(ThreadTitleRegenerationService, make);
