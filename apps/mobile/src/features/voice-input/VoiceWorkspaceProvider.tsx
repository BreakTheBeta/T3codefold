import { useHardwareKeyboardCommand } from "../keyboard/hardwareKeyboardCommands";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import * as SecureStore from "expo-secure-store";
import { Platform, View, Pressable, ScrollView, Switch } from "react-native";
import { AppText as Text } from "../../components/AppText";
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
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useThreadShells, useServerConfigs } from "../../state/entities";
import { uuidv4 } from "../../lib/uuid";
import { voiceAudio } from "./voiceAudio";
import { createNativeVoiceMedia } from "./codexVoiceMedia";
import { mediaDevices } from "react-native-webrtc";
import { useSafeAreaInsets } from "react-native-safe-area-context";
type VoiceAudioControls = {
  speaker: boolean;
  audioRoute: string;
  audioError: string | null;
  chooseAudioOutput(): Promise<void>;
  volumeUp(): void;
};
const VoiceContext = createContext<{ workspace: VoiceWorkspace; audio: VoiceAudioControls } | null>(
  null,
);
const emptyFeedAtom = Atom.make(AsyncResult.success(emptyVoiceFeed));
const preferenceKey = "fold.liveVoice.preferences";
function readPreferences(value: string): Partial<VoicePreferences> {
  try {
    const raw: unknown = JSON.parse(value);
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
export function useVoiceWorkspace() {
  const value = useContext(VoiceContext);
  if (!value) throw new Error("Voice workspace is not mounted");
  const state = useSyncExternalStore(value.workspace.subscribe, value.workspace.getSnapshot);
  return { ...value, state };
}
export function VoiceWorkspaceProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState({ speaker: false, audioRoute: "Phone" });
  const [audioError, setAudioError] = useState<string | null>(null);
  const start = useAtomCommand(threadEnvironment.startRealtimeVoice, { reportFailure: false });
  const stop = useAtomCommand(threadEnvironment.stopRealtimeVoice, { reportFailure: false });
  const list = useAtomCommand(threadEnvironment.listRealtimeVoices, { reportFailure: false });
  const context = useAtomCommand(threadEnvironment.appendRealtimeVoiceContext, {
    reportFailure: false,
  });
  const workspace = useMemo(
    () =>
      new VoiceWorkspace({
        createCallId: uuidv4,
        openMedia: createNativeVoiceMedia((speaker, audioRoute) =>
          setRoute({ speaker, audioRoute }),
        ),
        startRemote: async (target, sdp, callId, voice) =>
          unwrap(
            await start({
              environmentId: target.environmentId,
              input: voiceStartInput(target, sdp, callId, voice),
            }),
          ).sdp,
        stopRemote: async (target) => {
          unwrap(
            await stop({
              environmentId: target.environmentId,
              input: { threadId: target.threadId },
            }),
          );
        },
        listVoices: async (target) =>
          unwrap(
            await list({
              environmentId: target.environmentId,
              input: { threadId: target.threadId },
            }),
          ),
        appendContext: async (target, callId, text) => {
          unwrap(
            await context({
              environmentId: target.environmentId,
              input: { threadId: target.threadId, callId, text },
            }),
          );
        },
        savePreferences: (preferences) => {
          void SecureStore.setItemAsync(preferenceKey, JSON.stringify(preferences)).catch(() => {});
        },
      }),
    [start, stop, list, context],
  );
  useEffect(() => {
    let mounted = true;
    void SecureStore.getItemAsync(preferenceKey)
      .then((value) => {
        if (!mounted || !value) return;
        try {
          workspace.restorePreferences(readPreferences(value));
        } catch {
          /* Ignore malformed preferences. */
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [workspace]);
  useEffect(() => {
    const end = voiceAudio.addListener("endCall", () => {
      void workspace.stop();
    });
    const route = voiceAudio.addListener("audioRoute", (value) =>
      setRoute({ speaker: value.speaker, audioRoute: value.name }),
    );
    const mute = voiceAudio.addListener("systemMute", ({ muted }) => workspace.setMuted(muted));
    return () => {
      end.remove();
      route.remove();
      mute.remove();
    };
  }, [workspace]);
  useHardwareKeyboardCommand(
    "voiceToggle",
    useCallback(() => {
      const state = workspace.getSnapshot();
      if (state.voice.status === "idle" || state.voice.status === "error") void workspace.start();
      else void workspace.stop();
    }, [workspace]),
  );
  useHardwareKeyboardCommand(
    "voiceMute",
    useCallback(() => workspace.toggleMuted(), [workspace]),
  );
  useHardwareKeyboardCommand(
    "voiceOutputMute",
    useCallback(() => {
      void workspace.setPreferences({
        outputMuted: !workspace.getSnapshot().preferences.outputMuted,
      });
    }, [workspace]),
  );
  const state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
  const shells = useThreadShells();
  const configs = useServerConfigs();
  const targets = useMemo(
    () =>
      shells
        .filter(
          (shell) =>
            !shell.archivedAt &&
            !shell.deletedAt &&
            configs
              .get(shell.environmentId)
              ?.providers.some(
                (provider) =>
                  provider.instanceId === shell.providerInstanceId && provider.driver === "codex",
              ),
        )
        .map((shell) => ({
          environmentId: shell.environmentId,
          threadId: shell.id,
          title: shell.title,
          enhancedVoice:
            configs.get(shell.environmentId)?.environment.capabilities.realtimeVoiceControls ===
            true,
        })),
    [shells, configs],
  );
  useEffect(() => workspace.setTargets(targets), [workspace, targets]);
  const subscription = useAtomValue(
    state.target &&
      workspace.hasVoiceEvents &&
      state.voice.status !== "idle" &&
      state.voice.status !== "error"
      ? threadEnvironment.realtimeVoiceEvents({
          environmentId: state.target.environmentId,
          input: { threadId: state.target.threadId },
        })
      : emptyFeedAtom,
  );
  const feed = Option.getOrElse(AsyncResult.value(subscription), () => emptyVoiceFeed);
  useEffect(() => workspace.receiveFeed(feed), [workspace, feed]);
  useEffect(
    () => () => {
      void workspace.stop();
    },
    [workspace],
  );
  const audio = useMemo(
    () => ({
      ...route,
      audioError,
      chooseAudioOutput: async () => {
        try {
          if (Platform.OS === "android") await voiceAudio.chooseEndpoint();
          else {
            await voiceAudio.setSpeaker(!route.speaker);
            setRoute({
              speaker: !route.speaker,
              audioRoute: !route.speaker ? "Speaker" : "Phone / headset",
            });
          }
          setAudioError(null);
        } catch (error) {
          setAudioError(error instanceof Error ? error.message : "Could not change audio output.");
        }
      },
      volumeUp: () => voiceAudio.volumeUp(),
    }),
    [route, audioError],
  );
  const value = useMemo(() => ({ workspace, audio }), [workspace, audio]);
  return (
    <VoiceContext value={value}>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>{children}</View>
        <VoicePanel />
      </View>
    </VoiceContext>
  );
}
function Action({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ paddingVertical: 10, paddingHorizontal: 8 }}
    >
      <Text className="text-foreground" style={{ fontWeight: "600" }} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}
export function VoiceSettings() {
  const { workspace, state, audio } = useVoiceWorkspace();
  const enhanced = workspace.supportsVoiceControls();
  const [microphones, setMicrophones] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const refresh = async () => {
    if (enhanced) await workspace.loadVoices();
    try {
      const devices = await mediaDevices.enumerateDevices();
      if (Array.isArray(devices))
        setMicrophones(
          devices
            .filter((device) => device.kind === "audioinput")
            .map((device) => ({
              deviceId: String(device.deviceId),
              label: String(device.label || "Microphone"),
            })),
        );
      setDeviceError(null);
    } catch {
      setDeviceError("Could not list microphones. Check microphone access in system settings.");
    }
  };
  return (
    <View style={{ gap: 8, padding: 12 }}>
      <Text style={{ fontWeight: "600" }}>Live voice</Text>
      <Action
        label={enhanced ? "Load voices and microphones" : "Load microphones"}
        onPress={() => void refresh()}
      />
      {deviceError && <Text>{deviceError}</Text>}
      {!enhanced && <Text>{BASIC_VOICE_NOTICE}</Text>}
      {enhanced && (
        <>
          <Text>Speaking voice: {state.preferences.voice || "Provider default"}</Text>
          <ScrollView horizontal>
            <Action
              label="Provider default"
              onPress={() => void workspace.setPreferences({ voice: "" })}
            />
            {state.voices.map((voice) => (
              <Action
                key={voice}
                label={voice}
                onPress={() => void workspace.setPreferences({ voice })}
              />
            ))}
          </ScrollView>
          <Text>Voice changes apply to the next call.</Text>
        </>
      )}
      <Text>Microphone</Text>
      <ScrollView horizontal>
        <Action
          label="System default"
          onPress={() => void workspace.setPreferences({ microphoneId: "" })}
        />
        {microphones
          .filter((device) => device.deviceId)
          .map((device) => (
            <Action
              key={device.deviceId}
              label={device.label}
              onPress={() => void workspace.setPreferences({ microphoneId: device.deviceId })}
            />
          ))}
      </ScrollView>
      <Action label="Increase call volume" onPress={() => audio.volumeUp()} />
      <Action
        label={`Audio route: ${audio.audioRoute}`}
        onPress={() => void audio.chooseAudioOutput()}
      />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text>Mute speaker</Text>
        <Switch
          accessibilityLabel="Mute speaker"
          value={state.preferences.outputMuted}
          onValueChange={(outputMuted) => void workspace.setPreferences({ outputMuted })}
        />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text>Share what I’m viewing</Text>
        <Switch
          accessibilityLabel="Share what I’m viewing"
          disabled={!enhanced}
          value={enhanced && state.preferences.shareContext}
          onValueChange={(shareContext) => void workspace.setPreferences({ shareContext })}
        />
      </View>
      <Text>
        Shares bounded file, diff and question context. Previously shared content remains in the
        call.
      </Text>
    </View>
  );
}
function VoicePanel() {
  const { workspace, state } = useVoiceWorkspace();
  const [expanded, setExpanded] = useState(false);
  const insets = useSafeAreaInsets();
  const shells = useThreadShells();
  const active = state.voice.status !== "idle" && state.voice.status !== "error";
  const target = shells.find(
    (shell) =>
      shell.environmentId === state.target?.environmentId && shell.id === state.target?.threadId,
  );
  if (!active && !state.notice && !state.voice.error && state.feed.transcripts.length === 0)
    return null;
  return (
    <View
      accessibilityLabel="Live voice"
      className="bg-screen border-t border-border"
      style={{
        paddingHorizontal: Math.max(insets.left, 12),
        paddingBottom: insets.bottom,
        maxHeight: "50%",
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Action
            label={`${state.target?.title ?? "Live voice"} · ${state.voice.status}`}
            onPress={() => setExpanded(!expanded)}
          />
        </View>
        {!active && <Action label="Close voice panel" onPress={() => workspace.dismiss()} />}
        {active && <Action label="End call" onPress={() => void workspace.stop()} />}
      </View>
      <Text className="text-foreground">
        Agent: {target?.runtime?.status ?? "idle"}
        {target?.hasPendingUserInput ? " · needs input" : ""}
      </Text>
      {state.notice || state.voice.error ? (
        <Text className="text-foreground">{state.notice ?? state.voice.error}</Text>
      ) : null}
      {active && (
        <View style={{ flexDirection: "row" }}>
          <Action
            label={state.voice.muted ? "Unmute mic" : "Mute mic"}
            onPress={() => workspace.toggleMuted()}
          />
          <Action
            label={state.preferences.outputMuted ? "Unmute speaker" : "Mute speaker"}
            onPress={() =>
              void workspace.setPreferences({ outputMuted: !state.preferences.outputMuted })
            }
          />
        </View>
      )}
      {expanded && (
        <ScrollView>
          <VoiceSettings />
          <Text>Voice task (reconnects)</Text>
          <ScrollView horizontal>
            {state.targets.map((target) => (
              <Action
                key={`${target.environmentId}:${target.threadId}`}
                label={`${target.title} · ${target.environmentId.slice(0, 8)}`}
                onPress={() => void workspace.start(target)}
              />
            ))}
          </ScrollView>
          {state.view && (
            <Action
              label="Switch voice to viewed task"
              onPress={() => void workspace.start(state.view)}
            />
          )}
          <Text>
            {workspace.hasVoiceEvents
              ? "Say ‘end voice call’ or ‘switch voice to [thread title]’. Switching reconnects."
              : BASIC_VOICE_NOTICE}
          </Text>
          {state.feed.transcripts.map((entry) => (
            <Text key={entry.id} className="text-foreground" style={{ paddingVertical: 5 }}>
              {entry.role === "user" ? "You" : "Codex"}: {entry.text}
            </Text>
          ))}
          <Text>{state.feed.partial.user || state.feed.partial.assistant}</Text>
        </ScrollView>
      )}
    </View>
  );
}

export function useVoiceViewContext(source: string, text: string | null) {
  const workspace = useContext(VoiceContext)?.workspace;
  useEffect(() => {
    workspace?.setContext(source, text);
    return () => workspace?.setContext(source, null);
  }, [workspace, source, text]);
}
