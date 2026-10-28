import { SettingsIcon } from "lucide-react";

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
