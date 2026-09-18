import { CommandId, type ThreadId } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { forkParked } from "../serverActivation.ts";
import { ThreadManagementService } from "./ThreadManagementService.ts";

/** Refine a provisional title once the first answer supplies enough context. */
export const start = Effect.gen(function* () {
  const threads = yield* ThreadManagementService;
  const worker = yield* makeDrainableWorker((threadId: ThreadId) =>
    Effect.gen(function* () {
      const projection = yield* threads.getThreadProjection(threadId);
      const thread = projection.thread;
      const state = thread.titleState;
      if (
        thread.deletedAt !== null ||
        thread.archivedAt !== null ||
        state?.source !== "generated" ||
        !state.needsRefinement ||
        thread.titleRegeneration != null
      )
        return;
      const latest = projection.runs.toSorted((a, b) => b.ordinal - a.ordinal)[0];
      if (latest?.status !== "completed") return;
      yield* threads.dispatch({
        type: "thread.metadata.update",
        commandId: CommandId.make(`title-refine:${threadId}:${state.version}`),
        threadId,
        expectedTitleVersion: state.version,
        regenerateTitle: true,
      });
    }).pipe(
      Effect.catch((error) =>
        Effect.logWarning("Thread title refinement failed", { threadId, error }),
      ),
    ),
  );
  yield* forkParked(
    Stream.runForEach(threads.streamDomainEvents, (event) =>
      (event.type === "run.updated" && event.payload.status === "completed") ||
      (event.type === "thread.metadata-updated" &&
        event.payload.titleState?.needsRefinement === true)
        ? worker.enqueue(event.threadId)
        : Effect.void,
    ),
  );
  yield* forkParked(
    Effect.gen(function* () {
      const snapshot = yield* threads.getShellSnapshot();
      for (const thread of snapshot.threads) {
        if (thread.titleState?.needsRefinement) yield* worker.enqueue(thread.id);
      }
    }).pipe(
      Effect.catch((error) =>
        Effect.logWarning("Thread title refinement recovery failed", { error }),
      ),
    ),
  );
});
