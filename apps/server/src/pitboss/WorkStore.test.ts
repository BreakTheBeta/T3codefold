import { expect, it } from "@effect/vitest";
import { CommandId, MessageId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { WorkStore, layer } from "./WorkStore.ts";
import {
  applyConversationApproval,
  dispatchWithConversationApproval,
} from "./ConversationApproval.ts";
const database = SqlitePersistenceMemory;
const services = layer.pipe(Layer.provideMerge(database));
const election = {
  commandId: CommandId.make("elect"),
  expectedRevision: 0,
  action: {
    type: "elect" as const,
    threadId: ThreadId.make("boss"),
    projectId: ProjectId.make("tools"),
    brief: {
      priorities: "Tools reliability",
      quality: "Prove behavior",
      projectIds: [ProjectId.make("tools")],
      maxWorkers: 1,
      maxAttempts: 3,
      workerModel: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    },
  },
};
const prepareConversationDecision = Effect.fn("prepareConversationDecision")(function* (
  store: WorkStore["Service"],
) {
  const elected = yield* store.command(election, { type: "user" });
  const created = yield* store.command(
    {
      commandId: CommandId.make("conversation-create"),
      expectedRevision: elected.revision,
      authorityGeneration: elected.role!.generation,
      action: {
        type: "create",
        taskId: "conversation-task",
        projectId: election.action.projectId,
        title: "Conversation task",
        outcome: "Approve the reviewed checks",
        criteria: "Focused checks pass",
        verifyCommand: "vp test run focused.test.ts",
        priority: 1,
        dependencies: [],
        workspaceStrategy: { type: "root" },
      },
    },
    { type: "agent", threadId: election.action.threadId },
  );
  const recipe = {
    projectId: election.action.projectId,
    profileId: "conversation-focused",
    version: 1,
    name: "Conversation focused",
    doctor: "command -v vp",
    verify: "vp test run focused.test.ts",
    cleanup: "",
    timeoutSeconds: 60,
    artifacts: [],
  };
  const proposed = yield* store.command(
    {
      commandId: CommandId.make("conversation-proposal"),
      expectedRevision: created.revision,
      authorityGeneration: created.role!.generation,
      action: { type: "propose-verification", taskId: "conversation-task", recipe },
    },
    { type: "agent", threadId: election.action.threadId },
  );
  return yield* store.command(
    {
      commandId: CommandId.make("conversation-decision"),
      expectedRevision: proposed.revision,
      authorityGeneration: proposed.role!.generation,
      action: {
        type: "request-decision",
        taskId: "conversation-task",
        question: "Approve these checks?",
        options: ["Revise checks"],
        recommendation: "Approve after review",
      },
    },
    { type: "agent", threadId: election.action.threadId },
  );
});
it.effect("persists one election and one dispatch intent when the reply is lost and retried", () =>
  Effect.gen(function* () {
    const store = yield* WorkStore;
    const first = yield* store.command(election, { type: "user" });
    const retry = yield* store.command(election, { type: "user" });
    expect(retry.revision).toBe(first.revision);
    expect((yield* store.effects()).map((effect) => effect.operation_id)).toEqual(["elect"]);
    const conflict = yield* store
      .command(
        { ...election, action: { ...election.action, threadId: ThreadId.make("other") } },
        { type: "user" },
      )
      .pipe(Effect.flip);
    expect(conflict.code).toBe("conflict");
    expect((yield* store.read()).role?.threadId).toBe("boss");
  }).pipe(Effect.provide(services)),
);

it.effect("durably applies one exact conversation approval with its originating message", () =>
  Effect.gen(function* () {
    const store = yield* WorkStore;
    yield* prepareConversationDecision(store);
    const messageId = MessageId.make("conversation-user-message");
    const input = {
      threadId: election.action.threadId,
      messageId,
      text: "Approve verification for task conversation-task",
      createdBy: "user" as const,
      creationSource: "web" as const,
    };

    const applied = yield* applyConversationApproval(store, input);
    const replayed = yield* applyConversationApproval(store, input);
    if (applied.status === "rejected") return yield* applied.error;
    expect(applied.status).toBe("applied");
    expect(replayed.status).toBe("ignored");
    const state = yield* store.read();
    expect(state.tasks[0]?.approvedVerificationProposal).toMatchObject({ version: 1 });
    expect(state.messages.at(-1)?.sourceMessageId).toBe(messageId);
    expect(yield* store.rebuild()).toEqual(state);
  }).pipe(Effect.provide(services)),
);

it.effect("does not apply a prepared approval when user message dispatch fails", () =>
  Effect.gen(function* () {
    const store = yield* WorkStore;
    yield* prepareConversationDecision(store);
    const dispatched = yield* Effect.result(
      dispatchWithConversationApproval(
        store,
        {
          threadId: election.action.threadId,
          messageId: MessageId.make("undispatched-conversation-message"),
          text: "Approve verification for task conversation-task",
          createdBy: "user",
          creationSource: "web",
        },
        Effect.fail("message dispatch failed"),
      ),
    );

    expect(dispatched).toMatchObject({ _tag: "Failure", failure: "message dispatch failed" });
    const state = yield* store.read();
    expect(state.tasks[0]?.approvedVerificationProposal).toBeUndefined();
    expect(state.messages.some((message) => message.sourceMessageId)).toBe(false);
  }).pipe(Effect.provide(services)),
);

it.effect(
  "consumes a pre-dispatch approval without rebinding it after a replacement is linked",
  () =>
    Effect.gen(function* () {
      const store = yield* WorkStore;
      const reviewed = yield* prepareConversationDecision(store);
      const messageId = MessageId.make("stale-conversation-message");
      const input = {
        threadId: election.action.threadId,
        messageId,
        text: "Approve verification for task conversation-task",
        createdBy: "user" as const,
        creationSource: "web" as const,
      };
      const reviewedDecisionId = reviewed.tasks[0]!.decisions![0]!.id;
      const dispatch = Effect.gen(function* () {
        const replacement = yield* store.command(
          {
            commandId: CommandId.make("replacement-conversation-proposal"),
            expectedRevision: reviewed.revision,
            authorityGeneration: reviewed.role!.generation,
            action: {
              type: "propose-verification",
              taskId: "conversation-task",
              recipe: {
                ...reviewed.tasks[0]!.proposedVerificationRecipe!,
                version: 2,
                verify: "vp test run replacement.test.ts",
              },
            },
          },
          { type: "agent", threadId: election.action.threadId },
        );
        const declined = yield* store.command(
          {
            commandId: CommandId.make("decline-replaced-conversation-decision"),
            expectedRevision: replacement.revision,
            action: {
              type: "resolve-decision",
              taskId: "conversation-task",
              decisionId: reviewedDecisionId,
              answer: "Revise checks",
            },
          },
          { type: "user" },
        );
        return yield* store.command(
          {
            commandId: CommandId.make("replacement-conversation-decision"),
            expectedRevision: declined.revision,
            authorityGeneration: declined.role!.generation,
            action: {
              type: "request-decision",
              taskId: "conversation-task",
              question: "Approve the replacement checks?",
              options: ["Revise replacement checks"],
              recommendation: "Approve after reviewing the replacement",
            },
          },
          { type: "agent", threadId: election.action.threadId },
        );
      });

      const handled = yield* dispatchWithConversationApproval(store, input, dispatch);
      const replay = yield* applyConversationApproval(store, input);
      expect(handled.approval.status).toBe("rejected");
      expect(replay.status).toBe("ignored");
      const state = yield* store.read();
      expect(state.tasks[0]?.approvedVerificationProposal).toBeUndefined();
      expect(state.tasks[0]?.proposedVerificationDecisionId).toBeDefined();
      expect(state.messages.at(-1)).toMatchObject({
        id: "conversation-approval-rejected:stale-conversation-message",
        sourceMessageId: messageId,
        kind: "question",
      });
      expect(yield* store.rebuild()).toEqual(state);
    }).pipe(Effect.provide(services)),
);

it.effect("does not expose the portfolio or role controls to an unrelated agent", () =>
  Effect.gen(function* () {
    const store = yield* WorkStore;
    yield* store.command(election, { type: "user" });
    const actor = { type: "agent" as const, threadId: ThreadId.make("stranger") };
    const readError = yield* store.read(actor).pipe(Effect.flip);
    expect(readError.code).toBe("forbidden");
    const error = yield* store
      .command(
        {
          commandId: CommandId.make("pause"),
          expectedRevision: 1,
          action: { type: "pause", paused: true },
        },
        actor,
      )
      .pipe(Effect.flip);
    expect(error.code).toBe("forbidden");
    expect((yield* store.read()).role?.paused).toBe(false);
  }).pipe(Effect.provide(services)),
);

it.effect("does not let a downgraded coordinator launch the saved full-access default", () =>
  Effect.gen(function* () {
    const store = yield* WorkStore;
    const elected = yield* store.command(election, { type: "user" });
    const brief = { ...elected.role!.brief, workerRuntimeMode: "full-access" as const };
    const configured = yield* store.command(
      {
        commandId: CommandId.make("full-worker-default"),
        expectedRevision: elected.revision,
        action: { type: "brief", brief },
      },
      { type: "user" },
    );
    const denied = yield* store
      .command(
        {
          commandId: CommandId.make("downgraded-lead"),
          expectedRevision: configured.revision,
          authorityGeneration: configured.role!.generation,
          action: {
            type: "create-lead",
            leadId: "downgraded",
            projectId: election.action.projectId,
            charter: "Own the project",
            model: election.action.brief.workerModel,
            maxWorkers: 1,
          },
        },
        { type: "agent", threadId: election.action.threadId },
        { runtimeMode: "approval-required" },
      )
      .pipe(Effect.flip);
    expect(denied.code).toBe("forbidden");
    expect((yield* store.read()).leads ?? []).toEqual([]);
  }).pipe(Effect.provide(services)),
);

it.effect("does not revise retained work when caller runtime authority is unknown", () =>
  Effect.gen(function* () {
    const store = yield* WorkStore;
    const elected = yield* store.command(election, { type: "user" });
    const configured = yield* store.command(
      {
        commandId: CommandId.make("full-worker-default-for-revision"),
        expectedRevision: elected.revision,
        action: {
          type: "brief",
          brief: { ...elected.role!.brief, workerRuntimeMode: "full-access" },
        },
      },
      { type: "user" },
    );
    const created = yield* store.command(
      {
        commandId: CommandId.make("create-retained-task"),
        expectedRevision: configured.revision,
        authorityGeneration: configured.role!.generation,
        action: {
          type: "create",
          taskId: "retained-task",
          projectId: election.action.projectId,
          title: "Retained work",
          outcome: "Repair the candidate",
          criteria: "Focused proof passes",
          verifyCommand: "vp test run focused.test.ts",
          priority: 1,
          dependencies: [],
          workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
        },
      },
      { type: "agent", threadId: election.action.threadId },
    );
    const assigned = yield* store.command(
      {
        commandId: CommandId.make("assign-retained-task"),
        expectedRevision: created.revision,
        action: { type: "assign", taskId: "retained-task" },
      },
      { type: "user" },
    );
    const denied = yield* store
      .command(
        {
          commandId: CommandId.make("revise-with-unknown-runtime"),
          expectedRevision: assigned.revision,
          authorityGeneration: assigned.role!.generation,
          action: {
            type: "revise-result",
            taskId: "retained-task",
            note: "Repair the focused failure",
          },
        },
        { type: "agent", threadId: election.action.threadId },
      )
      .pipe(Effect.flip);
    expect(denied.code).toBe("forbidden");
    expect(denied.message).toContain("caller mode unknown");
    expect((yield* store.read()).tasks[0]!.revisionRequest).toBeUndefined();
  }).pipe(Effect.provide(services)),
);

it.effect(
  "deduplicates tracker refreshes and keeps external Done separate from accepted work",
  () =>
    Effect.gen(function* () {
      const store = yield* WorkStore;
      const config = {
        id: "local",
        kind: "vikunja" as const,
        baseUrl: "http://localhost:18456",
        tenantId: "pilot",
        remoteProjectId: "2",
        projectId: ProjectId.make("tools"),
        enabled: true,
      };
      const observation = {
        title: "Tracker task",
        outcome: "Prove behavior",
        source: {
          kind: "vikunja" as const,
          tenantId: "pilot",
          itemId: "1",
          key: "#1",
          url: "http://localhost:18456/tasks/1",
          status: "Open",
          priority: "3",
          observedAt: "2026-09-10T00:00:00.000Z",
        },
      };
      yield* store.importSources(config, [observation]);
      const initial = yield* store.read();
      yield* store.importSources(config, [
        {
          ...observation,
          source: { ...observation.source, observedAt: "2026-09-10T00:01:00.000Z" },
        },
      ]);
      expect((yield* store.read()).revision).toBe(initial.revision);
      yield* store.importSources(config, [
        { ...observation, source: { ...observation.source, status: "Done" } },
      ]);
      const result = yield* store.read();
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0]?.source?.status).toBe("Done");
      expect(result.tasks[0]?.status).toBe("blocked");
      expect(result.tasks[0]?.acceptedEvidenceId).toBeNull();
    }).pipe(Effect.provide(services)),
);

