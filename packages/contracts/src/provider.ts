import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import {
  ApprovalRequestId,
  EventId,
  IsoDateTime,
  ProviderItemId,
  ThreadId,
  TurnId,
} from "./baseSchemas.ts";
import {
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  ChatAttachment,
} from "./chatAttachment.ts";
import { ModelSelection } from "./modelSelection.ts";
import {
  ProviderApprovalDecision,
  ProviderApprovalPolicy,
  ProviderInteractionMode,
  ProviderRequestKind,
  ProviderSandboxMode,
  ProviderUserInputAnswers,
  RuntimeMode,
} from "./providerPolicy.ts";
import { ProviderInstanceId, ProviderDriverKind } from "./providerInstance.ts";

const ProviderSessionStatus = Schema.Literals([
  "connecting",
  "ready",
  "running",
  "error",
  "closed",
]);

export const ProviderSession = Schema.Struct({
  provider: ProviderDriverKind,
  // Optional during the driver/instance migration. Once every producer
  // populates it (post-slice-4), routing flips to instance-id-only and the
  // legacy `provider` field is removed.
  providerInstanceId: Schema.optional(ProviderInstanceId),
  status: ProviderSessionStatus,
  runtimeMode: RuntimeMode,
  cwd: Schema.optional(TrimmedNonEmptyString),
  model: Schema.optional(TrimmedNonEmptyString),
  threadId: ThreadId,
  resumeCursor: Schema.optional(Schema.Unknown),
  activeTurnId: Schema.optional(TurnId),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  lastError: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderSession = typeof ProviderSession.Type;

export const ProviderSessionStartInput = Schema.Struct({
  threadId: ThreadId,
  provider: Schema.optional(ProviderDriverKind),
  // See ProviderSession for the migration story.
  providerInstanceId: Schema.optional(ProviderInstanceId),
  cwd: Schema.optional(TrimmedNonEmptyString),
  title: Schema.optional(TrimmedNonEmptyString),
  modelSelection: Schema.optional(ModelSelection),
  resumeCursor: Schema.optional(Schema.Unknown),
  approvalPolicy: Schema.optional(ProviderApprovalPolicy),
  sandboxMode: Schema.optional(ProviderSandboxMode),
  runtimeMode: RuntimeMode,
});
export type ProviderSessionStartInput = typeof ProviderSessionStartInput.Type;

export const ProviderSendTurnInput = Schema.Struct({
  threadId: ThreadId,
  /** Internal recovery signal. Allows an empty turn only for adapters that
      explicitly support promptless continuation. */
  continuation: Schema.optional(Schema.Boolean),
  input: Schema.optional(
    TrimmedNonEmptyString.check(Schema.isMaxLength(PROVIDER_SEND_TURN_MAX_INPUT_CHARS)),
  ),
  attachments: Schema.optional(
    Schema.Array(ChatAttachment).check(Schema.isMaxLength(PROVIDER_SEND_TURN_MAX_ATTACHMENTS)),
  ),
  modelSelection: Schema.optional(ModelSelection),
  interactionMode: Schema.optional(ProviderInteractionMode),
});
export type ProviderSendTurnInput = typeof ProviderSendTurnInput.Type;

export const ProviderTurnStartResult = Schema.Struct({
  threadId: ThreadId,
  turnId: TurnId,
  resumeCursor: Schema.optional(Schema.Unknown),
});
export type ProviderTurnStartResult = typeof ProviderTurnStartResult.Type;

export const ProviderInterruptTurnInput = Schema.Struct({
  threadId: ThreadId,
  turnId: Schema.optional(TurnId),
});
export type ProviderInterruptTurnInput = typeof ProviderInterruptTurnInput.Type;

export const ProviderStopSessionInput = Schema.Struct({
  threadId: ThreadId,
});
export type ProviderStopSessionInput = typeof ProviderStopSessionInput.Type;

export const ProviderRespondToRequestInput = Schema.Struct({
  threadId: ThreadId,
  requestId: ApprovalRequestId,
  decision: ProviderApprovalDecision,
});
export type ProviderRespondToRequestInput = typeof ProviderRespondToRequestInput.Type;

export const ProviderRespondToUserInputInput = Schema.Struct({
  threadId: ThreadId,
  requestId: ApprovalRequestId,
  answers: ProviderUserInputAnswers,
});
export type ProviderRespondToUserInputInput = typeof ProviderRespondToUserInputInput.Type;

export const ProviderUploadFeedbackInput = Schema.Struct({
  threadId: ThreadId,
  reason: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderUploadFeedbackInput = typeof ProviderUploadFeedbackInput.Type;

export const ProviderUploadFeedbackResult = Schema.Struct({
  feedbackId: TrimmedNonEmptyString,
});
export type ProviderUploadFeedbackResult = typeof ProviderUploadFeedbackResult.Type;

const RealtimeSessionDescription = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(256 * 1024),
);

export const RealtimeVoiceOptions = Schema.Struct({
  voice: Schema.optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(40))),
  callId: Schema.optional(Schema.String.check(Schema.isMaxLength(80))),
});
export type RealtimeVoiceOptions = typeof RealtimeVoiceOptions.Type;
export const RealtimeVoiceContext = Schema.String.check(Schema.isMaxLength(8_192));
export const ProviderRealtimeVoiceContextInput = Schema.Struct({
  threadId: ThreadId,
  callId: Schema.String,
  text: RealtimeVoiceContext,
});
export const ProviderRealtimeVoiceListResult = Schema.Struct({
  voices: Schema.Array(Schema.String),
  defaultVoice: Schema.String,
});
export type ProviderRealtimeVoiceListResult = typeof ProviderRealtimeVoiceListResult.Type;
export const ProviderRealtimeVoiceEvent = Schema.Struct({
  callId: Schema.String,
  sequence: Schema.Number,
  type: Schema.Literals(["started", "closed", "error", "transcript"]),
  role: Schema.optional(Schema.Literals(["user", "assistant"])),
  text: Schema.optional(Schema.String.check(Schema.isMaxLength(8_192))),
  final: Schema.optional(Schema.Boolean),
});
export type ProviderRealtimeVoiceEvent = typeof ProviderRealtimeVoiceEvent.Type;

export const ProviderRealtimeVoiceStartInput = Schema.Struct({
  threadId: ThreadId,
  sdp: RealtimeSessionDescription,
  options: Schema.optional(RealtimeVoiceOptions),
});
export type ProviderRealtimeVoiceStartInput = typeof ProviderRealtimeVoiceStartInput.Type;

export const ProviderRealtimeVoiceStartResult = Schema.Struct({
  sdp: RealtimeSessionDescription,
});
export type ProviderRealtimeVoiceStartResult = typeof ProviderRealtimeVoiceStartResult.Type;

export const ProviderRealtimeVoiceStopInput = Schema.Struct({
  threadId: ThreadId,
});
export type ProviderRealtimeVoiceStopInput = typeof ProviderRealtimeVoiceStopInput.Type;

export class ProviderRealtimeVoiceError extends Schema.TaggedErrorClass<ProviderRealtimeVoiceError>()(
  "ProviderRealtimeVoiceError",
  {
    threadId: ThreadId,
    operation: Schema.Literals(["start", "stop", "list voices", "share context", "subscribe"]),
  },
) {
  override get message(): string {
    return `Failed to ${this.operation} realtime voice for thread ${this.threadId}.`;
  }
}

export class ProviderUploadFeedbackError extends Schema.TaggedErrorClass<ProviderUploadFeedbackError>()(
  "ProviderUploadFeedbackError",
  {
    threadId: ThreadId,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Failed to upload feedback for thread ${this.threadId}.`;
  }
}

const ProviderEventKind = Schema.Literals(["session", "notification", "request", "error"]);

export const ProviderEvent = Schema.Struct({
  id: EventId,
  kind: ProviderEventKind,
  provider: ProviderDriverKind,
  // See ProviderSession for the migration story.
  providerInstanceId: Schema.optional(ProviderInstanceId),
  threadId: ThreadId,
  createdAt: IsoDateTime,
  method: TrimmedNonEmptyString,
  message: Schema.optional(TrimmedNonEmptyString),
  turnId: Schema.optional(TurnId),
  itemId: Schema.optional(ProviderItemId),
  requestId: Schema.optional(ApprovalRequestId),
  requestKind: Schema.optional(ProviderRequestKind),
  textDelta: Schema.optional(Schema.String),
  payload: Schema.optional(Schema.Unknown),
});
export type ProviderEvent = typeof ProviderEvent.Type;
