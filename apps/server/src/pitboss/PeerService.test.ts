// @effect-diagnostics nodeBuiltinImport:off - real loopback HTTP servers are the integration boundary under test.
import * as NodeHttp from "node:http";
import { expect, it } from "@effect/vitest";
import {
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
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { ServerSecretStore } from "../auth/ServerSecretStore.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { WorkStore, layer as workLayer } from "./WorkStore.ts";
import { PeerService, layer as peerLayer } from "./PeerService.ts";
import { layer as routes } from "./PeerHttp.ts";

const startPeer = Effect.fn("startPeer")(function* (name: string) {
  const secrets = new Map<string, Uint8Array>();
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
  const database = Layer.fresh(SqlitePersistenceMemory);
  const work = workLayer;
  const services = peerLayer.pipe(
    Layer.provideMerge(work),
    Layer.provide(database),
    Layer.provide(identity),
    Layer.provide(secretLayer),
    Layer.provide(FetchHttpClient.layer),
  );
  const built = yield* Layer.build(services);
  const peer = Context.get(built, PeerService);
  const store = Context.get(built, WorkStore);
  const serverScope = yield* Scope.fork(yield* Scope.Scope);
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
        yield* a.stop;
        yield* b.peer.execute({ type: "sync", peerId: "a" }).pipe(Effect.flip);
        expect((yield* b.store.read()).sourceAuthorities?.[0]?.coordinator).toBe("env-a");
        yield* taskB.command({ type: "assign", taskId: taskB.taskId }).pipe(Effect.flip);
      }),
    ),
);
