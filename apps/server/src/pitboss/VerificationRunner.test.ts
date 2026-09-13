import { resolveAttachmentPathById } from "../attachmentStore.ts";
import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as DateTime from "effect/DateTime";
import * as Paths from "effect/Path";
import { ProjectId, type PitbossVerification } from "@t3tools/contracts";
import { ServerConfig, layerTest } from "../config.ts";
import { ProcessRunner, layer as processes } from "../processRunner.ts";
import { VerificationRunner, layer } from "./VerificationRunner.ts";

it.live(
  "runs a real committed app, catches integration and readiness failures, preserves evidence and isolates changes",
  () =>
    Effect.gen(function* () {
      const Fs = yield* FileSystem.FileSystem;
      const Path = yield* Paths.Path;
      const runner = yield* VerificationRunner;
      const process = yield* ProcessRunner;
      const config = yield* ServerConfig;
      const root = yield* Fs.makeTempDirectoryScoped({ prefix: "verification-fixture-" });
      const git = (args: string[]) => process.run({ command: "git", args, cwd: root });
      yield* git(["init", "--quiet"]);
      yield* Fs.writeFileString(Path.join(root, "app.cjs"), "exports.add = (a,b) => a+b;");
      yield* Fs.writeFileString(
        Path.join(root, "verify.cjs"),
        'const assert=require("node:assert/strict"); assert.equal(require("./app.cjs").add(2,3),5); require("node:fs").writeFileSync("proof.txt","2+3=5");',
      );
      yield* git(["add", "."]);
      yield* git([
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "-qm",
        "Fixture",
      ]);
      const sha = (yield* git(["rev-parse", "HEAD"])).stdout.trim();
      const verification: PitbossVerification = {
        id: "run",
        state: "running",
        candidate: `commit:${sha}`,
        attemptId: "attempt",
        criteriaVersion: 1,
        requestedAt: DateTime.formatIso(yield* DateTime.now),
        recipe: {
          projectId: ProjectId.make("project"),
          version: 1,
          name: "Combined app",
          doctor: "node --version",
          verify: "node verify.cjs",
          cleanup: "",
          timeoutSeconds: 10,
          artifacts: ["proof.txt"],
        },
      };
      const run = (patch: Partial<PitbossVerification["recipe"]> = {}) =>
        runner.run({
          root,
          threadId: "worker-fixture",
          verification: { ...verification, recipe: { ...verification.recipe, ...patch } },
        });
      const passed = yield* run();
      expect(passed.verdict).toBe("pass");
      expect(passed.checks.map((check) => check.code)).toEqual([0, 0]);
      expect(
        yield* Fs.readFileString(
          resolveAttachmentPathById({
            attachmentsDir: config.attachmentsDir,
            attachmentId: passed.artifacts[0]!.attachmentId,
          })!,
        ),
      ).toBe("2+3=5");
      expect((yield* git(["status", "--porcelain"])).stdout).toBe("");
      yield* Fs.writeFileString(Path.join(root, "app.cjs"), "exports.add = (a,b) => a-b;");
      yield* git(["add", "."]);
      yield* git([
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "-qm",
        "Break integration contract",
      ]);
      const brokenSha = (yield* git(["rev-parse", "HEAD"])).stdout.trim();
      const broken = yield* runner.run({
        root,
        threadId: "worker-fixture",
        verification: {
          ...verification,
          candidate: `commit:${brokenSha}`,
          recipe: { ...verification.recipe, artifacts: [] },
        },
      });
      expect(broken.verdict).toBe("fail");
      const missing = yield* run({ doctor: "node missing-dependency.cjs" });
      expect(missing.verdict).toBe("inconclusive");
      expect(missing.checks).toHaveLength(1);
      const dirty = yield* run({
        verify: "node -e \"require('node:fs').writeFileSync('app.cjs','changed')\"",
        artifacts: [],
      });
      expect(dirty.verdict).toBe("inconclusive");
      const timeout = yield* run({
        verify: 'node -e "for (;;) {}"',
        timeoutSeconds: 1,
        artifacts: [],
      });
      expect(timeout.verdict).toBe("inconclusive");
      expect(timeout.checks.at(-1)?.timedOut).toBe(true);
      const noArtifact = yield* run({ artifacts: ["missing.png"] });
      expect(noArtifact.verdict).toBe("inconclusive");
    }).pipe(
      Effect.provide(
        layer.pipe(
          Layer.provideMerge(processes),
          Layer.provideMerge(layerTest(process.cwd(), { prefix: "verification-config-" })),
          Layer.provideMerge(NodeServices.layer),
        ),
      ),
    ),
);
