import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import * as NodeCrypto from "node:crypto";
import {
  EnvironmentId,
  PitbossError,
  PitbossPeerConfig,
  PitbossPeerEnvelope,
  PitbossCoordinationView,
  type PitbossPeerCommand,
  type PitbossPeerList,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { ServerSecretStore } from "../auth/ServerSecretStore.ts";
import { WorkStore } from "./WorkStore.ts";
import { hasUnresolvedWriter } from "./Work.ts";
import {
  agreedCoordinator,
  approveCoordination,
  emptyCoordination,
  reconcileCoordination,
} from "./Coordination.ts";

const isPitbossError = Schema.is(PitbossError);
const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const decodeViewValue = Schema.decodeUnknownEffect(PitbossCoordinationView);
const decodeEnvelope = Schema.decodeUnknownEffect(PitbossPeerEnvelope);
const decodeConfig = Schema.decodeUnknownEffect(Schema.fromJsonString(PitbossPeerConfig));
const decodeView = Schema.decodeUnknownEffect(Schema.fromJsonString(PitbossCoordinationView));
const failure = (cause: unknown) =>
  isPitbossError(cause)
    ? cause
    : new PitbossError({
        code: "unavailable",
        message: cause instanceof Error ? cause.message : "Peer unavailable.",
      });
export class PeerService extends Context.Service<
  PeerService,
  {
    list: () => Effect.Effect<PitbossPeerList, PitbossError>;
    execute: (input: PitbossPeerCommand) => Effect.Effect<PitbossPeerList, PitbossError>;
    receive: (
      authorization: string,
      input: PitbossPeerEnvelope,
    ) => Effect.Effect<PitbossPeerEnvelope, PitbossError>;
  }
>()("t3/pitboss/PeerService") {}
export const layer = Layer.effect(
  PeerService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const httpClient = yield* HttpClient.HttpClient;
    const secrets = yield* ServerSecretStore;
    const self = yield* (yield* ServerEnvironment).getEnvironmentId;
    const store = yield* WorkStore;
    const list = Effect.fn("PeerService.list")(function* () {
      const rows = yield* sql<{
        config_json: string;
        view_json: string;
        last_seen_at: string | null;
        error: string | null;
      }>`SELECT config_json, view_json, last_seen_at, error FROM pitboss_peers ORDER BY id`;
      return {
        environmentId: self,
        peers: yield* Effect.forEach(rows, (row) =>
          Effect.gen(function* () {
            return {
              config: yield* decodeConfig(row.config_json),
              view: yield* decodeView(row.view_json),
              lastSeenAt: row.last_seen_at,
              error: row.error,
            };
          }),
        ),
      };
    }, Effect.mapError(failure));
    const find = Effect.fn("PeerService.find")(function* (id: string) {
      const peer = (yield* list()).peers.find((entry) => entry.config.id === id);
      if (!peer)
        return yield* new PitbossError({ code: "invalid", message: "Peer not configured." });
      return peer;
    });
    const save = Effect.fn("PeerService.save")(function* (
      id: string,
      view: typeof PitbossCoordinationView.Type,
    ) {
      const peer = yield* find(id);
      const coordinator = agreedCoordinator(view, peer.config.scope);
      // Fence new local assignments before publishing our approval to a peer.
      yield* store.setSourceAuthority({
        scope: peer.config.scope,
        self,
        peerId: peer.config.id,
        peerEnvironmentId: peer.config.environmentId,
        coordinator: coordinator ? EnvironmentId.make(coordinator) : null,
      });
      yield* sql`UPDATE pitboss_peers SET view_json = ${json(view)} WHERE id = ${id}`;
    });
    const merge = Effect.fn("PeerService.merge")(function* (
      id: string,
      input: PitbossPeerEnvelope,
    ) {
      const peer = yield* find(id);
      if (
        !peer.config.enabled ||
        input.environmentId !== peer.config.environmentId ||
        input.scope !== peer.config.scope ||
        input.view.proposals.some(
          (proposal) =>
            proposal.scope !== peer.config.scope ||
            proposal.participants.length !== 2 ||
            !proposal.participants.includes(self) ||
            !proposal.participants.includes(input.environmentId),
        )
      ) {
        return yield* new PitbossError({
          code: "forbidden",
          message: "Peer identity or shared scope does not match the local grant.",
        });
      }
      const view = yield* Effect.try({
        try: () => reconcileCoordination(peer.view, input.view, input.environmentId),
        catch: failure,
      });
      const decoded = yield* decodeViewValue(view);
      yield* save(id, decoded);
      const now = DateTime.formatIso(yield* DateTime.now);
      yield* sql`UPDATE pitboss_peers SET last_seen_at = ${now}, error = NULL WHERE id = ${id}`;
    }, sql.withTransaction);
    const sync = Effect.fn("PeerService.sync")(function* (id: string) {
      const peer = yield* find(id);
      if (!peer.config.enabled) return;
      const secret = yield* secrets.get(`pitboss-peer-${id}`);
      if (Option.isNone(secret))
        return yield* new PitbossError({
          code: "invalid",
          message: "Configure a shared peer credential.",
        });
      const response = yield* httpClient
        .execute(
          HttpClientRequest.post(new URL("/api/pitboss/peer", peer.config.url).href).pipe(
            HttpClientRequest.setHeader(
              "Authorization",
              `Bearer ${new TextDecoder().decode(secret.value)}`,
            ),
            HttpClientRequest.bodyJsonUnsafe({
              environmentId: self,
              scope: peer.config.scope,
              view: peer.view,
            }),
          ),
        )
        .pipe(
          Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
          Effect.timeout("10 seconds"),
        );
      if (response.status !== 200)
        return yield* new PitbossError({
          code: "unavailable",
          message: `Peer returned HTTP ${response.status}. Existing authority is retained; no failover occurred.`,
        });
      yield* merge(id, yield* decodeEnvelope(yield* response.json));
    }, Effect.mapError(failure));
    const execute = Effect.fn("PeerService.execute")(function* (input: PitbossPeerCommand) {
      if (input.type === "sync") {
        yield* sync(input.peerId);
        return yield* list();
      }
      return yield* sql.withTransaction(
        Effect.gen(function* () {
          if (input.type === "configure") {
            const config = input.config;
            if (!/^[a-zA-Z0-9_-]{1,80}$/.test(config.id) || config.environmentId === self)
              return yield* new PitbossError({
                code: "invalid",
                message: "Use a distinct peer environment and a short connection ID.",
              });
            const endpoint = yield* Effect.try({ try: () => new URL(config.url), catch: failure });
            if (
              !["http:", "https:"].includes(endpoint.protocol) ||
              endpoint.username ||
              endpoint.password
            )
              return yield* new PitbossError({
                code: "invalid",
                message: "Use an HTTP(S) peer URL without embedded credentials.",
              });
            const peers = (yield* list()).peers;
            if (
              peers.some(
                (peer) => peer.config.id !== config.id && peer.config.scope === config.scope,
              )
            )
              return yield* new PitbossError({
                code: "conflict",
                message: "This pilot supports one paired peer per shared source scope.",
              });
            const existing = peers.find((peer) => peer.config.id === config.id);
            if (
              existing &&
              (existing.config.scope !== config.scope ||
                existing.config.environmentId !== config.environmentId)
            )
              return yield* new PitbossError({
                code: "conflict",
                message: "Create a new connection ID when changing peer identity or scope.",
              });
            const state = yield* store.read();
            if (
              state.tasks.some(
                (task) => task.source?.scope === config.scope && hasUnresolvedWriter(task),
              )
            )
              return yield* new PitbossError({
                code: "conflict",
                message: "Resolve existing writers before configuring shared ownership.",
              });
            if (input.secret)
              yield* secrets.set(
                `pitboss-peer-${config.id}`,
                new TextEncoder().encode(input.secret),
              );
            yield* store.setSourceAuthority({
              scope: config.scope,
              self,
              peerId: config.id,
              peerEnvironmentId: config.environmentId,
              coordinator: null,
            });
            yield* sql`INSERT INTO pitboss_peers (id, config_json, view_json) VALUES (${config.id}, ${json(config)}, ${json(emptyCoordination)}) ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json`;
          } else {
            const peer = yield* find(input.peerId);
            if (!peer.config.enabled)
              return yield* new PitbossError({
                code: "invalid",
                message: "Enable the peer before proposing or approving shared coordination.",
              });
            if (input.type === "propose") {
              const proposal = input.proposal;
              if (
                proposal.scope !== peer.config.scope ||
                !proposal.participants.includes(self) ||
                !proposal.participants.includes(peer.config.environmentId)
              )
                return yield* new PitbossError({
                  code: "forbidden",
                  message: "Proposal must match the enrolled peer and scope.",
                });
              if (peer.view.proposals.length >= 100)
                return yield* new PitbossError({
                  code: "invalid",
                  message: "The pilot supports 100 proposals per connection.",
                });
              const existing = peer.view.proposals.find((entry) => entry.id === proposal.id);
              if (existing && json(existing) !== json(proposal))
                return yield* new PitbossError({
                  code: "conflict",
                  message: "Proposal ID already used.",
                });
              if (!existing)
                yield* save(input.peerId, {
                  ...peer.view,
                  proposals: [...peer.view.proposals, proposal],
                  versions: { ...peer.view.versions, [self]: (peer.view.versions[self] ?? 0) + 1 },
                });
            } else {
              const state = yield* store.read();
              const view = yield* Effect.try({
                try: () =>
                  approveCoordination(
                    peer.view,
                    input.proposalId,
                    self,
                    state.tasks.some(
                      (task) =>
                        task.source?.scope === peer.config.scope && hasUnresolvedWriter(task),
                    ),
                  ),
                catch: failure,
              });
              yield* save(input.peerId, yield* decodeViewValue(view));
            }
          }
          return yield* list();
        }),
      );
    }, Effect.mapError(failure));
    const receive = Effect.fn("PeerService.receive")(function* (
      authorization: string,
      input: PitbossPeerEnvelope,
    ) {
      const peer = (yield* list()).peers.find(
        (entry) =>
          entry.config.environmentId === input.environmentId && entry.config.scope === input.scope,
      );
      if (!peer)
        return yield* new PitbossError({
          code: "forbidden",
          message: "Peer is not enrolled for this scope.",
        });
      const expected = yield* secrets.get(`pitboss-peer-${peer.config.id}`);
      const supplied = new TextEncoder().encode(authorization.replace(/^Bearer /, ""));
      if (
        Option.isNone(expected) ||
        supplied.length !== expected.value.length ||
        !NodeCrypto.timingSafeEqual(supplied, expected.value)
      )
        return yield* new PitbossError({
          code: "forbidden",
          message: "Peer credential is invalid.",
        });
      yield* merge(peer.config.id, input);
      return { environmentId: self, scope: input.scope, view: (yield* find(peer.config.id)).view };
    }, Effect.mapError(failure));
    yield* Effect.gen(function* () {
      for (const peer of (yield* list()).peers.filter((entry) => entry.config.enabled)) {
        yield* sync(peer.config.id).pipe(
          Effect.catch((error) =>
            sql`UPDATE pitboss_peers SET error = ${error.message} WHERE id = ${peer.config.id}`.pipe(
              Effect.asVoid,
            ),
          ),
        );
      }
    }).pipe(Effect.repeat(Schedule.spaced("15 seconds")), Effect.forkScoped);
    return PeerService.of({ list, execute, receive });
  }),
);
