import { expect, it } from "@effect/vitest";
import { CommandId } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import {
  ProjectionProject,
  ProjectionProjectRepository,
} from "../persistence/Services/ProjectionProjects.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { WorkStore, layer as storeLayer } from "./WorkStore.ts";
import { VerificationRunner } from "./VerificationRunner.ts";
import { layer as runtime } from "./VerificationRuntime.ts";
import { fixture } from "./Verification.testkit.ts";
import { interruptedReceipt } from "./Verification.ts";

const decodeProject = Schema.decodeUnknownEffect(ProjectionProject);
for (const interrupted of [false, true])
  it.effect(
    interrupted
      ? "restart records inconclusive without rerunning a started command"
      : "pause keeps checks queued and resume runs once with durable completion",
    () =>
      Effect.gen(function* () {
        const store = yield* WorkStore;
        const sql = yield* SqlClient.SqlClient;
        const f = fixture();
        f.act({
          type: "verify",
          taskId: "task",
          evidenceId: f.state.tasks[0]!.evidence.at(-1)!.id,
        });
        for (const [index, entry] of f.history.entries())
          yield* sql`INSERT INTO pitboss_events (operation_id, request_json, payload_json, created_at) VALUES (${`seed-${index}`}, 'seed', ${entry}, '2026-09-13T00:00:00Z')`;
        yield* store.rebuild();
        if (interrupted)
          yield* store.recordVerification("task", {
            ...f.state.tasks[0]!.verification!,
            state: "running",
          });
        else
          yield* store.command(
            {
              commandId: CommandId.make("pause"),
              expectedRevision: (yield* store.read()).revision,
              action: { type: "pause", paused: true },
            },
            { type: "user" },
          );
        let calls = 0;
        const project = yield* decodeProject({
          projectId: "project",
          title: "Fixture",
          workspaceRoot: "/fixture",
          defaultModelSelection: null,
          defaultThreadEnvMode: null,
          autoPull: false,
          scripts: [],
          createdAt: "2026-09-13T00:00:00Z",
          updatedAt: "2026-09-13T00:00:00Z",
          deletedAt: null,
        });
        yield* Layer.build(
          runtime.pipe(
            Layer.provide(
              Layer.mergeAll(
                Layer.succeed(WorkStore, store),
                Layer.mock(ProjectionProjectRepository, {
                  getById: () => Effect.succeed(Option.some(project)),
                }),
                Layer.succeed(VerificationRunner, {
                  run: () =>
                    Effect.sync(() => {
                      calls++;
                      return { ...interruptedReceipt("Captured"), verdict: "pass" as const };
                    }),
                }),
              ),
            ),
          ),
        );
        if (!interrupted) {
          expect((yield* store.read()).tasks[0]!.verification!.state).toBe("pending");
          expect(calls).toBe(0);
          yield* store.command(
            {
              commandId: CommandId.make("resume"),
              expectedRevision: (yield* store.read()).revision,
              action: { type: "pause", paused: false },
            },
            { type: "user" },
          );
        }
        const completed = yield* store.subscribe().pipe(
          Stream.filter((state) => state.tasks[0]!.verification?.state === "completed"),
          Stream.runHead,
        );
        expect(Option.isSome(completed)).toBe(true);
        expect(calls).toBe(interrupted ? 0 : 1);
        expect((yield* store.read()).tasks[0]!.verification!.receipt?.verdict).toBe(
          interrupted ? "inconclusive" : "pass",
        );
        expect(yield* store.rebuild()).toEqual(yield* store.read());
      }).pipe(
        Effect.provide(
          storeLayer.pipe(
            Layer.provideMerge(SqlitePersistenceMemory),
            Layer.provideMerge(NodeServices.layer),
          ),
        ),
      ),
  );
