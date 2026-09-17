import {
  CommandId,
  type MessageId,
  type OrchestrationV2Actor,
  type OrchestrationV2CreationSource,
  type PitbossCommand,
  type PitbossSnapshot,
  type ThreadId,
  verificationProposalApprovalAction,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import type { WorkStore } from "./WorkStore.ts";

export interface ConversationApprovalMessage {
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  readonly text: string;
  readonly createdBy: OrchestrationV2Actor;
  readonly creationSource: OrchestrationV2CreationSource;
}

export interface ConversationApproval {
  readonly command: PitbossCommand;
  readonly sourceMessageId: MessageId;
}

function normalizedDirective(value: string) {
  return value
    .trim()
    .replace(/[.!?]+$/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Converts only an explicit directive from the authenticated GLaDOS conversation into a
 * revision-fenced user command. The caller remains responsible for invoking this after the
 * originating conversation message has been durably accepted.
 */
export function conversationApprovalCommand(
  state: PitbossSnapshot,
  message: ConversationApprovalMessage,
): ConversationApproval | undefined {
  if (
    message.createdBy !== "user" ||
    (message.creationSource !== "web" && message.creationSource !== "mobile") ||
    state.role?.threadId !== message.threadId
  )
    return undefined;

  if (state.messages.some((receipt) => receipt.sourceMessageId === message.messageId))
    return undefined;

  const directive = normalizedDirective(message.text);
  const matches: Array<ConversationApproval> = [];
  for (const task of state.tasks) {
    if (directive === normalizedDirective(`Approve verification for task ${task.id}`)) {
      const action = verificationProposalApprovalAction(task);
      if (!action) return undefined;
      matches.push({
        sourceMessageId: message.messageId,
        command: {
          commandId: CommandId.make(`conversation-approval:${message.messageId}`),
          expectedRevision: state.revision,
          authorityGeneration: state.role.generation,
          action,
        },
      });
    }
    for (const decision of task.decisions ?? []) {
      if (decision.answer !== undefined) continue;
      for (const option of decision.options) {
        if (directive !== normalizedDirective(`Choose ${option} for task ${task.id}`)) continue;
        matches.push({
          sourceMessageId: message.messageId,
          command: {
            commandId: CommandId.make(`conversation-approval:${message.messageId}`),
            expectedRevision: state.revision,
            authorityGeneration: state.role.generation,
            action: {
              type: "resolve-decision",
              taskId: task.id,
              decisionId: decision.id,
              answer: option,
            },
          },
        });
      }
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

export const applyPreparedConversationApproval = Effect.fn("ConversationApproval.applyPrepared")(
  function* (store: WorkStore["Service"], approval: ConversationApproval) {
    const applied = yield* Effect.result(
      store.command(approval.command, {
        type: "user",
        sourceMessageId: approval.sourceMessageId,
      }),
    );
    if (applied._tag === "Success")
      return { status: "applied" as const, snapshot: applied.success };
    yield* store.receiveMessage({
      id: `conversation-approval-rejected:${approval.sourceMessageId}`,
      sourceMessageId: approval.sourceMessageId,
      taskId: "taskId" in approval.command.action ? approval.command.action.taskId : null,
      threadId: null,
      kind: "question",
      text: `Conversation approval was not applied: ${applied.failure.message}`,
      createdAt: DateTime.formatIso(yield* DateTime.now),
      acknowledged: false,
    });
    return { status: "rejected" as const, error: applied.failure };
  },
);

export const prepareConversationApproval = Effect.fn("ConversationApproval.prepare")(function* (
  store: WorkStore["Service"],
  message: ConversationApprovalMessage,
) {
  const read = yield* Effect.result(store.read());
  if (read._tag === "Failure") return { status: "rejected" as const, error: read.failure };
  return {
    status: "prepared" as const,
    approval: conversationApprovalCommand(read.success, message),
  };
});

export const applyConversationApproval = Effect.fn("ConversationApproval.apply")(function* (
  store: WorkStore["Service"],
  message: ConversationApprovalMessage,
) {
  const prepared = yield* prepareConversationApproval(store, message);
  if (prepared.status === "rejected") return prepared;
  if (!prepared.approval) return { status: "ignored" as const };
  return yield* applyPreparedConversationApproval(store, prepared.approval);
});

export const dispatchWithConversationApproval = Effect.fn(
  "ConversationApproval.dispatchWithApproval",
)(function* <A, E, R>(
  store: WorkStore["Service"],
  message: ConversationApprovalMessage,
  dispatch: Effect.Effect<A, E, R>,
) {
  const prepared = yield* prepareConversationApproval(store, message);
  const result = yield* dispatch;
  if (prepared.status === "rejected") return { result, approval: prepared };
  if (!prepared.approval) return { result, approval: { status: "ignored" as const } };
  return {
    result,
    approval: yield* applyPreparedConversationApproval(store, prepared.approval),
  };
});
