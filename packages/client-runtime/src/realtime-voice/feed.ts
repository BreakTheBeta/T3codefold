import type { ProviderRealtimeVoiceEvent } from "@t3tools/contracts";

export type VoiceTranscript = { id: number; role: "user" | "assistant"; text: string };
export type VoiceFeed = {
  callId: string;
  sequence: number;
  error: string | null;
  phase: "idle" | "live" | "closed" | "error";
  partial: { user: string; assistant: string };
  transcripts: ReadonlyArray<VoiceTranscript>;
  lastEvent: ProviderRealtimeVoiceEvent | null;
};
export const emptyVoiceFeed: VoiceFeed = {
  callId: "",
  sequence: 0,
  error: null,
  phase: "idle",
  partial: { user: "", assistant: "" },
  transcripts: [],
  lastEvent: null,
};
/** Keep final speech distinct from the coding agent's accepted messages. */
export function reduceVoiceFeed(previous: VoiceFeed, event: ProviderRealtimeVoiceEvent): VoiceFeed {
  const state =
    previous.callId === event.callId ? previous : { ...emptyVoiceFeed, callId: event.callId };
  if (event.sequence <= state.sequence) return state;
  const next = { ...state, sequence: event.sequence, lastEvent: event };
  if (event.type !== "transcript")
    return {
      ...next,
      phase: event.type === "started" ? "live" : event.type,
      error: event.type === "error" ? (event.text ?? "Voice failed") : state.error,
    };
  if (!event.role) return next;
  const text = event.text ?? "";
  if (!event.final)
    return {
      ...next,
      partial: { ...state.partial, [event.role]: (state.partial[event.role] + text).slice(-8192) },
    };
  return {
    ...next,
    partial: { ...state.partial, [event.role]: "" },
    transcripts: text.trim()
      ? [...state.transcripts, { id: event.sequence, role: event.role, text }].slice(-40)
      : state.transcripts,
  };
}
/** Only explicit call-control utterances act locally; "stop" alone is ambiguous. */
export function parseVoiceCommand(
  text: string,
): { type: "end" } | { type: "switch"; title: string } | null {
  const normalized = text
    .trim()
    .replace(/[.!?]+$/, "")
    .trim();
  if (
    /^(?:please )?(?:end|hang up|stop) (?:the |this |my )?voice call(?: please)?$/i.test(normalized)
  )
    return { type: "end" };
  const match = /^(?:please )?switch (?:the )?voice to (.{1,160}?)(?: please)?$/i.exec(normalized);
  return match?.[1] ? { type: "switch", title: match[1].trim() } : null;
}
