import type { PitbossCommand } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { WorkStore } from "../../../pitboss/WorkStore.ts";
import { requireThreadScope } from "../../McpInvocationContext.ts";
import { readCaller } from "../../threadAccess.ts";
import { WorkToolkit } from "./tools.ts";

/** Actions that launch or relaunch agents, so they carry the caller's runtime mode as a ceiling. */
const needsLaunchAuthority = ({ action }: PitbossCommand) =>
  action.type === "create-lead" ||
  action.type === "assign" ||
  action.type === "revise-result" ||
  (action.type === "lead-status" && action.status === "active");

/**
 * The calling thread as a work actor. Work belongs to T3 threads, so an MCP
 * client signed in from outside a thread is refused; readCaller enforces the
 * orchestration capability and a live calling thread.
 */
const agent = (operation: string) =>
  Effect.gen(function* () {
    const context = yield* readCaller();
    const scope = yield* requireThreadScope(context.scope, operation);
    return {
      actor: { type: "agent" as const, threadId: scope.thread.threadId },
      limits: context.limits,
      store: yield* WorkStore,
    };
  });

export const WorkToolkitHandlersLive = WorkToolkit.toLayer({
  work_read: () =>
    Effect.gen(function* () {
      const { actor, store } = yield* agent("work_read");
      return yield* store.read(actor);
    }),
  work_command: (input) =>
    Effect.gen(function* () {
      const { actor, limits, store } = yield* agent("work_command");
      return yield* store.command(
        input,
        actor,
        needsLaunchAuthority(input) ? { runtimeMode: limits.runtimeMode } : undefined,
      );
    }),
});
