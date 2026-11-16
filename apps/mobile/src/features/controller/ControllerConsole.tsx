import { Button } from "../../components/ui/Button";
import { controllerDictation } from "./controllerDictation";
import { ControllerScope, useControllerNativeScope } from "./controllerScope";
import { useGlobalVoiceInput } from "../voice-input/VoiceInputProvider";
import { useEffect, useId, useState, type PropsWithChildren } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { AppText } from "../../components/ui/AppText";
import { T3KeyboardCommands } from "../../native/T3KeyboardCommands";
import { disableAndroidController, requestAndroidBack } from "../../native/controllerBack";
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
  const [active, setActive] = useState(false);
  const [hint, setHint] = useState("");
  const scope = `${scopeKey ?? "modal"}:${dimensions.width}:${dimensions.height}`;
  const surface = `${surfaceId}:${scope}`;
  const nativeScope = useControllerNativeScope(scope);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- cancels only this surface's controller recording when its route or native owner unmounts
  useEffect(() => () => controllerDictation.cancel(surface), [surface]);
  if (Platform.OS !== "android") return children;
  return (
    <T3KeyboardCommands
      controllerScope={nativeScope}
      enabledCommands={[]}
      onCommand={() => {}}
      onController={({ action, targetId }) => {
        if (action === "enabled" || action === "reset") {
          setActive(action === "enabled");
          if (action === "reset") controllerDictation.cancel(surface);
          return;
        }
        if (action === "dictate" && voice.isBusy) {
          voice.stop();
          return;
        }
        if (action === "activate" || action === "dictate") {
          let dispatched = false;
          if (action === "dictate")
            controllerDictation.start(surface, voice.session, () => {
              dispatched = controllerTargets.dispatch(targetId, action, scope);
            });
          else dispatched = controllerTargets.dispatch(targetId, action, scope);
          if (!dispatched)
            setHint(
              action === "dictate"
                ? "Focus a text field to dictate"
                : "Move to a highlighted action",
            );
          else setHint("");
        } else if (action === "back") {
          if (voice.isBusy) voice.cancel();
          else (onBack ?? requestAndroidBack)();
        } else if (action === "menu") onCommand?.("commandPalette");
        else if (action === "chooser") onCommand?.("commandPalette");
        else if (action === "previous") onCommand?.("thread.previous");
        else if (action === "next") onCommand?.("thread.next");
      }}
    >
      <ControllerScope value={scope}>
        <View className="flex-1">{children}</View>
      </ControllerScope>
      <View className="bg-screen px-3 py-1">
        <AppText className="text-xs text-foreground-secondary">
          {active
            ? "Controller active · ✚ Move · × Select · ○ Back · □ Dictate reply · △ Review · L1/R1 Threads · L3 Chat · R3 Reply · Options Commands"
            : "Controller: press Options to enable"}
        </AppText>
        {hint ? <AppText accessibilityLiveRegion="polite">{hint}</AppText> : null}
        {active ? (
          <ControllerScope value={scope}>
            <Button
              label="Disable controller"
              size="compact"
              onPress={() => {
                void disableAndroidController();
              }}
            />
          </ControllerScope>
        ) : null}
      </View>
    </T3KeyboardCommands>
  );
}
