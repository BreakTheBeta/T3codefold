import { expect, it } from "@effect/vitest";
import { RunAttemptId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { TurnPreamble } from "../orchestration-v2/ProviderTurnStartService.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as GladosPreamble from "./GladosPreamble.ts";

const gladosThreadId = ThreadId.make("glados");
const attemptId = RunAttemptId.make("attempt");

const preambleFor = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const preamble = yield* TurnPreamble;
    return yield* preamble.forAttempt(threadId, attemptId);
  });

const withSettings = (overrides: Parameters<typeof ServerSettings.layerTest>[0]) =>
  Effect.provide(GladosPreamble.layer.pipe(Layer.provide(ServerSettings.layerTest(overrides))));

it.effect("leads only the GLaDOS thread with its role and standing instructions", () =>
  Effect.gen(function* () {
    const glados = yield* preambleFor(gladosThreadId);
    expect(glados).toContain("You are GLaDOS");
    expect(glados).toContain("Standing instructions from the user:\nShip the billing fix first.");
    expect(yield* preambleFor(ThreadId.make("other"))).toBeNull();
  }).pipe(withSettings({ gladosThreadId, gladosInstructions: "Ship the billing fix first." })),
);

it.effect("adds no preamble when no thread is GLaDOS", () =>
  Effect.gen(function* () {
    expect(yield* preambleFor(gladosThreadId)).toBeNull();
  }).pipe(withSettings({})),
);

it.effect("omits the instructions section when there are none", () =>
  Effect.gen(function* () {
    expect(yield* preambleFor(gladosThreadId)).not.toContain("Standing instructions");
  }).pipe(withSettings({ gladosThreadId })),
);
