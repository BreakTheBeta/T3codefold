import { T, useGT, useMessages } from "gt-react";
import { m } from "../../i18n/messages";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingsRow, SettingsSection } from "../settings/settingsLayout";
import { useEnvironmentProviders } from "../../state/environments";
import { withDefaultVoiceKeybindings } from "@t3tools/shared/keybindings";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { resolveShortcutCommand } from "../../keybindings";
import { randomUUID } from "../../lib/utils";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult, Atom } from "effect/reactivity";
import {
  VoiceWorkspace,
  voiceStartInput,
  BASIC_VOICE_NOTICE,
  type VoicePreferences,
} from "@t3tools/client-runtime/realtime-voice/workspace";
import { emptyVoiceFeed } from "@t3tools/client-runtime/realtime-voice/feed";
import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { createRealtimeVoiceEnvironmentAtoms } from "@t3tools/client-runtime/state/realtime-voice";
import { connectionAtomRuntime } from "../../connection/runtime";
import { useAtomCommand } from "../../state/use-atom-command";
import { useThreadShells, useServerConfigs } from "../../state/entities";
import { openWebVoiceMedia } from "../../hooks/codexVoiceMedia";

const realtimeVoiceEnvironment = createRealtimeVoiceEnvironmentAtoms(connectionAtomRuntime);
const VoiceContext = createContext<VoiceWorkspace | null>(null);
const emptyFeedAtom = Atom.make(AsyncResult.success(emptyVoiceFeed));
const preferenceKey = "fold.liveVoice.preferences";
function readPreferences(): Partial<VoicePreferences> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(preferenceKey) ?? "{}");
    if (!raw || typeof raw !== "object") return {};
    return {
      voice: "voice" in raw && typeof raw.voice === "string" ? raw.voice : "",
      microphoneId:
        "microphoneId" in raw && typeof raw.microphoneId === "string" ? raw.microphoneId : "",
      outputMuted: "outputMuted" in raw && raw.outputMuted === true,
      shareContext: "shareContext" in raw && raw.shareContext === true,
    };
  } catch {
    return {};
  }
}
function unwrap<A, E>(result: AtomCommandResult<A, E>): A {
  if (result._tag === "Success") return result.value;
  throw squashAtomCommandFailure(result);
}
export function useOptionalVoiceWorkspace() {
  return useContext(VoiceContext);
}
export function useVoiceWorkspace() {
  const workspace = useContext(VoiceContext);
  if (!workspace) throw new Error("Voice workspace is not mounted");
  const state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
  return { workspace, state };
}
export function VoiceWorkspaceProvider({ children }: { children: ReactNode }) {
  const startCompanion = useAtomCommand(realtimeVoiceEnvironment.startCompanion, {
    reportFailure: false,
  });
  const stopCompanion = useAtomCommand(realtimeVoiceEnvironment.stopCompanion, {
    reportFailure: false,
  });
  const selectCompanion = useAtomCommand(realtimeVoiceEnvironment.selectCompanion, {
    reportFailure: false,
  });
  const listCompanion = useAtomCommand(realtimeVoiceEnvironment.listCompanion, {
    reportFailure: false,
  });
  const contextCompanion = useAtomCommand(realtimeVoiceEnvironment.contextCompanion, {
    reportFailure: false,
  });
  const start = useAtomCommand(realtimeVoiceEnvironment.startRealtimeVoice, {
    reportFailure: false,
  });
  const stop = useAtomCommand(realtimeVoiceEnvironment.stopRealtimeVoice, { reportFailure: false });
  const list = useAtomCommand(realtimeVoiceEnvironment.listRealtimeVoices, {
    reportFailure: false,
  });
  const context = useAtomCommand(realtimeVoiceEnvironment.appendRealtimeVoiceContext, {
    reportFailure: false,
  });
  const [workspace] = useState(
    () =>
      new VoiceWorkspace(
        {
          resolve: m,
          createCallId: randomUUID,
          openMedia: openWebVoiceMedia,
          startRemote: async (target, sdp, callId, voice) =>
            unwrap(
              await (target.companion
                ? startCompanion({
                    environmentId: target.environmentId,
                    input: { threadId: target.threadId, sdp, callId, ...(voice ? { voice } : {}) },
                  })
                : start({
                    environmentId: target.environmentId,
                    input: voiceStartInput(target, sdp, callId, voice),
                  })),
            ).sdp,
          switchRemote: async (_current, target, callId) => {
            unwrap(
              await selectCompanion({
                environmentId: target.environmentId,
                input: { threadId: target.threadId, callId },
              }),
            );
          },
          stopRemote: async (target, callId) => {
            if (target.companion && callId) {
              unwrap(
                await stopCompanion({
                  environmentId: target.environmentId,
                  input: { threadId: target.threadId, callId },
                }),
              );
              return;
            }
            unwrap(
              await stop({
                environmentId: target.environmentId,
                input: { threadId: target.threadId },
              }),
            );
          },
          listVoices: async (target) =>
            unwrap(
              await (target.companion ? listCompanion : list)({
                environmentId: target.environmentId,
                input: { threadId: target.threadId },
              }),
            ),
          appendContext: async (target, callId, text) => {
            unwrap(
              await (target.companion ? contextCompanion : context)({
                environmentId: target.environmentId,
                input: { threadId: target.threadId, callId, text },
              }),
            );
          },
          savePreferences: (preferences) => {
            try {
              localStorage.setItem(preferenceKey, JSON.stringify(preferences));
            } catch {
              /* Storage can be unavailable in private browsing. */
            }
          },
        },
        readPreferences(),
      ),
  );
  const serverKeybindings = useAtomValue(primaryServerKeybindingsAtom);
  const keybindings = withDefaultVoiceKeybindings(serverKeybindings);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the window keyboard listener in step with the workspace and configured shortcuts
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const command = resolveShortcutCommand(event, keybindings, {
        context: { terminalFocus: Boolean((event.target as Element | null)?.closest?.(".xterm")) },
      });
      if (command !== "voice.toggle" && command !== "voice.mute" && command !== "voice.outputMute")
        return;
      event.preventDefault();
      runVoiceAction(workspace, command);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [workspace, keybindings]);
  const state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
  const shells = useThreadShells();
  const configs = useServerConfigs();
  const providersByEnvironment = useEnvironmentProviders();
  const targets = shells
    .filter(
      (shell) =>
        !shell.archivedAt &&
        !shell.deletedAt &&
        providersByEnvironment
          .get(shell.environmentId)
          ?.some(
            (provider) =>
              provider.driver === "codex" &&
              (configs.get(shell.environmentId)?.environment.capabilities.voiceCompanion === true
                ? provider.enabled &&
                  provider.installed &&
                  provider.auth.status === "authenticated" &&
                  provider.auth.type === "chatgpt"
                : provider.instanceId === shell.providerInstanceId),
          ),
    )
    .map((shell) => ({
      environmentId: shell.environmentId,
      threadId: shell.id,
      title: shell.title,
      companion: configs.get(shell.environmentId)?.environment.capabilities.voiceCompanion === true,
      enhancedVoice:
        configs.get(shell.environmentId)?.environment.capabilities.realtimeVoiceControls === true,
    }));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the imperative voice workspace target registry in step with connected threads and providers
  useEffect(() => workspace.setTargets(targets), [workspace, targets]);
  const subscriptionCallId = state.callId;
  const subscription = useAtomValue(
    state.callTarget &&
      workspace.hasVoiceEvents &&
      state.voice.status !== "idle" &&
      state.voice.status !== "error"
      ? state.callTarget.companion
        ? realtimeVoiceEnvironment.companionEvents({
            environmentId: state.callTarget.environmentId,
            input: { threadId: state.callTarget.threadId, callId: subscriptionCallId },
          })
        : realtimeVoiceEnvironment.realtimeVoiceEvents({
            environmentId: state.callTarget.environmentId,
            input: { threadId: state.callTarget.threadId },
          })
      : emptyFeedAtom,
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- delivers subscribed call events and failures to the imperative voice workspace
  useEffect(() => {
    if (AsyncResult.isFailure(subscription)) {
      void workspace.receiveSubscriptionFailure(subscriptionCallId);
    } else if (AsyncResult.isSuccess(subscription)) {
      workspace.receiveFeed(subscription.value);
    }
  }, [workspace, subscription, subscriptionCallId]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- releases the active media connection when the workspace provider unmounts
  useEffect(
    () => () => {
      void workspace.stop();
    },
    [workspace],
  );
  return (
    <VoiceContext value={workspace}>
      {children}
      <VoicePanel />
    </VoiceContext>
  );
}
function BasicVoiceNotice() {
  const messages = useMessages();
  return messages(BASIC_VOICE_NOTICE);
}

export function VoiceSettings() {
  const gt = useGT();
  const { workspace, state } = useVoiceWorkspace();
  const enhanced = workspace.supportsVoiceControls();
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const voices = [
    ...new Set([...state.voices, ...(state.preferences.voice ? [state.preferences.voice] : [])]),
  ];
  const refreshMicrophones = async () => {
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices();
      setMicrophones(devices?.filter((device) => device.kind === "audioinput") ?? []);
      setDeviceError(null);
    } catch {
      setDeviceError(gt("Could not list microphones. Check browser microphone access."));
    }
  };
  return (
    <SettingsSection title={gt("Live voice · This device")}>
      <SettingsRow
        title={gt("Speaking voice")}
        description={gt(
          "Saved on this device, regardless of the project or environment selected above. Voice changes apply to the next call. Open a connected thread on a host with Codex to load its voices.",
        )}
        control={
          <Select
            disabled={!enhanced}
            value={enhanced ? state.preferences.voice : ""}
            onOpenChange={(open) => {
              if (open) void workspace.loadVoices();
            }}
            onValueChange={(voice) => {
              if (voice !== null) void workspace.setPreferences({ voice });
            }}
          >
            <SelectTrigger size="sm" aria-label={gt("Speaking voice")}>
              <SelectValue>
                {enhanced && state.preferences.voice
                  ? state.preferences.voice
                  : gt("Provider default")}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="">{gt("Provider default")}</SelectItem>
              {voices.map((voice) => (
                <SelectItem key={voice} value={voice}>
                  {voice}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      >
        {!enhanced && (
          <p className="text-xs text-muted-foreground">
            <BasicVoiceNotice />
          </p>
        )}
      </SettingsRow>
      <SettingsRow
        title={gt("Microphone")}
        control={
          <Select
            value={state.preferences.microphoneId}
            onOpenChange={(open) => {
              if (open) void refreshMicrophones();
            }}
            onValueChange={(microphoneId) => {
              if (microphoneId !== null) void workspace.setPreferences({ microphoneId });
            }}
          >
            <SelectTrigger size="sm" aria-label={gt("Microphone")}>
              <SelectValue>
                {microphones.find((device) => device.deviceId === state.preferences.microphoneId)
                  ?.label ||
                  (state.preferences.microphoneId
                    ? gt("Selected microphone")
                    : gt("System default"))}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="">{gt("System default")}</SelectItem>
              {microphones
                .filter((device) => device.deviceId)
                .map((device, index) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || gt("Microphone {number}", { number: index + 1 })}
                  </SelectItem>
                ))}
            </SelectPopup>
          </Select>
        }
      >
        {deviceError && <p role="status">{deviceError}</p>}
      </SettingsRow>
      <SettingsRow
        title={gt("Mute speaker")}
        control={
          <Switch
            aria-label={gt("Mute speaker")}
            checked={state.preferences.outputMuted}
            onCheckedChange={(outputMuted) => void workspace.setPreferences({ outputMuted })}
          />
        }
      />
      <SettingsRow
        title={gt("Share what I’m viewing")}
        description={gt(
          "Shares bounded file, diff and question context with the voice call. Already shared content remains in the conversation.",
        )}
        control={
          <Switch
            aria-label={gt("Share what I’m viewing")}
            disabled={!enhanced}
            checked={enhanced && state.preferences.shareContext}
            onCheckedChange={(shareContext) => void workspace.setPreferences({ shareContext })}
          />
        }
      />
    </SettingsSection>
  );
}

function VoicePanel() {
  const gt = useGT();
  const { workspace, state } = useVoiceWorkspace();
  const [expanded, setExpanded] = useState(false);
  const shells = useThreadShells();
  const active = state.voice.status !== "idle" && state.voice.status !== "error";
  const target = shells.find(
    (shell) =>
      shell.environmentId === state.target?.environmentId && shell.id === state.target?.threadId,
  );
  if (!active && !state.notice && !state.voice.error && state.feed.transcripts.length === 0)
    return null;
  return (
    <aside
      aria-label={gt("Live voice")}
      className="fixed bottom-52 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-background p-3 shadow-lg"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="text-left text-sm font-medium"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {state.target?.title ?? gt("Live voice")} · {state.voice.status}
        </button>
        {!active && (
          <button
            type="button"
            aria-label={gt("Close voice panel")}
            onClick={() => workspace.dismiss()}
          >
            <T>Close</T>
          </button>
        )}
        {active && (
          <button
            type="button"
            aria-label={gt("End voice call")}
            onClick={() => void workspace.stop()}
          >
            <T>End</T>
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {target?.hasPendingUserInput
          ? gt("Agent: {status} · needs input", { status: target.runtime?.status ?? "idle" })
          : gt("Agent: {status}", { status: target?.runtime?.status ?? "idle" })}
      </p>
      {state.notice || state.voice.error ? (
        <p role="status" className="mt-2 text-sm">
          {state.notice ?? state.voice.error}
        </p>
      ) : null}
      {active && (
        <div className="my-2 flex gap-3 text-xs">
          <button type="button" onClick={() => workspace.toggleMuted()}>
            {state.voice.muted ? gt("Unmute mic") : gt("Mute mic")}
          </button>
          <button
            type="button"
            onClick={() =>
              void workspace.setPreferences({ outputMuted: !state.preferences.outputMuted })
            }
          >
            {state.preferences.outputMuted ? gt("Unmute speaker") : gt("Mute speaker")}
          </button>
          {state.voice.status === "playback-blocked" && (
            <button type="button" onClick={() => void workspace.resumeAudio()}>
              <T>Resume audio</T>
            </button>
          )}
        </div>
      )}
      {expanded && (
        <div className="max-h-[40vh] space-y-3 overflow-y-auto">
          <VoiceSettings />
          {active && (
            <label className="block text-sm">
              <T>Work thread</T>
              <select
                aria-label={gt("Voice task")}
                className="mt-1 w-full"
                value={JSON.stringify([state.target?.environmentId, state.target?.threadId])}
                onChange={(event) => {
                  const target = state.targets.find(
                    (target) =>
                      JSON.stringify([target.environmentId, target.threadId]) ===
                      event.target.value,
                  );
                  if (target) void workspace.start(target);
                }}
              >
                {state.targets.map((target) => (
                  <option
                    key={JSON.stringify([target.environmentId, target.threadId])}
                    value={JSON.stringify([target.environmentId, target.threadId])}
                  >
                    {target.title} · {target.environmentId.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {active && state.view && (
            <button
              type="button"
              className="text-sm underline"
              onClick={() => void workspace.start(state.view)}
            >
              <T>Switch voice to viewed task</T>
            </button>
          )}
          <p className="text-xs text-muted-foreground">
            {workspace.hasVoiceEvents ? (
              <T>Say ‘end voice call’ or ‘switch voice to [thread title]’.</T>
            ) : (
              <BasicVoiceNotice />
            )}
          </p>
          <div aria-label={gt("Voice transcript")} className="space-y-2 text-sm">
            {state.feed.transcripts.map((entry) => (
              <p key={entry.id}>
                <strong>{entry.role === "user" ? gt("You") : "Codex"}:</strong> {entry.text}
              </p>
            ))}
            {state.feed.partial.user && (
              <p>{gt("You: {text}", { text: state.feed.partial.user })}</p>
            )}
            {state.feed.partial.assistant && (
              <p>{gt("Codex: {text}", { text: state.feed.partial.assistant })}</p>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

export function useVoiceViewContext(source: string, text: string | null) {
  const workspace = useContext(VoiceContext);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers viewed context with the voice workspace while its source is mounted
  useEffect(() => {
    workspace?.setContext(source, text);
    return () => workspace?.setContext(source, null);
  }, [workspace, source, text]);
}

export function runVoiceAction(
  workspace: VoiceWorkspace,
  command: "voice.toggle" | "voice.mute" | "voice.outputMute",
) {
  const state = workspace.getSnapshot();
  if (command === "voice.toggle") {
    if (state.voice.status === "idle" || state.voice.status === "error") void workspace.start();
    else void workspace.stop();
  } else if (command === "voice.mute") workspace.toggleMuted();
  else void workspace.setPreferences({ outputMuted: !state.preferences.outputMuted });
}
