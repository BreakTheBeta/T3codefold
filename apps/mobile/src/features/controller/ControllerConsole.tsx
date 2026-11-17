import { controllerDictation } from "./controllerDictation";
import { ControllerScope, useControllerNativeScope } from "./controllerScope";
import { useGlobalVoiceInput } from "../voice-input/VoiceInputProvider";
import { useEffect, useId, type PropsWithChildren } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { T3KeyboardCommands } from "../../native/T3KeyboardCommands";
import { requestAndroidBack } from "../../native/controllerBack";
import type { HardwareKeyboardCommand } from "../keyboard/hardwareKeyboardCommands";
import { controllerTargets } from "./controllerTargets";

export function ControllerConsole({
  children,
  onCommand,
  onBack,
  scopeKey,
}: PropsWithChildren<{
  readonly scopeKey?: string;
  readonly onCommand?: (command: HardwareKeyboardCommand) => void;
  readonly onBack?: () => void;
}>) {
  const surfaceId = useId();
  const dimensions = useWindowDimensions();
  const voice = useGlobalVoiceInput();
  const scope = `${scopeKey ?? "modal"}:${dimensions.width}:${dimensions.height}`;
  const surface = `${surfaceId}:${scope}`;
  const nativeScope = useControllerNativeScope(scope);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- cancels only this surface's controller recording when its route or native owner unmounts
  useEffect(() => () => controllerDictation.cancel(surface), [surface]);
  if (Platform.OS !== "android") return children;
  return (
    <T3KeyboardCommands
      controllerScope={nativeScope}
      controllerRecording={voice.isBusy && controllerDictation.owns(surface)}
      enabledCommands={[]}
      onCommand={() => {}}
      onController={({ action, targetId }) => {
        if (action === "enabled" || action === "reset") {
          if (action === "reset") controllerDictation.cancel(surface);
          return;
        }
        if (action === "dictate" && voice.isBusy) {
          if (controllerDictation.owns(surface)) voice.stop();
          return;
        }
        if (
          action === "activate" ||
          action === "dictate" ||
          action === "decrement" ||
          action === "increment"
        ) {
          if (action === "dictate")
            controllerDictation.start(surface, voice.session, () => {
              controllerTargets.dispatch(targetId, action, scope);
            });
          else controllerTargets.dispatch(targetId, action, scope);
        } else if (action === "back" || action === "editingEnded") {
          if (voice.isBusy && controllerDictation.owns(surface)) voice.cancel();
          else if (action === "back") (onBack ?? requestAndroidBack)();
        } else if (action === "menu") onCommand?.("commandPalette");
        else if (action === "chooser") onCommand?.("commandPalette");
        else if (action === "previous") onCommand?.("thread.previous");
        else if (action === "next") onCommand?.("thread.next");
      }}
    >
      <ControllerScope value={scope}>
        <View className="flex-1">{children}</View>
      </ControllerScope>
    </T3KeyboardCommands>
  );
}
