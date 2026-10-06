import { createRealtimeVoiceEnvironmentAtoms } from "@t3tools/client-runtime/state/realtime-voice";

import { connectionAtomRuntime } from "../connection/runtime";

/** Live Codex voice call atoms, driven by VoiceWorkspaceProvider. */
export const realtimeVoiceEnvironment = createRealtimeVoiceEnvironmentAtoms(connectionAtomRuntime);
