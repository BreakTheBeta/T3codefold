import { PitbossSourceAuthority } from "./pitbossAuthority.ts";
import * as Schema from "effect/Schema";
import {
  EnvironmentId,
  CommandId,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ModelSelection } from "./modelSelection.ts";
import { OrchestrationV2ThreadLaunchWorkspaceStrategy } from "./orchestrationV2.ts";

const Text = Schema.String.check(Schema.isMaxLength(16000));
const Id = TrimmedNonEmptyString.check(Schema.isMaxLength(200));
const Version = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export const PitbossBrief = Schema.Struct({
  priorities: Text,
  quality: Text,
  projectIds: Schema.Array(ProjectId).check(Schema.isMaxLength(50)),
  maxWorkers: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10 })),
  maxAttempts: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 })),
  workerModel: ModelSelection,
  alternateWorkerModel: Schema.optional(ModelSelection),
  modelGuidance: Schema.optional(Text),
  managedPeerIds: Schema.optional(Schema.Array(Id).check(Schema.isMaxLength(50))),
  workerRuntimeMode: Schema.optional(Schema.Literals(["approval-required", "full-access"])),
});
export type PitbossBrief = typeof PitbossBrief.Type;
export const PitbossRole = Schema.Struct({
  threadId: ThreadId,
  projectId: ProjectId,
  generation: Version,
  paused: Schema.Boolean,
  brief: PitbossBrief,
});
export type PitbossRole = typeof PitbossRole.Type;
export const PitbossEvidence = Schema.Struct({
  id: Id,
  attemptId: Id,
  criteriaVersion: Version,
  candidate: TrimmedNonEmptyString,
  verdict: Schema.Literals(["pass", "fail", "inconclusive"]),
  summary: Text,
  command: Text,
  artifactUrls: Schema.Array(Text).check(Schema.isMaxLength(20)),
  provenance: Schema.Literals(["worker_report", "user_observation", "captured_check"]),
  createdAt: Schema.String,
});
export type PitbossEvidence = typeof PitbossEvidence.Type;
export const PitbossAttempt = Schema.Struct({
  id: Id,
  threadId: ThreadId,
  generation: Version,
  state: Schema.Literals([
    "pending",
    "running",
    "submitted",
    "stop_requested",
    "stopped",
    "failed",
  ]),
  model: ModelSelection,
  createdAt: Schema.String,
  detail: Text,
  workspacePath: Schema.optional(Schema.String),
});
export type PitbossAttempt = typeof PitbossAttempt.Type;
export const PitbossSource = Schema.Struct({
  kind: Schema.Literals(["vikunja", "jira", "linear"]),
  tenantId: Id,
  itemId: Id,
  scope: Schema.optional(Id),
  contentDigest: Schema.optional(Id),
  key: Text,
  url: Text,
  status: Text,
  priority: Text,
  observedAt: Schema.String,
});
export type PitbossSource = typeof PitbossSource.Type;
export const PitbossTask = Schema.Struct({
  pendingOperationId: Schema.optional(Id),
  homeEnvironmentId: Schema.optional(EnvironmentId),
  homeRevision: Schema.optional(Version),
  id: Id,
  revision: Version,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  outcome: Text,
  criteria: TrimmedNonEmptyString,
  criteriaVersion: Version,
  verifyCommand: Text,
  priority: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  dependencies: Schema.Array(Id).check(Schema.isMaxLength(50)),
  workspaceStrategy: OrchestrationV2ThreadLaunchWorkspaceStrategy,
  status: Schema.Literals(["queued", "active", "verifying", "done", "blocked", "cancelled"]),
  attempts: Schema.Array(PitbossAttempt),
  evidence: Schema.Array(PitbossEvidence),
  source: Schema.NullOr(PitbossSource),
  note: Text,
  acceptedEvidenceId: Schema.NullOr(Id),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type PitbossTask = typeof PitbossTask.Type;
export const PitbossMessage = Schema.Struct({
  sourcePeerId: Schema.optional(Id),
  sourceMessageId: Schema.optional(Id),
  replyTo: Schema.optional(Id),
  id: Id,
  taskId: Schema.NullOr(Id),
  threadId: Schema.NullOr(ThreadId),
  kind: Schema.Literals(["question", "progress", "result", "decision"]),
  text: Text,
  createdAt: Schema.String,
  acknowledged: Schema.Boolean,
});
export type PitbossMessage = typeof PitbossMessage.Type;
export const PitbossSnapshot = Schema.Struct({
  sourceAuthorities: Schema.optional(Schema.Array(PitbossSourceAuthority)),
  revision: Version,
  role: Schema.NullOr(PitbossRole),
  tasks: Schema.Array(PitbossTask),
  messages: Schema.Array(PitbossMessage),
});
export type PitbossSnapshot = typeof PitbossSnapshot.Type;
const TaskFields = {
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  outcome: Text,
  criteria: TrimmedNonEmptyString,
  verifyCommand: Text,
  priority: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  dependencies: Schema.Array(Id).check(Schema.isMaxLength(50)),
  workspaceStrategy: OrchestrationV2ThreadLaunchWorkspaceStrategy,
};
export const PitbossAction = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("send-peer"),
    peerId: Id,
    text: TrimmedNonEmptyString.check(Schema.isMaxLength(12000)),
    replyTo: Schema.optional(Id),
  }),
  Schema.Struct({
    type: Schema.Literal("propose-coordination"),
    peerId: Id,
    coordinator: EnvironmentId,
  }),
  Schema.Struct({
    type: Schema.Literal("elect"),
    threadId: ThreadId,
    projectId: ProjectId,
    brief: PitbossBrief,
  }),
  Schema.Struct({ type: Schema.Literal("dismiss") }),
  Schema.Struct({ type: Schema.Literal("pause"), paused: Schema.Boolean }),
  Schema.Struct({ type: Schema.Literal("brief"), brief: PitbossBrief }),
  Schema.Struct({ type: Schema.Literal("create"), taskId: Id, ...TaskFields }),
  Schema.Struct({ type: Schema.Literal("edit"), taskId: Id, ...TaskFields }),
  Schema.Struct({
    type: Schema.Literal("assign"),
    taskId: Id,
    model: Schema.optional(ModelSelection),
    resumeAttemptId: Schema.optional(Id),
  }),
  Schema.Struct({
    type: Schema.Literal("report"),
    taskId: Id,
    kind: Schema.Literals(["question", "progress"]),
    text: Text,
  }),
  Schema.Struct({
    type: Schema.Literal("submit"),
    taskId: Id,
    attemptId: Id,
    candidate: TrimmedNonEmptyString,
    criteriaVersion: Version,
    verdict: PitbossEvidence.fields.verdict,
    summary: Text,
    command: Text,
    artifactUrls: PitbossEvidence.fields.artifactUrls,
  }),
  Schema.Struct({
    type: Schema.Literal("accept"),
    taskId: Id,
    evidenceId: Id,
    note: TrimmedNonEmptyString,
  }),
  Schema.Struct({ type: Schema.Literal("rework"), taskId: Id, note: TrimmedNonEmptyString }),
  Schema.Struct({ type: Schema.Literal("cancel"), taskId: Id, note: Text }),
  Schema.Struct({ type: Schema.Literal("reopen"), taskId: Id }),
  Schema.Struct({ type: Schema.Literal("acknowledge"), messageId: Id }),
]);
export type PitbossAction = typeof PitbossAction.Type;
export const PitbossCommand = Schema.Struct({
  commandId: CommandId,
  expectedRevision: Version,
  authorityGeneration: Schema.optional(Version),
  action: PitbossAction,
});
export type PitbossCommand = typeof PitbossCommand.Type;
export class PitbossError extends Schema.TaggedError<PitbossError>()("PitbossError", {
  code: Schema.Literals(["conflict", "forbidden", "invalid", "unavailable"]),
  message: Schema.String,
}) {}
export const PitbossReadInput = Schema.Record(Schema.String, Schema.Never);

export const PitbossSourceConfig = Schema.Struct({
  id: Id,
  kind: Schema.Literals(["vikunja", "jira", "linear"]),
  baseUrl: TrimmedNonEmptyString,
  tenantId: Id,
  remoteProjectId: Id,
  projectId: ProjectId,
  enabled: Schema.Boolean,
});
export type PitbossSourceConfig = typeof PitbossSourceConfig.Type;
export const PitbossSourceConnection = Schema.Struct({
  config: PitbossSourceConfig,
  lastSyncAt: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
});
export type PitbossSourceConnection = typeof PitbossSourceConnection.Type;
export const PitbossSourcesResult = Schema.Struct({
  sources: Schema.Array(PitbossSourceConnection),
});
export const PitbossSourceRequest = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("configure"),
    config: PitbossSourceConfig,
    token: Schema.optional(Text),
  }),
  Schema.Struct({ type: Schema.Literal("sync"), id: Id }),
]);
export type PitbossSourceRequest = typeof PitbossSourceRequest.Type;

export type PitbossSourcesResult = typeof PitbossSourcesResult.Type;
