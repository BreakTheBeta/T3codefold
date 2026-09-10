// @effect-diagnostics nodeBuiltinImport:off - real loopback HTTP servers are the integration boundary under test.
import * as NodeHttp from "node:http";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  PitbossForwardIntent,
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  EnvironmentId,
  type PitbossAction,
  type PitbossPeerEnvelope,
} from "@t3tools/contracts";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Scope from "effect/Scope";
import * as Schema from "effect/Schema";
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { ServerSecretStore } from "../auth/ServerSecretStore.ts";
import {
  SqlitePersistenceMemory,
  makeSqlitePersistenceLive,
} from "../persistence/Layers/Sqlite.ts";
import { WorkStore, layer as workLayer } from "./WorkStore.ts";
import { PeerService, layer as peerLayer } from "./PeerService.ts";
import { layer as routes } from "./PeerHttp.ts";

const decodeForward = Schema.decodeUnknownSync(Schema.fromJsonString(PitbossForwardIntent));
const startPeer = Effect.fn("startPeer")(function* (
  name: string,
  options?: { dbPath: string; secrets: Map<string, Uint8Array> },
) {
  const runtimeScope = yield* Scope.fork(yield* Scope.Scope);
  const secrets = options?.secrets ?? new Map<string, Uint8Array>();
  const identity = Layer.mock(ServerEnvironment)({
    getEnvironmentId: Effect.succeed(EnvironmentId.make(name)),
  });
  const secretLayer = Layer.mock(ServerSecretStore)({
    get: (key) => Effect.sync(() => Option.fromNullishOr(secrets.get(key))),
    set: (key, value) =>
      Effect.sync(() => {
        secrets.set(key, value);
      }),
  });
  const database = Layer.fresh(
    options
      ? makeSqlitePersistenceLive(options.dbPath).pipe(Layer.provide(NodeServices.layer))
      : SqlitePersistenceMemory,
  );
  const work = workLayer;
  const services = peerLayer.pipe(
    Layer.provideMerge(work),
    Layer.provide(database),
    Layer.provide(identity),
    Layer.provide(secretLayer),
    Layer.provide(FetchHttpClient.layer),
  );
  const built = yield* Layer.build(services).pipe(Effect.provideService(Scope.Scope, runtimeScope));
  const peer = Context.get(built, PeerService);
  const store = Context.get(built, WorkStore);
  const serverScope = yield* Scope.fork(runtimeScope);
  const http = NodeHttpServer.layer(NodeHttp.createServer, { host: "127.0.0.1", port: 0 });
  const serving = HttpRouter.serve(routes.pipe(Layer.provide(Layer.succeed(PeerService, peer))), {
    disableListenLog: true,
    disableLogger: true,
  }).pipe(Layer.provideMerge(http));
  const serverContext = yield* Layer.build(serving).pipe(
    Effect.provideService(Scope.Scope, serverScope),
  );
  const address = Context.get(serverContext, HttpServer.HttpServer).address;
  if (address._tag !== "TcpAddress") return yield* Effect.die("Expected loopback TCP listener");
  return {
    peer,
    store,
    url: `http://127.0.0.1:${address.port}`,
    stop: Scope.close(serverScope, Exit.succeed(undefined)),
    shutdown: Scope.close(runtimeScope, Exit.succeed(undefined)),
  };
});

