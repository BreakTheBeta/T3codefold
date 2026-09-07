import {
  RunId,
  TurnItemId,
  RuntimeRequestId,
  NodeId,
  ProviderSessionId,
  PlanId,
  type OrchestrationV2RuntimeRequest,
  type OrchestrationV2ConversationMessage,
  type OrchestrationV2ProjectedTurnItem,
  type OrchestrationV2AppThread,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2ThreadShell,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import type {
  OrchestrationMessage,
  OrchestrationThread,
  OrchestrationThreadShell,
} from "@t3tools/contracts/legacy-orchestration";
import { derivePendingRequests } from "../pendingRequests.ts";
import * as DateTime from "effect/DateTime";

const date = (value: string | null | undefined) =>
  value == null ? null : DateTime.makeUnsafe(value);
const messageItems = new WeakMap<OrchestrationMessage, OrchestrationV2TurnItem>();
const messages = new WeakMap<OrchestrationMessage, OrchestrationV2ConversationMessage>();
const visibleItems = new WeakMap<OrchestrationV2TurnItem, OrchestrationV2ProjectedTurnItem>();
const runId = (value: string) => RunId.make(value);

export function legacyAppThread(
  thread: OrchestrationThread | OrchestrationThreadShell,
): OrchestrationV2AppThread {
  return {
    id: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    providerInstanceId: thread.modelSelection.instanceId,
    modelSelection: thread.modelSelection,
    runtimeMode: thread.runtimeMode,
    interactionMode: thread.interactionMode,
    branch: thread.branch,
    worktreePath: thread.worktreePath,
    linkedPullRequest: thread.linkedPullRequest,
    branchPullRequest: thread.branchPullRequest,
    activeProviderThreadId: null,
    lineage: { rootThreadId: thread.id, parentThreadId: null, relationshipToParent: null },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "mobile",
    createdAt: DateTime.makeUnsafe(thread.createdAt),
    updatedAt: DateTime.makeUnsafe(thread.updatedAt),
    archivedAt: date(thread.archivedAt),
    settledOverride: thread.settledOverride,
    settledAt: date(thread.settledAt),
    unsettledAt: date(thread.unsettledAt),
    snoozedUntil: date(thread.snoozedUntil),
    snoozedAt: date(thread.snoozedAt),
    pinnedAt: date(thread.pinnedAt),
    pinOrderKey: thread.pinOrderKey,
    activeOrderKey: thread.activeOrderKey,
    lastVisitedAt: null,
    deletedAt: "deletedAt" in thread ? date(thread.deletedAt) : null,
  };
}

export function legacyThreadShell(thread: OrchestrationThreadShell): OrchestrationV2ThreadShell {
  const turn = thread.latestTurn;
  const active = turn !== null && turn.state === "running";
  return {
    ...legacyAppThread(thread),
    latestRunId: turn ? runId(turn.turnId) : null,
    activeRunId: active ? runId(turn.turnId) : null,
    status: active
      ? "running"
      : turn?.state === "error"
        ? "failed"
        : turn?.state === "interrupted"
          ? "interrupted"
          : turn
            ? "completed"
            : "idle",
    latestRunRequestedAt: date(turn?.requestedAt),
    latestRunStartedAt: date(turn?.startedAt),
    latestRunCompletedAt: date(turn?.completedAt),
    pendingRuntimeRequest:
      thread.hasPendingApprovals || thread.hasPendingUserInput
        ? {
            id: RuntimeRequestId.make(`legacy:pending:${thread.id}`),
            kind: thread.hasPendingUserInput ? "user_input" : "command",
            createdAt: DateTime.makeUnsafe(thread.updatedAt),
          }
        : null,
    latestVisibleMessage: null,
    lastError: thread.session?.lastError,
    latestUserMessageAt: date(thread.latestUserMessageAt),
    hasActionableProposedPlan: thread.hasActionableProposedPlan,
    itemCount: 0,
    visibleItemCount: 0,
  };
}

/** Converts the legacy read model at the connection boundary; IDs remain stable across updates. */
export function legacyThreadProjection(
  thread: OrchestrationThread,
): OrchestrationV2ThreadProjection {
  const turnItems: OrchestrationV2TurnItem[] = thread.messages.map((message, ordinal) => {
    const cached = messageItems.get(message);
    if (cached !== undefined && cached.threadId === thread.id && cached.ordinal === ordinal)
      return cached;
    const base = {
      id: TurnItemId.make(`legacy:message:${message.id}`),
      threadId: thread.id,
      runId: message.turnId === null ? null : runId(message.turnId),
      nodeId: null,
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      parentItemId: null,
      ordinal,
      status: message.streaming ? ("running" as const) : ("completed" as const),
      title: null,
      startedAt: date(message.createdAt),
      completedAt: message.streaming ? null : date(message.updatedAt),
      updatedAt: DateTime.makeUnsafe(message.updatedAt),
    };
    const item: OrchestrationV2TurnItem =
      message.role === "system"
        ? { ...base, type: "system_notice", message: message.text }
        : message.role === "user"
          ? {
              ...base,
              type: "user_message",
              messageId: message.id,
              text: message.text,
              attachments: message.attachments ?? [],
              inputIntent: "turn_start",
              createdBy: "user",
              creationSource: "mobile",
            }
          : {
              ...base,
              type: "assistant_message",
              messageId: message.id,
              text: message.text,
              attachments: message.attachments ?? [],
              streaming: message.streaming,
            };
    messageItems.set(message, item);
    return item;
  });
  const pending = derivePendingRequests(thread.activities);
  const runtimeRequests: OrchestrationV2RuntimeRequest[] = [];
  const itemBase = (id: string, at: string) => ({
    id: TurnItemId.make(`legacy:${id}`),
    threadId: thread.id,
    runId: thread.latestTurn ? runId(thread.latestTurn.turnId) : null,
    nodeId: NodeId.make(`legacy:${id}`),
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: turnItems.length,
    status: "completed" as const,
    title: null,
    startedAt: date(at),
    completedAt: date(at),
    updatedAt: DateTime.makeUnsafe(at),
  });
  for (const request of [...pending.approvals, ...pending.userInputs]) {
    const id = RuntimeRequestId.make(request.requestId);
    const nodeId = NodeId.make(`legacy:request:${id}`);
    const isInput = "questions" in request;
    runtimeRequests.push({
      id,
      nodeId,
      providerTurnId: null,
      nativeRequestRef: null,
      kind: isInput ? "user_input" : request.requestKind,
      status: "pending",
      responseCapability:
        isInput && request.dismissible
          ? { type: "message" }
          : { type: "live", providerSessionId: ProviderSessionId.make(`legacy:${thread.id}`) },
      createdAt: DateTime.makeUnsafe(request.createdAt),
      resolvedAt: null,
    });
    const base = {
      ...itemBase(`request:${id}`, request.createdAt),
      nodeId,
      status: "waiting" as const,
      completedAt: null,
    };
    turnItems.push(
      isInput
        ? {
            ...base,
            type: "user_input_request",
            requestId: id,
            questions: request.questions,
            ...(request.dismissible ? { responseMode: "message" as const } : {}),
          }
        : {
            ...base,
            type: "approval_request",
            requestId: id,
            requestKind: request.requestKind,
            prompt: request.detail,
            appName: request.appName,
            options: request.options,
          },
    );
  }
  for (const plan of thread.proposedPlans) {
    turnItems.push({
      ...itemBase(`plan:${plan.id}`, plan.createdAt),
      type: "proposed_plan",
      planId: PlanId.make(plan.id),
      markdown: plan.planMarkdown,
      streaming: false,
    });
  }
  for (const activity of thread.activities) {
    if (activity.tone !== "tool" && activity.tone !== "error") continue;
    turnItems.push({
      ...itemBase(`activity:${activity.id}`, activity.createdAt),
      type: "system_notice",
      message: activity.summary,
    });
  }
  turnItems.sort(
    (a, b) =>
      DateTime.toEpochMillis(a.startedAt ?? a.updatedAt) -
        DateTime.toEpochMillis(b.startedAt ?? b.updatedAt) || a.ordinal - b.ordinal,
  );
  const turn = thread.latestTurn;
  const latestUser = thread.messages.findLast((message) => message.role === "user");
  return {
    thread: legacyAppThread(thread),
    runs:
      turn && latestUser
        ? [
            {
              id: runId(turn.turnId),
              threadId: thread.id,
              ordinal: 1,
              providerInstanceId: thread.modelSelection.instanceId,
              modelSelection: thread.modelSelection,
              providerThreadId: null,
              userMessageId: latestUser.id,
              rootNodeId: null,
              activeAttemptId: null,
              status: turn.state === "error" ? "failed" : turn.state,
              requestedAt: DateTime.makeUnsafe(turn.requestedAt),
              startedAt: date(turn.startedAt),
              completedAt: date(turn.completedAt),
              checkpointId: null,
              contextHandoffId: null,
            },
          ]
        : [],
    attempts: [],
    nodes: [],
    subagents: [],
    providerSessions: [],
    providerThreads: [],
    providerTurns: [],
    runtimeRequests,
    messages: thread.messages.map((message) => {
      const cached = messages.get(message);
      if (cached !== undefined && cached.threadId === thread.id) return cached;
      const value: OrchestrationV2ConversationMessage = {
        ...message,
        threadId: thread.id,
        runId: message.turnId === null ? null : runId(message.turnId),
        nodeId: null,
        attachments: message.attachments ?? [],
        createdBy: message.role === "assistant" ? "agent" : message.role,
        creationSource: "mobile",
        createdAt: DateTime.makeUnsafe(message.createdAt),
        updatedAt: DateTime.makeUnsafe(message.updatedAt),
      };
      messages.set(message, value);
      return value;
    }),
    plans: thread.proposedPlans.map((plan) => ({
      id: PlanId.make(plan.id),
      threadId: thread.id,
      runId: plan.turnId ? runId(plan.turnId) : null,
      nodeId: NodeId.make(`legacy:plan:${plan.id}`),
      status: plan.implementedAt ? "completed" : "active",
      kind: "proposed_plan",
      markdown: plan.planMarkdown,
    })),
    turnItems,
    checkpointScopes: [],
    checkpoints: [],
    contextHandoffs: [],
    contextTransfers: [],
    visibleTurnItems: turnItems.map((item, position) => {
      const cached = visibleItems.get(item);
      if (cached !== undefined && cached.position === position) return cached;
      const value: OrchestrationV2ProjectedTurnItem = {
        position,
        visibility: "local",
        sourceThreadId: thread.id,
        sourceItemId: item.id,
        item,
      };
      visibleItems.set(item, value);
      return value;
    }),
    updatedAt: DateTime.makeUnsafe(thread.updatedAt),
  };
}
