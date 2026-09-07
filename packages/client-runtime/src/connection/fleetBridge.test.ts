import {
  EnvironmentId,
  type FleetEnvironment,
  type FleetInvocation,
  type FleetResponse,
  OrchestratorMcpFailure,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { connectFleetLease, relayFleetInvocations } from "./fleetBridge.ts";

const invocation = (
  requestId: string,
  operation: "t3_thread_wait" | "t3_thread_send" = "t3_thread_send",
): FleetInvocation => ({
  requestId,
  request: {
    source: { environmentId: EnvironmentId.make("source"), threadId: null },
    environmentId: EnvironmentId.make("target"),
    operation,
    input: { clientRequestId: requestId },
  },
});

describe("fleet client relay", () => {
  it.effect("a waiting thread does not block sending to another thread", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const sent = yield* Deferred.make<void>();
      const replies: FleetResponse[] = [];
      const fiber = yield* relayFleetInvocations(
        Stream.make(invocation("wait", "t3_thread_wait"), invocation("send")),
        (request) =>
          request.operation === "t3_thread_wait"
            ? Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(release)))
            : Deferred.await(started).pipe(Effect.as({ accepted: true })),
        (response) =>
          Effect.sync(() => replies.push(response)).pipe(
            Effect.andThen(
              response.requestId === "send" ? Deferred.succeed(sent, undefined) : Effect.void,
            ),
          ),
      ).pipe(Effect.forkChild);
      yield* Deferred.await(sent);
      expect(replies.map((response) => response.requestId)).toEqual(["send"]);
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(fiber);
      expect(replies.map((response) => response.requestId)).toEqual(["send", "wait"]);
    }),
  );

  it.effect("preserves native destination failures", () =>
    Effect.gen(function* () {
      const replies: FleetResponse[] = [];
      const error = new OrchestratorMcpFailure({
        code: "thread_not_found",
        message: "Thread not found",
      });
      yield* relayFleetInvocations(
        Stream.make(invocation("missing")),
        () => Effect.fail(error),
        (response) => Effect.sync(() => replies.push(response)),
      );
      expect(replies[0]?.result).toEqual({ ok: false, error });
    }),
  );

  it.effect("does not replay an accepted mutation when its source reply fails", () =>
    Effect.gen(function* () {
      let executions = 0;
      const result = yield* relayFleetInvocations(
        Stream.make(invocation("stable-native-request-id")),
        () =>
          Effect.sync(() => {
            executions++;
            return { accepted: true };
          }),
        () =>
          Effect.fail(
            new OrchestratorMcpFailure({
              code: "orchestration_error",
              message: "source connection closed",
            }),
          ),
      ).pipe(Effect.exit);
      expect(result._tag).toBe("Failure");
      expect(executions).toBe(1);
    }),
  );

  it.effect("cancels proxy work when its source lease closes", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const canceled = yield* Deferred.make<void>();
      let replies = 0;
      const fiber = yield* relayFleetInvocations(
        Stream.make(invocation("waiting", "t3_thread_wait")),
        () =>
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(Deferred.succeed(canceled, undefined)),
          ),
        () =>
          Effect.sync(() => {
            replies++;
          }),
      ).pipe(Effect.forkChild);
      yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
      yield* Deferred.await(canceled);
      expect(replies).toBe(0);
    }),
  );
});

describe("fleet source lease", () => {
  it.effect("does not send fleet RPCs to an older server", () =>
    Effect.gen(function* () {
      const descriptors = yield* SubscriptionRef.make<ReadonlyArray<FleetEnvironment>>([]);
      let connections = 0;
      yield* connectFleetLease({
        supported: false,
        descriptors,
        connect: () => {
          connections++;
          return Stream.empty;
        },
        execute: () => Effect.void,
        respond: () => Effect.void,
      }).pipe(Stream.runDrain);
      expect(connections).toBe(0);
    }),
  );

  it.effect("replaces the lease when a target disconnects and cancels outstanding proxy work", () =>
    Effect.gen(function* () {
      const target = { environmentId: EnvironmentId.make("target"), label: "Remote host" };
      const descriptors = yield* SubscriptionRef.make<ReadonlyArray<typeof target>>([target]);
      const started = yield* Deferred.make<void>();
      const canceled = yield* Deferred.make<void>();
      const reconnected = yield* Deferred.make<void>();
      const advertised: ReadonlyArray<typeof target>[] = [];
      const fiber = yield* connectFleetLease({
        supported: true,
        descriptors,
        connect: (environments) => {
          advertised.push(environments);
          return environments.length > 0
            ? Stream.make(invocation("waiting", "t3_thread_wait"))
            : Stream.fromEffect(Deferred.succeed(reconnected, undefined)).pipe(Stream.drain);
        },
        execute: () =>
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(Deferred.succeed(canceled, undefined)),
          ),
        respond: () => Effect.die("A retired lease must not receive a response"),
      }).pipe(Stream.runDrain, Effect.forkChild);
      yield* Deferred.await(started);
      yield* SubscriptionRef.set(descriptors, []);
      yield* Deferred.await(reconnected);
      yield* Deferred.await(canceled);
      expect(advertised).toEqual([[target], []]);
      yield* Fiber.interrupt(fiber);
    }),
  );
});

it.effect("keeps ordinary operations moving after the wait lane fills", () =>
  Effect.gen(function* () {
    const fourStarted = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const sent = yield* Deferred.make<void>();
    let activeWaits = 0;
    let peakWaits = 0;
    const requests = [
      ...Array.from({ length: 12 }, (_, i) => invocation(`wait-${i}`, "t3_thread_wait")),
      invocation("send"),
    ];
    const fiber = yield* relayFleetInvocations(
      Stream.fromIterable(requests),
      (request) =>
        request.operation === "t3_thread_wait"
          ? Effect.gen(function* () {
              activeWaits++;
              peakWaits = Math.max(peakWaits, activeWaits);
              if (activeWaits === 4) yield* Deferred.succeed(fourStarted, undefined);
              yield* Deferred.await(release);
              activeWaits--;
            })
          : Deferred.await(fourStarted).pipe(Effect.as("sent")),
      (response) =>
        response.requestId === "send" ? Deferred.succeed(sent, undefined) : Effect.void,
    ).pipe(Effect.forkChild);
    yield* Deferred.await(sent);
    expect(activeWaits).toBe(4);
    yield* Deferred.succeed(release, undefined);
    yield* Fiber.join(fiber);
    expect(peakWaits).toBe(4);
  }),
);