it.effect("rebuilds the disposable projection from the durable journal", () =>
  Effect.gen(function* () {
    const store = yield* WorkStore;
    const expected = yield* store.command(election, { type: "user" });
    const sql = yield* SqlClient.SqlClient;
    yield* sql`DELETE FROM pitboss_state`;
    expect(yield* store.read()).toEqual(expected);
    expect(yield* store.rebuild()).toEqual(expected);
    expect((yield* store.effects()).map((effect) => effect.operation_id)).toEqual(["elect"]);
  }).pipe(Effect.provide(services)),
);

it.effect(
  "reuses a recorded context packet after brief changes and rejects cross-thread reuse",
  () =>
    Effect.gen(function* () {
      const store = yield* WorkStore;
      yield* store.command(election, { type: "user" });
      const first = yield* store.context(ThreadId.make("boss"), "turn-one");
      yield* store.command(
        {
          commandId: CommandId.make("pause-context"),
          expectedRevision: 1,
          action: { type: "pause", paused: true },
        },
        { type: "user" },
      );
      expect(yield* store.context(ThreadId.make("boss"), "turn-one")).toBe(first);
      expect(yield* store.context(ThreadId.make("boss"), "turn-two")).toContain("paused");
      const error = yield* store.context(ThreadId.make("stranger"), "turn-one").pipe(Effect.flip);
      expect(error.code).toBe("conflict");
    }).pipe(Effect.provide(services)),
);