it.effect(
  "reconciles two independent servers, requires both approvals, and retains home while offline",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const a = yield* startPeer("env-a");
        const b = yield* startPeer("env-b");
        const scope = '["vikunja","local","4"]';
        const secret = "test-only-shared-peer-credential-123456789";
        yield* a.peer.execute({
          type: "configure",
          config: {
            id: "b",
            environmentId: EnvironmentId.make("env-b"),
            url: b.url,
            scope,
            enabled: true,
          },
          secret,
        });
        yield* b.peer.execute({
          type: "configure",
          config: {
            id: "a",
            environmentId: EnvironmentId.make("env-a"),
            url: a.url,
            scope,
            enabled: true,
          },
          secret,
        });
        const prepare = Effect.fn("prepareSharedTask")(function* (
          store: WorkStore["Service"],
          owner: string,
        ) {
          const projectId = ProjectId.make("shared-project");
          const command = (action: PitbossAction) =>
            Effect.gen(function* () {
              const state = yield* store.read();
              return yield* store.command(
                {
                  commandId: CommandId.make(`${owner}-${state.revision}`),
                  expectedRevision: state.revision,
                  action,
                },
                { type: "user" },
              );
            });
          yield* command({
            type: "elect",
            threadId: ThreadId.make(`${owner}-boss`),
            projectId,
            brief: {
              priorities: "Shared task",
              quality: "Prove it",
              projectIds: [projectId],
              maxWorkers: 1,
              maxAttempts: 3,
              workerModel: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
            },
          });
          yield* store.importSources(
            {
              id: "source",
              kind: "vikunja",
              baseUrl: "http://tracker.test",
              tenantId: "local",
              remoteProjectId: "4",
              projectId,
              enabled: true,
            },
            [
              {
                title: "Shared source item",
                outcome: "Verify one owner",
                source: {
                  kind: "vikunja",
                  tenantId: "local",
                  itemId: "one",
                  key: "#1",
                  url: "http://tracker.test/tasks/one",
                  status: "Open",
                  priority: "1",
                  observedAt: "2026-09-10T00:00:00Z",
                },
              },
            ],
          );
          const task = (yield* store.read()).tasks[0]!;
          yield* command({
            type: "edit",
            taskId: task.id,
            projectId,
            title: task.title,
            outcome: task.outcome,
            criteria: "Exactly one executor",
            verifyCommand: "test ownership",
            priority: 1,
            dependencies: [],
            workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
          });
          yield* command({ type: "reopen", taskId: task.id });
          return { command, taskId: task.id };
        });
        const taskA = yield* prepare(a.store, "a");
        const taskB = yield* prepare(b.store, "b");
        expect(taskA.taskId).toBe(taskB.taskId);
        yield* taskA.command({ type: "assign", taskId: taskA.taskId }).pipe(Effect.flip);
        const proposal = {
          id: "proposal-one",
          scope,
          coordinator: EnvironmentId.make("env-a"),
          participants: [EnvironmentId.make("env-a"), EnvironmentId.make("env-b")] as const,
        };
        yield* a.peer.execute({ type: "propose", peerId: "b", proposal });
        yield* a.peer.execute({ type: "sync", peerId: "b" });
        expect((yield* b.peer.list()).peers[0]?.view.proposals).toHaveLength(1);
        expect((yield* a.store.read()).sourceAuthorities?.[0]?.coordinator).toBeNull();
        yield* a.peer.execute({ type: "approve", peerId: "b", proposalId: proposal.id });
        yield* a.peer.execute({ type: "sync", peerId: "b" });
        expect((yield* b.store.read()).sourceAuthorities?.[0]?.coordinator).toBeNull();
        yield* b.peer.execute({ type: "approve", peerId: "a", proposalId: proposal.id });
        yield* b.peer.execute({ type: "sync", peerId: "a" });
        expect((yield* a.store.read()).sourceAuthorities?.[0]?.coordinator).toBe("env-a");
        expect((yield* b.store.read()).sourceAuthorities?.[0]?.coordinator).toBe("env-a");
        yield* taskA.command({ type: "assign", taskId: taskA.taskId });
        yield* taskB.command({ type: "assign", taskId: taskB.taskId }).pipe(Effect.flip);
        expect((yield* a.store.read()).tasks[0]?.attempts).toHaveLength(1);
        expect((yield* b.store.read()).tasks[0]?.attempts).toHaveLength(0);
        const stale: PitbossPeerEnvelope = {
          environmentId: EnvironmentId.make("env-b"),
          scope,
          view: { proposals: [], approvals: {}, versions: { "env-b": 0 } },
        };
        yield* a.peer.receive(`Bearer ${secret}`, stale);
        expect((yield* a.store.read()).sourceAuthorities?.[0]?.coordinator).toBe("env-a");
        const rejected = yield* a.peer.receive("Bearer incorrect", stale).pipe(Effect.flip);
        expect(rejected.code).toBe("forbidden");
        const firstAttempt = (yield* a.store.read()).tasks[0]!.attempts[0]!;
        yield* taskA.command({
          type: "rework",
          taskId: taskA.taskId,
          note: "Resolve before handoff",
        });
        yield* a.store.updateAttempt(
          taskA.taskId,
          firstAttempt.id,
          "stopped",
          "Stopped at provider boundary",
        );
        yield* taskA.command({ type: "reopen", taskId: taskA.taskId });
        const successor = {
          ...proposal,
          id: "proposal-two",
          coordinator: EnvironmentId.make("env-b"),
          homeEnvironmentId: EnvironmentId.make("env-a"),
        };
        yield* a.peer.execute({ type: "propose", peerId: "b", proposal: successor });
        yield* a.peer.execute({ type: "sync", peerId: "b" });
        yield* a.peer.execute({ type: "approve", peerId: "b", proposalId: successor.id });
        yield* a.peer.execute({ type: "sync", peerId: "b" });
        yield* b.peer.execute({ type: "approve", peerId: "a", proposalId: successor.id });
        yield* b.peer.execute({ type: "sync", peerId: "a" });
        expect((yield* b.store.read()).sourceAuthorities?.[0]?.homeEnvironmentId).toBe("env-a");
        const beforeForward = yield* b.store.read();
        yield* b.store.command(
          {
            commandId: CommandId.make("forward-assignment"),
            expectedRevision: beforeForward.revision,
            action: { type: "assign", taskId: taskB.taskId },
          },
          { type: "user" },
        );
        expect((yield* b.store.read()).tasks[0]?.pendingOperationId).toBe("forward-assignment");
        const intent = (yield* b.store.effects()).find((effect) => effect.kind === "forward")!;
        const forwarded = decodeForward(intent.payload_json).message;
        if (forwarded.operation?.type !== "command")
          return yield* Effect.die("Expected a task command intent");
        yield* b.peer.send("a", forwarded);
        yield* b.peer.send("a", forwarded);
        yield* b.peer.execute({ type: "sync", peerId: "a" });
        yield* b.peer.execute({ type: "sync", peerId: "a" });
        expect((yield* a.store.read()).tasks[0]?.attempts).toHaveLength(2);
        expect((yield* b.store.read()).tasks[0]?.pendingOperationId).toBeUndefined();
        yield* a.peer.execute({ type: "sync", peerId: "b" });
        expect((yield* b.store.read()).tasks[0]?.homeEnvironmentId).toBe("env-a");
        expect((yield* b.store.read()).tasks[0]?.attempts).toHaveLength(2);
        yield* b.peer.send("a", {
          ...forwarded,
          id: "stale-control",
          operation: {
            ...forwarded.operation,
            proposalId: proposal.id,
            taskRevision: (yield* a.store.read()).tasks[0]!.revision,
            action: { type: "cancel", taskId: taskA.taskId, note: "Old coordinator request" },
          },
        });
        yield* b.peer.execute({ type: "sync", peerId: "a" });
        expect((yield* a.store.read()).tasks[0]?.status).toBe("active");
        expect(
          (yield* b.store.read()).messages.some((message) =>
            message.text.includes("authority is stale"),
          ),
        ).toBe(true);
        expect((yield* b.store.effects()).some((effect) => effect.kind === "assign")).toBe(false);
        const candidateTask = (yield* a.store.read()).tasks[0]!;
        const candidateAttempt = candidateTask.attempts.at(-1)!;
        yield* a.store.command(
          {
            commandId: CommandId.make("remote-worker-proof"),
            expectedRevision: (yield* a.store.read()).revision,
            action: {
              type: "submit",
              taskId: candidateTask.id,
              attemptId: candidateAttempt.id,
              candidate: "fixture:candidate-2",
              criteriaVersion: candidateTask.criteriaVersion,
              verdict: "pass",
              summary: "One executor confirmed",
              command: "test ownership",
              artifactUrls: [],
            },
          },
          { type: "agent", threadId: candidateAttempt.threadId },
        );
        yield* a.store.updateAttempt(
          candidateTask.id,
          candidateAttempt.id,
          "stopped",
          "Worker exited after submission",
        );
        yield* a.peer.execute({ type: "sync", peerId: "b" });
        const observed = (yield* b.store.read()).tasks[0]!;
        expect(observed.evidence.at(-1)?.candidate).toBe("fixture:candidate-2");
        yield* b.peer.send("a", {
          ...forwarded,
          id: "accept-proof",
          operation: {
            ...forwarded.operation,
            taskRevision: observed.revision,
            action: {
              type: "accept",
              taskId: observed.id,
              evidenceId: observed.evidence.at(-1)!.id,
              note: "Reviewed the home evidence",
            },
          },
        });
        yield* b.peer.execute({ type: "sync", peerId: "a" });
        yield* a.peer.execute({ type: "sync", peerId: "b" });
        expect((yield* b.store.read()).tasks[0]?.status).toBe("done");
        expect((yield* b.store.read()).tasks[0]?.acceptedEvidenceId).toBe(
          observed.evidence.at(-1)!.id,
        );
        expect(yield* b.store.rebuild()).toEqual(yield* b.store.read());
        yield* a.stop;
        yield* b.peer.execute({ type: "sync", peerId: "a" }).pipe(Effect.flip);
        expect((yield* b.store.read()).sourceAuthorities?.[0]?.coordinator).toBe("env-b");
        expect((yield* b.store.read()).sourceAuthorities?.[0]?.homeEnvironmentId).toBe("env-a");
      }),
    ),
);

