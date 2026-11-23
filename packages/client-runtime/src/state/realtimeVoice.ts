/**
 * Fold-only realtime voice (live Codex call) atoms. Clients create one set next to their
 * thread environment atoms and drive it from their voice workspace provider.
 */
import { WS_METHODS } from "@t3tools/contracts";
import type { Atom } from "effect/reactivity";
import * as Stream from "effect/Stream";

import type * as EnvironmentRegistry from "../connection/registry.ts";
import { emptyVoiceFeed, reduceVoiceFeed } from "../realtime-voice/feed.ts";
import {
  subscribe,
  subscribeCompanionVoiceEvents,
  type EnvironmentRpcInput,
} from "../rpc/client.ts";
import { createEnvironmentRpcCommand, createEnvironmentSubscriptionAtomFamily } from "./runtime.ts";

export function createRealtimeVoiceEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry.EnvironmentRegistry | R, E>,
) {
  return {
    startCompanion: createEnvironmentRpcCommand(runtime, {
      label: "voice:companion:start",
      tag: WS_METHODS.voiceCompanionStart,
    }),
    stopCompanion: createEnvironmentRpcCommand(runtime, {
      label: "voice:companion:stop",
      tag: WS_METHODS.voiceCompanionStop,
    }),
    selectCompanion: createEnvironmentRpcCommand(runtime, {
      label: "voice:companion:select",
      tag: WS_METHODS.voiceCompanionSelect,
    }),
    listCompanion: createEnvironmentRpcCommand(runtime, {
      label: "voice:companion:list",
      tag: WS_METHODS.voiceCompanionList,
    }),
    contextCompanion: createEnvironmentRpcCommand(runtime, {
      label: "voice:companion:context",
      tag: WS_METHODS.voiceCompanionContext,
    }),
    companionEvents: createEnvironmentSubscriptionAtomFamily(runtime, {
      label: "voice:companion:events",
      idleTtlMs: 0,
      subscribe: (input: EnvironmentRpcInput<typeof WS_METHODS.voiceCompanionEvents>) =>
        subscribeCompanionVoiceEvents(input).pipe(
          Stream.scan(() => emptyVoiceFeed, reduceVoiceFeed),
          Stream.groupedWithin(32, "100 millis"),
          Stream.map((feeds) => feeds.at(-1) ?? emptyVoiceFeed),
        ),
    }),
    /** The call's folded feed, published at most every 100ms so transcripts do not re-render per token. */
    realtimeVoiceEvents: createEnvironmentSubscriptionAtomFamily(runtime, {
      label: "voice:events",
      idleTtlMs: 0,
      subscribe: (input: EnvironmentRpcInput<typeof WS_METHODS.providerRealtimeVoiceEvents>) =>
        subscribe(WS_METHODS.providerRealtimeVoiceEvents, input).pipe(
          Stream.scan(() => emptyVoiceFeed, reduceVoiceFeed),
          Stream.groupedWithin(32, "100 millis"),
          Stream.map((feeds) => feeds[feeds.length - 1] ?? emptyVoiceFeed),
        ),
    }),
    listRealtimeVoices: createEnvironmentRpcCommand(runtime, {
      label: "voice:list",
      tag: WS_METHODS.providerRealtimeVoiceList,
    }),
    appendRealtimeVoiceContext: createEnvironmentRpcCommand(runtime, {
      label: "voice:context",
      tag: WS_METHODS.providerRealtimeVoiceContext,
    }),
    startRealtimeVoice: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:commands:thread:start-realtime-voice",
      tag: WS_METHODS.providerRealtimeVoiceStart,
    }),
    stopRealtimeVoice: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:commands:thread:stop-realtime-voice",
      tag: WS_METHODS.providerRealtimeVoiceStop,
    }),
  };
}