it.effect("keeps a failed dispatch visible as an unresolved obligation after recovery", () =>
  Effect.gen(function* () {
    const store = yield* WorkStore;
    yield* store.command(election, { type: "user" });
    yield* store.finishEffect("elect", "Thread is unavailable; choose another pitboss.");
    yield* store.finishEffect("elect", "Thread is unavailable; choose another pitboss.");
    const state = yield* store.read();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.kind).toBe("question");
    expect(state.messages[0]?.acknowledged).toBe(false);
    expect(state.messages[0]?.text).toContain("Thread is unavailable");
    expect(yield* store.rebuild()).toEqual(state);
  }).pipe(Effect.provide(services)),
);

it.effect("keeps projects outside the elected brief out of agent reads and injected context", () =>
  Effect.gen(function* () {
    const store = yield* WorkStore;
    yield* store.importSources(
      {
        id: "old-scope",
        kind: "vikunja",
        baseUrl: "http://tracker.test",
        tenantId: "old-company",
        remoteProjectId: "1",
        projectId: ProjectId.make("other-project"),
        enabled: true,
      },
      [
        {
          title: "Outside portfolio",
          outcome: "Private outside-scope details",
          source: {
            kind: "vikunja",
            tenantId: "old-company",
            itemId: "1",
            key: "#1",
            url: "http://tracker.test/tasks/1",
            status: "Open",
            priority: "1",
            observedAt: "2026-09-10T00:00:00Z",
          },
        },
      ],
    );
    yield* store.command(
      { ...election, expectedRevision: (yield* store.read()).revision },
      { type: "user" },
    );
    expect((yield* store.read()).tasks).toHaveLength(1);
    expect(
      (yield* store.read({ type: "agent", threadId: ThreadId.make("boss") })).tasks,
    ).toHaveLength(0);
    expect(yield* store.context(ThreadId.make("boss"), "scoped-packet")).not.toContain(
      "Outside portfolio",
    );
  }).pipe(Effect.provide(services)),
);

