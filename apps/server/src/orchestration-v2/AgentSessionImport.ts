import {
  DEFAULT_RUNTIME_MODE,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  MessageId,
  ThreadId,
  ProviderDriverKind,
  TurnItemId,
  type OrchestrationV2Command,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2ThreadProjection,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { IdAllocatorV2 } from "./IdAllocator.ts";
import type { PendingOrchestrationEffectV2 } from "./EffectOutbox.ts";

class AgentSessionImportConflict extends Schema.TaggedErrorClass<AgentSessionImportConflict>()(
  "AgentSessionImportConflict",
  { threadId: ThreadId },
) {}

/** Import history and its native resume reference atomically, without starting a provider turn. */
export const planAgentSessionImport = Effect.fn("planAgentSessionImport")(function* (input: {
  command: Extract<OrchestrationV2Command, { type: "thread.history.import" }>;
  projection: OrchestrationV2ThreadProjection | null;
  idAllocator: IdAllocatorV2["Service"];
}) {
  const { command, projection, idAllocator } = input;
  const events: Array<OrchestrationV2DomainEvent> = [];
  const effects: Array<PendingOrchestrationEffectV2> = [];
  const emit = Effect.fn("AgentSessionImport.emit")(function* (
    event: Omit<OrchestrationV2DomainEvent, "id">,
  ) {
    const id = yield* idAllocator.allocate.event({
      threadId: command.threadId,
      commandId: command.commandId,
    });
    events.push({ ...event, id } as OrchestrationV2DomainEvent);
  });
  const source = command.source;
  if (
    command.threadId !== `import:${source.providerInstanceId}:${source.providerSessionId}` ||
    command.modelSelection.instanceId !== source.providerInstanceId ||
    (source.provider === "claudeAgent" &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        source.providerSessionId,
      ))
  ) {
    return yield* new AgentSessionImportConflict({ threadId: command.threadId });
  }
  if (projection !== null) {
    const previous = projection.thread.importedAgentSessions ?? [];
    if (
      projection.thread.projectId !== command.projectId ||
      previous.length === 0 ||
      !previous.some(
        (entry) =>
          entry.providerInstanceId === source.providerInstanceId &&
          entry.providerSessionId === source.providerSessionId,
      )
    ) {
      return yield* new AgentSessionImportConflict({ threadId: command.threadId });
    }
    // New transcript copies update discovery cursors, never overwrite an owner's subsequent work.
    yield* emit({
      type: "thread.metadata-updated",
      threadId: command.threadId,
      occurredAt: command.createdAt,
      payload: {
        ...projection.thread,
        importedAgentSessions: [
          ...previous.filter((entry) => entry.filePath !== source.filePath),
          source,
        ],
      },
    });
    return { events, effects };
  }
  const now = command.createdAt;
  const providerThreadId = idAllocator.derive.providerThread({
    driver: ProviderDriverKind.make(source.provider),
    nativeThreadId: source.providerSessionId,
  });
  yield* emit({
    type: "thread.created",
    threadId: command.threadId,
    occurredAt: now,
    payload: {
      createdBy: "system",
      creationSource: "server",
      id: command.threadId,
      projectId: command.projectId,
      title: command.title,
      providerInstanceId: source.providerInstanceId,
      modelSelection: command.modelSelection,
      runtimeMode: DEFAULT_RUNTIME_MODE,
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      branch: null,
      worktreePath: null,
      activeProviderThreadId: providerThreadId,
      importedAgentSessions: [source],
      lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: command.threadId },
      forkedFrom: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      settledOverride: "settled",
      settledAt: now,
      snoozedUntil: null,
      snoozedAt: null,
      lastVisitedAt: null,
      deletedAt: null,
    },
  });
  yield* emit({
    type: "provider-thread.updated",
    threadId: command.threadId,
    occurredAt: now,
    payload: {
      id: providerThreadId,
      driver: ProviderDriverKind.make(source.provider),
      providerInstanceId: source.providerInstanceId,
      providerSessionId: null,
      appThreadId: command.threadId,
      ownerNodeId: null,
      nativeThreadRef: {
        driver: ProviderDriverKind.make(source.provider),
        nativeId: source.providerSessionId,
        strength: "strong",
      },
      nativeConversationHeadRef: null,
      status: "not_loaded",
      firstRunOrdinal: null,
      lastRunOrdinal: null,
      handoffIds: [],
      forkedFrom: null,
      createdAt: now,
      updatedAt: now,
    },
  });
  for (const [index, message] of command.messages.entries()) {
    const messageId = MessageId.make(`${command.threadId}:${String(index).padStart(6, "0")}`);
    const createdAt = message.createdAt;
    yield* emit({
      type: "message.updated",
      threadId: command.threadId,
      occurredAt: createdAt,
      payload: {
        createdBy: message.role === "user" ? "user" : "agent",
        creationSource: "server",
        id: messageId,
        threadId: command.threadId,
        runId: null,
        nodeId: null,
        role: message.role,
        text: message.text,
        attachments: [],
        streaming: false,
        createdAt,
        updatedAt: createdAt,
      },
    });
    const common = {
      id: TurnItemId.make(`${messageId}:item`),
      threadId: command.threadId,
      runId: null,
      nodeId: null,
      providerThreadId,
      providerTurnId: null,
      nativeItemRef: null,
      parentItemId: null,
      ordinal: index + 1,
      status: "completed" as const,
      title: null,
      startedAt: createdAt,
      completedAt: createdAt,
      updatedAt: createdAt,
      messageId,
      text: message.text,
    };
    yield* emit({
      type: "turn-item.updated",
      threadId: command.threadId,
      occurredAt: createdAt,
      payload:
        message.role === "user"
          ? {
              ...common,
              type: "user_message",
              createdBy: "user",
              creationSource: "server",
              inputIntent: "turn_start",
              attachments: [],
            }
          : { ...common, type: "assistant_message", streaming: false },
    });
  }
  return { events, effects };
});
