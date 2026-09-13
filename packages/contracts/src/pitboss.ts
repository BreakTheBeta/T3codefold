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
export const PitbossVerificationRecipe = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  projectId: ProjectId,
  version: Version,
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(120)),
  doctor: TrimmedNonEmptyString.check(Schema.isMaxLength(4000)),
  verify: TrimmedNonEmptyString.check(Schema.isMaxLength(4000)),
  cleanup: Text,
  timeoutSeconds: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 300 })),
  artifacts: Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(240))).check(
    Schema.isMaxLength(5),
  ),
});
export type PitbossVerificationRecipe = typeof PitbossVerificationRecipe.Type;
export const PitbossVerificationCheck = Schema.Struct({
  name: Schema.String,
  command: Schema.String,
  code: Schema.NullOr(Schema.Int),
  timedOut: Schema.Boolean,
  stdout: Schema.String.check(Schema.isMaxLength(4096)),
  stderr: Schema.String.check(Schema.isMaxLength(4096)),
});
export const PitbossVerificationReceipt = Schema.Struct({
  verdict: Schema.Literals(["pass", "fail", "inconclusive"]),
  summary: Text,
  checks: Schema.Array(PitbossVerificationCheck).check(Schema.isMaxLength(3)),
  artifacts: Schema.Array(
    Schema.Struct({ name: Schema.String, attachmentId: Schema.String }),
  ).check(Schema.isMaxLength(5)),
  finishedAt: Schema.String,
});
export type PitbossVerificationReceipt = typeof PitbossVerificationReceipt.Type;
export const PitbossVerification = Schema.Struct({
  id: Id,
  state: Schema.Literals(["pending", "running", "completed"]),
  candidate: Schema.String,
  attemptId: Id,
  criteriaVersion: Version,
  recipe: PitbossVerificationRecipe,
  requestedAt: Schema.String,
  receipt: Schema.optional(PitbossVerificationReceipt),
});
export type PitbossVerification = typeof PitbossVerification.Type;
/** Captured execution is distinct from review judgment and must match the current recipe. */
export function hasCurrentVerification(
  task: PitbossTask,
  recipe: PitbossVerificationRecipe | undefined,
  candidate: string,
) {
  const run = task.verification;
  return (
    !!run &&
    run.state === "completed" &&
    run.receipt?.verdict === "pass" &&
    run.candidate === candidate &&
    run.criteriaVersion === task.criteriaVersion &&
    run.recipe.version === recipe?.version &&
    run.recipe.projectId === task.projectId
  );
}
export const PitbossEvidence = Schema.Struct({
  capture: Schema.optional(
    Schema.Struct({
      recipeVersion: Version,
      recipeName: Schema.String,
      receipt: PitbossVerificationReceipt,
    }),
  ),
  id: Id,
  attemptId: Id,
  criteriaVersion: Version,
  candidate: TrimmedNonEmptyString,
  verdict: Schema.Literals(["pass", "fail", "inconclusive"]),
  summary: Text,
  command: Text,
  artifactUrls: Schema.Array(Text).check(Schema.isMaxLength(20)),
  provenance: Schema.Literals([
    "worker_report",
    "user_observation",
    "captured_check",
    "coordinator_review",
  ]),
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
export const PitbossLead = Schema.Struct({
  id: Id,
  threadId: ThreadId,
  projectId: ProjectId,
  generation: Version,
  parentGeneration: Version,
  status: Schema.Literals(["active", "dormant"]),
  charter: TrimmedNonEmptyString.check(Schema.isMaxLength(16000)),
  model: ModelSelection,
  maxWorkers: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10 })),
  context: Text,
  contextRevision: Version,
  updatedAt: Schema.String,
});
export type PitbossLead = typeof PitbossLead.Type;

/** Effective project authority, shared by the server and every client. */
export function isPitbossLeadActive(role: PitbossRole | null | undefined, lead: PitbossLead) {
  return (
    lead.status === "active" &&
    lead.parentGeneration === role?.generation &&
    role.brief.projectIds.includes(lead.projectId)
  );
}

export const PitbossTask = Schema.Struct({
  verification: Schema.optional(PitbossVerification),
  leadId: Schema.optional(Id),
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
  recipientLeadId: Schema.optional(Id),
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
  verificationRecipes: Schema.optional(Schema.Array(PitbossVerificationRecipe)),
  leads: Schema.optional(Schema.Array(PitbossLead)),
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
  Schema.Struct({ type: Schema.Literal("verification-recipe"), recipe: PitbossVerificationRecipe }),
  Schema.Struct({ type: Schema.Literal("verify"), taskId: Id, evidenceId: Id }),
  Schema.Struct({
    type: Schema.Literal("lead-message"),
    leadId: Id,
    text: TrimmedNonEmptyString.check(Schema.isMaxLength(16000)),
  }),
  Schema.Struct({
    type: Schema.Literal("create-lead"),
    leadId: Id,
    projectId: ProjectId,
    charter: PitbossLead.fields.charter,
    model: ModelSelection,
    maxWorkers: PitbossLead.fields.maxWorkers,
  }),
  Schema.Struct({
    type: Schema.Literal("lead-status"),
    leadId: Id,
    status: PitbossLead.fields.status,
  }),
  Schema.Struct({ type: Schema.Literal("lead-context"), leadId: Id, context: Text }),
  Schema.Struct({
    type: Schema.Literal("lead-report"),
    leadId: Id,
    text: TrimmedNonEmptyString.check(Schema.isMaxLength(16000)),
    taskIds: Schema.Array(Id).check(Schema.isMaxLength(50)),
    kind: Schema.Literals(["question", "progress", "result"]),
  }),
  Schema.Struct({ type: Schema.Literal("manage-task"), taskId: Id, leadId: Schema.NullOr(Id) }),
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
    type: Schema.Literal("review"),
    taskId: Id,
    attemptId: Id,
    candidate: TrimmedNonEmptyString,
    criteriaVersion: Version,
    verdict: PitbossEvidence.fields.verdict,
    summary: TrimmedNonEmptyString.check(Schema.isMaxLength(16000)),
    command: TrimmedNonEmptyString,
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
