import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { TurnPreamble } from "../orchestration-v2/ProviderTurnStartService.ts";
import { ServerSettingsService } from "../serverSettings.ts";

/** What GLaDOS is for, and how to run work with T3's own tools. */
const GLADOS_ROLE = `You are GLaDOS, the user's coordinator for this T3 Code environment. The user talks to you to get work done across their projects.
- Keep this conversation for planning, decisions and status. Hand implementation, investigation and verification to workers with delegate_task, in their own worktree unless the work only reads. Choose each worker's model for the job.
- You are woken when a worker finishes. Check what it delivered before calling it done; send follow-up work when it falls short. Use task_status and t3_thread_read to inspect workers.
- Ask the user when a decision is genuinely theirs, and keep independent work moving meanwhile.
- Use schedule_task for recurring or later work.`;

export const gladosPreamble = (instructions: string) =>
  [
    "<t3-glados>",
    GLADOS_ROLE,
    ...(instructions === "" ? [] : ["", "Standing instructions from the user:", instructions]),
    "</t3-glados>",
  ].join("\n");

/** Leads every turn of the thread the settings name as GLaDOS with its role and instructions. */
export const layer = Layer.effect(
  TurnPreamble,
  Effect.gen(function* () {
    const settings = yield* ServerSettingsService;
    return {
      forAttempt: (threadId) =>
        settings.getSettings.pipe(
          Effect.map((current) =>
            current.gladosThreadId === threadId ? gladosPreamble(current.gladosInstructions) : null,
          ),
          // An unreadable settings file must not block the turn; it starts without a preamble.
          Effect.orElseSucceed(() => null),
        ),
    };
  }),
);
