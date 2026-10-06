import { requireNativeView } from "expo";
import type { PropsWithChildren } from "react";
import type { NativeSyntheticEvent, ViewProps } from "react-native";

import type { HardwareKeyboardCommand } from "../features/keyboard/hardwareKeyboardCommands";
import type { VimKey } from "../features/keyboard/vimNavigation";

interface NativeKeyboardCommandsProps extends ViewProps {
  readonly enabledCommands: ReadonlyArray<HardwareKeyboardCommand>;
  readonly onCommand: (
    event: NativeSyntheticEvent<{ readonly command: HardwareKeyboardCommand }>,
  ) => void;
}

const NativeKeyboardCommands = requireNativeView<NativeKeyboardCommandsProps>("T3KeyboardCommands");

export function T3KeyboardCommands(
  props: PropsWithChildren<{
    readonly enabledCommands: ReadonlyArray<HardwareKeyboardCommand>;
    readonly onCommand: (command: HardwareKeyboardCommand) => void;
    /** Vim navigation is Android-only; iOS ignores these. */
    readonly vimKeysEnabled?: boolean;
    readonly onVimKey?: (key: VimKey) => void;
  }>,
) {
  return (
    <NativeKeyboardCommands
      onCommand={(event) => props.onCommand(event.nativeEvent.command)}
      enabledCommands={props.enabledCommands}
      style={{ flex: 1 }}
    >
      {props.children}
    </NativeKeyboardCommands>
  );
}