it.effect(
  "replays durable peer mail after a lost reply without duplicating the pitboss inbox",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const a = yield* startPeer("mail-a");
        const b = yield* startPeer("mail-b");
        const secret = "test-only-mail-shared-credential-123456789";
        for (const [local, remote, id, environmentId] of [
          [a, b, "b", "mail-b"],
          [b, a, "a", "mail-a"],
        ] as const) {
          yield* local.peer.execute({
            type: "configure",
            config: {
              id,
              environmentId: EnvironmentId.make(environmentId),
              url: remote.url,
              scope: "shared",
              enabled: true,
            },
            secret,
          });
        }
        const message = {
          id: "request-1",
          text: "Please inspect the shared backlog.",
          originThreadId: ThreadId.make("boss-a"),
          createdAt: "2026-09-10T00:00:00Z",
        };
        yield* a.peer.send("b", message);
        yield* a.peer.send("b", message);
        // Simulate the destination committing while the sender loses its HTTP response.
        yield* b.peer.receive(`Bearer ${secret}`, {
          environmentId: EnvironmentId.make("mail-a"),
          scope: "shared",
          view: (yield* a.peer.list()).peers[0]!.view,
          messages: [message],
        });
        expect((yield* a.peer.list()).peers[0]?.pendingMessages).toBe(1);
        yield* a.peer.execute({ type: "sync", peerId: "b" });
        yield* a.peer.execute({ type: "sync", peerId: "b" });
        const inbox = (yield* b.store.read()).messages;
        expect(
          inbox.filter((entry) => entry.text.includes("inspect the shared backlog")),
        ).toHaveLength(1);
        expect((yield* a.peer.list()).peers[0]?.pendingMessages).toBe(0);
        const changed = yield* a.peer
          .send("b", { ...message, text: "Changed request" })
          .pipe(Effect.flip);
        expect(changed.code).toBe("conflict");
        yield* b.peer.send("a", {
          id: "reply-1",
          text: "The backlog has been inspected.",
          replyTo: "request-1",
          originThreadId: ThreadId.make("boss-b"),
          createdAt: message.createdAt,
        });
        yield* b.peer.execute({ type: "sync", peerId: "a" });
        expect((yield* a.store.read()).messages.at(-1)?.threadId).toBe("boss-a");
        yield* b.stop;
        yield* a.peer.send("b", { ...message, id: "request-offline" });
        yield* a.peer.execute({ type: "sync", peerId: "b" }).pipe(Effect.flip);
        expect((yield* a.peer.list()).peers[0]?.pendingMessages).toBe(1);
      }),
    ),
);