it.effect(
  "recovers one lead launch intent and scopes its durable project context after replay",
  () =>
    Effect.gen(function* () {
      const store = yield* WorkStore;
      yield* store.command(election, { type: "user" });
      const input = {
        commandId: CommandId.make("create-terra"),
        expectedRevision: 1,
        authorityGeneration: 1,
        action: {
          type: "create-lead" as const,
          leadId: "terra",
          projectId: election.action.projectId,
          charter: "Build a small app with two bounded workers and inspect the combined result",
          model: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.6-terra" },
          maxWorkers: 1,
          runtimeMode: "full-access" as const,
        },
      };
      const boss = { type: "agent" as const, threadId: election.action.threadId };
      const first = yield* store.command(input, boss, { runtimeMode: "full-access" });
      const retry = yield* store.command(input, boss, { runtimeMode: "approval-required" });
      expect(retry.revision).toBe(first.revision);
      expect(first.leads?.[0]?.runtimeMode).toBe("full-access");
      expect((yield* store.effects()).filter((e) => e.kind === "create-lead")).toHaveLength(1);
      const denied = yield* store
        .command(
          {
            ...input,
            commandId: CommandId.make("create-terra-again"),
            expectedRevision: first.revision,
          },
          boss,
          { runtimeMode: "approval-required" },
        )
        .pipe(Effect.flip);
      expect(denied.code).toBe("forbidden");
      const lead = first.leads![0]!;
      const actor = { type: "agent" as const, threadId: lead.threadId };
      yield* store.command(
        {
          commandId: CommandId.make("project-context"),
          expectedRevision: first.revision,
          authorityGeneration: lead.generation,
          action: {
            type: "lead-context",
            leadId: lead.id,
            context: "Decision: keep data in localStorage. Evidence: fixture test.",
          },
        },
        actor,
      );
      yield* store.rebuild();
      const scoped = yield* store.read(actor);
      expect(scoped.leads?.[0]?.context).toContain("localStorage");
      expect(scoped.sourceAuthorities).toEqual([]);
      expect(scoped.role?.brief.priorities).toBe(lead.charter);
      expect(yield* store.context(lead.threadId, "fresh-session")).toContain("localStorage");
      expect((yield* store.effects()).filter((e) => e.kind === "create-lead")).toHaveLength(1);
    }).pipe(Effect.provide(services)),
);
