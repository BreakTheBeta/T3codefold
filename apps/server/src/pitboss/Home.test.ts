// @effect-diagnostics nodeBuiltinImport:off - creates real temporary directories to exercise workspace normalization at the home boundary.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach } from "vite-plus/test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { WorkspacePaths, make as makeWorkspacePaths } from "../workspace/WorkspacePaths.ts";
import { expect, it } from "@effect/vitest";
import {
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  PitbossError,
  type PitbossSnapshot,
  type Project,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeHome } from "./Home.ts";
import { decide, emptyWork } from "./Work.ts";
import { WorkStore } from "./WorkStore.ts";
import { ProjectService } from "../project/ProjectService.ts";
import {
  ThreadLaunchService,
  ThreadLaunchError,
  type ThreadLaunchInput,
  type ThreadLaunchResult,
} from "../orchestration-v2/ThreadLaunchService.ts";
import { ThreadManagementService } from "../orchestration-v2/ThreadManagementService.ts";

const brief = {
  priorities: "Useful work",
  quality: "Verified",
  projectIds: [ProjectId.make("work")],
  maxWorkers: 2,
  maxAttempts: 2,
  workerModel: { instanceId: ProviderInstanceId.make("codex"), model: "fixture" },
  coordinatorRuntimeMode: "full-access" as const,
  workerRuntimeMode: "full-access" as const,
};
const rootsToClean: string[] = [];
afterEach(() => {
  for (const root of rootsToClean.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});
const harness = (initial: PitbossSnapshot = emptyWork) => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "glados-home-test-"));
  rootsToClean.push(root);
  let state = initial;
  let project: Project | undefined;
  let createdThread: ThreadId | undefined;
  let failLaunch = false;
  let failElection = false;
  let archived = false;
  const dispatched: string[] = [];
  const permissionModes: string[] = [];
  const launches: ThreadLaunchInput[] = [];
  const roots: string[] = [];
  const layers = Layer.mergeAll(
    NodeServices.layer,
    Layer.effect(WorkspacePaths, makeWorkspacePaths).pipe(Layer.provide(NodeServices.layer)),
    Layer.mock(WorkStore)({
      read: () => Effect.succeed(state),
      command: (command, actor) => {
        if (failElection) {
          failElection = false;
          return Effect.fail(
            new PitbossError({ code: "unavailable", message: "fixture election failure" }),
          );
        }
        return Effect.sync(() => {
          state = decide(state, command, actor, "2026-09-14T00:00:00Z");
          return state;
        });
      },
    }),
    Layer.mock(ProjectService)({
      bootstrap: (input) =>
        Effect.sync(() => {
          expect(NodeFS.statSync(input.workspaceRoot).isDirectory()).toBe(true);
          roots.push(input.workspaceRoot);
          const created = !project;
          project ??= { id: input.projectId, workspaceRoot: input.workspaceRoot } as Project;
          return { project, created };
        }),
    }),
    Layer.mock(ThreadManagementService)({
      getProjectThread: () =>
        Effect.succeed({
          thread: { archivedAt: archived ? "2026-09-14T00:00:00Z" : null },
        } as Effect.Success<ReturnType<ThreadManagementService["Service"]["getProjectThread"]>>),
      dispatch: (command) =>
        Effect.sync(() => {
          dispatched.push(command.type);
          if (command.type === "thread.runtime-mode.set") permissionModes.push(command.runtimeMode);
          if (command.type === "thread.unarchive") archived = false;
          return { sequence: 1, storedEvents: [] };
        }),
      listProjectThreads: () =>
        Effect.succeed(
          createdThread
            ? [
                { id: createdThread } as Effect.Success<
                  ReturnType<ThreadManagementService["Service"]["listProjectThreads"]>
                >[number],
              ]
            : [],
        ),
    }),
    Layer.mock(ThreadLaunchService)({
      launch: (input) => {
        launches.push(input);
        if (failLaunch) {
          failLaunch = false;
          return Effect.fail(
            new ThreadLaunchError({
              operation: "create-thread",
              commandId: input.commandId,
              projectId: input.projectId,
              cause: "Disk unavailable",
            }),
          );
        }
        createdThread = input.threadId;
        return Effect.succeed({ threadId: input.threadId! } as ThreadLaunchResult);
      },
    }),
  );
  return {
    root,
    layers,
    launches,
    roots,
    dispatched,
    permissionModes,
    archive: () => {
      archived = true;
    },
    failElection: () => {
      failElection = true;
    },
    fail: () => {
      failLaunch = true;
    },
    state: () => state,
  };
};
const input = (id = "open") => ({
  commandId: CommandId.make(id),
  expectedRevision: 0,
  action: { type: "activate-home" as const, brief },
});

