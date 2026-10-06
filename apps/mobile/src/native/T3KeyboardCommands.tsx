import type { PropsWithChildren } from "react";
import { View } from "react-native";

import type { HardwareKeyboardCommand } from "../features/keyboard/hardwareKeyboardCommands";
import type { VimKey } from "../features/keyboard/vimNavigation";

export function T3KeyboardCommands(
  props: PropsWithChildren<{
    readonly enabledCommands: ReadonlyArray<HardwareKeyboardCommand>;
    readonly onCommand: (command: HardwareKeyboardCommand) => void;
    readonly vimKeysEnabled?: boolean;
    readonly onVimKey?: (key: VimKey) => void;
  }>,
) {
  return <View className="flex-1">{props.children}</View>;
}
