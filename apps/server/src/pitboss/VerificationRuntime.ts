import { verificationRecipeForTask } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as Option from "effect/Option";
import * as Semaphore from "effect/Semaphore";
import { ProjectionProjectRepository } from "../persistence/Services/ProjectionProjects.ts";
import { WorkStore } from "./WorkStore.ts";
import { VerificationRunner } from "./VerificationRunner.ts";
import { interruptedReceipt } from "./Verification.ts";

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const store = yield* WorkStore;
    const projects = yield* ProjectionProjectRepository;
    const runner = yield* VerificationRunner;
    const lock = yield* Semaphore.make(1);
    // Never rerun commands whose completion was lost across a server restart.
    const initial = yield* store.read();
    for (const task of initial.tasks)
      if (task.verification?.state === "running") {
        yield* store.recordVerification(task.id, {
          ...task.verification,
          state: "completed",
          receipt: interruptedReceipt(
            "Blocked: server restarted during verification. Inspect retained processes before explicitly retrying.",
          ),
        });
      }
    const drain = Effect.fn("VerificationRuntime.drain")(function* () {
      const state = yield* store.read();
      if (state.role?.paused) return;
      for (const task of state.tasks) {
        const run = task.verification;
        if (run?.state !== "pending") continue;
        // Re-read after a previous recipe ran; pause applies to the next queued check.
        const fresh = yield* store.read();
        if (fresh.role?.paused) return;
        if (!fresh.role?.brief.projectIds.includes(task.projectId)) {
          yield* store.recordVerification(task.id, {
            ...run,
            state: "completed",
            receipt: interruptedReceipt(
              "Blocked: project left the GLaDOS brief before verification started.",
            ),
          });
          continue;
        }
        const recipe = verificationRecipeForTask(
          fresh,
          fresh.tasks.find((entry) => entry.id === task.id) ?? task,
        );
        if (
          !recipe ||
          recipe.enabled === false ||
          recipe.version !== run.recipe.version ||
          (recipe.profileId ?? "default") !== (run.recipe.profileId ?? "default")
        ) {
          yield* store.recordVerification(task.id, {
            ...run,
            state: "completed",
            receipt: interruptedReceipt(
              "Blocked: recipe changed or was disabled before execution. Request a new check.",
            ),
          });
          continue;
        }
        yield* store.recordVerification(task.id, { ...run, state: "running" });
        const receipt = yield* Effect.gen(function* () {
          const project = yield* projects.getById({ projectId: task.projectId });
          const attempt = task.attempts.find((entry) => entry.id === run.attemptId);
          const threadId = attempt?.threadId;
          if (Option.isNone(project) || project.value.deletedAt || !threadId)
            return interruptedReceipt("Blocked: project or retained attempt is unavailable.");
          return yield* runner.run({
            root:
              run.recipe.mode === "artifact"
                ? (attempt?.workspacePath ?? project.value.workspaceRoot)
                : project.value.workspaceRoot,
            threadId,
            verification: run,
          });
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.succeed(interruptedReceipt(`Blocked: ${String(cause).slice(0, 600)}`)),
          ),
        );
        yield* store.recordVerification(task.id, { ...run, state: "completed", receipt });
      }
    }, lock.withPermit);
    yield* store.changes.pipe(
      Stream.runForEach(() => drain().pipe(Effect.catchCause(Effect.logWarning))),
      Effect.forkScoped,
    );
    yield* drain().pipe(Effect.catchCause(Effect.logWarning), Effect.forkScoped);
  }),
);