it.effect(
  "provisions an environment-owned home with selected permissions and reopens idempotently",
  () => {
    const h = harness();
    return Effect.gen(function* () {
      const open = yield* makeHome(h.root);
      const created = yield* open(input());
      expect(created.role?.threadId).toBe("glados-home:glados-home");
      expect(h.roots).toEqual([NodePath.join(h.root, "glados")]);
      expect(h.launches[0]?.runtimeMode).toBe("full-access");
      expect(h.launches[0]?.initialMessage).toBeUndefined();
      expect(yield* open(input("again"))).toEqual(created);
      expect(h.launches).toHaveLength(1);
    }).pipe(Effect.provide(h.layers));
  },
);
it.effect("recovers provisioning failures using the same folder and thread identities", () => {
  const h = harness();
  h.fail();
  return Effect.gen(function* () {
    const open = yield* makeHome(h.root);
    const failed = yield* Effect.result(open(input()));
    expect(failed._tag).toBe("Failure");
    expect(h.state().role).toBeNull();
    const recovered = yield* open(input("retry"));
    expect(recovered.role).not.toBeNull();
    expect(h.roots).toEqual([NodePath.join(h.root, "glados"), NodePath.join(h.root, "glados")]);
    expect(h.launches[0]?.threadId).toBe(h.launches[1]?.threadId);
  }).pipe(Effect.provide(h.layers));
});
it.effect(
  "preserves an existing role, brief and all work without provisioning or changing permissions",
  () => {
    const prior = {
      ...emptyWork,
      revision: 7,
      role: {
        threadId: ThreadId.make("existing"),
        projectId: ProjectId.make("repository"),
        generation: 4,
        paused: true,
        brief: { ...brief, workerRuntimeMode: "approval-required" as const },
      },
    };
    const h = harness(prior);
    return Effect.gen(function* () {
      const open = yield* makeHome(h.root);
      expect(yield* open(input())).toBe(prior);
      expect(h.roots).toEqual([]);
      expect(h.launches).toEqual([]);
    }).pipe(Effect.provide(h.layers));
  },
);
it.effect("serializes concurrent home creation without duplicate threads", () => {
  const h = harness();
  return Effect.gen(function* () {
    const open = yield* makeHome(h.root);
    const results = yield* Effect.all([open(input("one")), open(input("two"))], { concurrency: 2 });
    expect(results[0]).toEqual(results[1]);
    expect(h.launches).toHaveLength(1);
  }).pipe(Effect.provide(h.layers));
});

it.effect("reopens an archived election without changing its authority", () => {
  const h = harness();
  return Effect.gen(function* () {
    const open = yield* makeHome(h.root);
    const state = yield* open(input());
    h.archive();
    expect(yield* open(input("restore"))).toEqual(state);
    expect(h.dispatched).toContain("thread.unarchive");
    expect(h.launches).toHaveLength(1);
  }).pipe(Effect.provide(h.layers));
});
it.effect("recovers a failed election with changed permissions on the retained home thread", () => {
  const h = harness();
  h.failElection();
  return Effect.gen(function* () {
    const open = yield* makeHome(h.root);
    expect((yield* Effect.result(open(input())))._tag).toBe("Failure");
    const retry = {
      ...input("retry"),
      action: {
        type: "activate-home" as const,
        brief: { ...brief, coordinatorRuntimeMode: "approval-required" as const },
      },
    };
    const state = yield* open(retry);
    expect(h.launches).toHaveLength(1);
    expect(h.permissionModes).toEqual(["approval-required"]);
    expect(state.role?.brief.coordinatorRuntimeMode).toBe("approval-required");
  }).pipe(Effect.provide(h.layers));
});

it.effect("creates a home with no project authority in a fresh environment", () => {
  const h = harness();
  return Effect.gen(function* () {
    const open = yield* makeHome(h.root);
    const state = yield* open({
      ...input(),
      action: { type: "activate-home", brief: { ...brief, projectIds: [] } },
    });
    expect(state.role?.brief.projectIds).toEqual([]);
    expect(h.launches).toHaveLength(1);
  }).pipe(Effect.provide(h.layers));
});
