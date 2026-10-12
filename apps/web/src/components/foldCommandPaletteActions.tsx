import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { useNavigate } from "@tanstack/react-router";
import { CrownIcon, SettingsIcon } from "lucide-react";

import { useEnvironmentSettings, useUpdateEnvironmentSettings } from "../hooks/useSettings";
import { ITEM_ICON_CLASS, type CommandPaletteActionItem } from "./CommandPalette.logic";
import { runVoiceAction, useOptionalVoiceWorkspace } from "./voice/VoiceWorkspaceProvider";

/** Live voice call controls; the palette lists them first while a voice workspace is mounted. */
export function useFoldVoiceActionItems(): CommandPaletteActionItem[] {
  const voiceWorkspace = useOptionalVoiceWorkspace();
  if (!voiceWorkspace) return [];
  return (
    [
      ["voice.toggle", "Start or end voice call"],
      ["voice.mute", "Mute or unmute voice microphone"],
      ["voice.outputMute", "Mute or unmute voice speaker"],
    ] as const
  ).map(([command, title]) => ({
    kind: "action",
    value: `action:${command}`,
    title,
    searchTerms: ["voice", "live", "audio", "microphone"],
    icon: <SettingsIcon className={ITEM_ICON_CLASS} />,
    shortcutCommand: command,
    run: async () => {
      runVoiceAction(voiceWorkspace, command);
    },
  }));
}

/** Makes the active thread GLaDOS or stops it, and opens GLaDOS settings for its machine. */
export function useFoldGladosActionItems(
  navigate: ReturnType<typeof useNavigate>,
  activeThread: { readonly environmentId: EnvironmentId; readonly id: ThreadId } | null,
): CommandPaletteActionItem[] {
  const environmentId = activeThread?.environmentId ?? ("" as EnvironmentId);
  const gladosThreadId = useEnvironmentSettings(
    environmentId,
    (settings) => settings.gladosThreadId,
  );
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const settingsItem: CommandPaletteActionItem = {
    kind: "action",
    value: "action:glados-settings",
    searchTerms: ["glados", "coordinator", "instructions"],
    title: "GLaDOS settings",
    icon: <CrownIcon className={ITEM_ICON_CLASS} />,
    run: async () => {
      await navigate({
        to: "/settings/glados",
        search: activeThread ? { machine: activeThread.environmentId } : {},
      });
    },
  };
  if (activeThread === null) return [settingsItem];
  const isGlados = gladosThreadId === activeThread.id;
  return [
    {
      kind: "action",
      value: "action:glados-thread",
      searchTerms: ["glados", "coordinator", "agents", "delegate"],
      title: isGlados ? "Stop using this thread as GLaDOS" : "Make this thread GLaDOS",
      icon: <CrownIcon className={ITEM_ICON_CLASS} />,
      run: async () => {
        updateSettings({ gladosThreadId: isGlados ? null : activeThread.id });
      },
    },
    settingsItem,
  ];
}