it.effect("reopens the on-disk outbox after restart and retains operation identities", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const directory = yield* Effect.acquireRelease(
        Effect.sync(() =>
          NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-pitboss-restart-")),
        ),
        (path) => Effect.sync(() => NodeFS.rmSync(path, { recursive: true, force: true })),
      );
      const options = {
        dbPath: NodePath.join(directory, "state.sqlite"),
        secrets: new Map<string, Uint8Array>(),
      };
      const a = yield* startPeer("restart-a", options);
      const b = yield* startPeer("restart-b");
      const secret = "restart-only-shared-peer-credential-123456789";
      yield* a.peer.execute({
        type: "configure",
        config: {
          id: "b",
          environmentId: EnvironmentId.make("restart-b"),
          url: b.url,
          scope: "shared",
          enabled: true,
        },
        secret,
      });
      yield* b.peer.execute({
        type: "configure",
        config: {
          id: "a",
          environmentId: EnvironmentId.make("restart-a"),
          url: a.url,
          scope: "shared",
          enabled: true,
        },
        secret,
      });
      const message = {
        id: "before-restart",
        text: "Retain this obligation across a server restart",
        originThreadId: ThreadId.make("boss-a"),
        createdAt: "2026-09-10T00:00:00Z",
      };
      yield* a.peer.send("b", message);
      // The receipt is lost, then the sender shuts down including its database connection.
      yield* b.peer.receive(`Bearer ${secret}`, {
        environmentId: EnvironmentId.make("restart-a"),
        scope: "shared",
        view: (yield* a.peer.list()).peers[0]!.view,
        messages: [message],
      });
      yield* a.shutdown;
      const restarted = yield* startPeer("restart-a", options);
      yield* restarted.peer.execute({ type: "sync", peerId: "b" });
      expect((yield* restarted.peer.list()).peers[0]?.pendingMessages).toBe(0);
      expect(
        (yield* b.store.read()).messages.filter((entry) => entry.text.includes(message.text)),
      ).toHaveLength(1);
      const collision = yield* restarted.peer
        .send("b", { ...message, text: "Different operation" })
        .pipe(Effect.flip);
      expect(collision.code).toBe("conflict");
      yield* restarted.shutdown;
    }),
  ),
);
