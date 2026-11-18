import { controllerNavigation } from "../features/controller/controllerNavigation";
import { ControllerConsole } from "../features/controller/ControllerConsole";
import { ControllerPressable } from "../features/controller/ControllerPressable";
import { ScreenScrollView } from "./ui/ScreenScrollView";
import { NavigationRow } from "./ui/NavigationRow";
import { AppText } from "./ui/AppText";
import { MenuView } from "@react-native-menu/menu";
import { useState, useSyncExternalStore, cloneElement, type ReactElement } from "react";
import {
  Modal,
  Platform,
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import type { useMediaActions } from "../state/mediaActions";
import { SymbolView } from "./ui/AppSymbol";
import { Menu } from "./ui/Menu";

export function MediaActionsMenu(props: {
  readonly media: ReturnType<typeof useMediaActions>;
  readonly inModal?: boolean;
  readonly children?: ReactElement<PressableProps>;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const controllerEnabled = useSyncExternalStore(
    controllerNavigation.subscribe,
    () => controllerNavigation.snapshot().enabled,
    () => false,
  );
  const [open, setOpen] = useState(false);
  if (props.media.actions.length === 0) return props.children ?? null;
  // Android's normal anchored menu lives in the app-root portal, behind native modals.
  const nativeAndroidMenu = props.inModal && Platform.OS === "android";
  if (nativeAndroidMenu && controllerEnabled)
    return (
      <>
        <ControllerPressable
          touchPassthrough={props.children !== undefined}
          onActivate={() => setOpen(true)}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Media actions"
          style={props.style}
        >
          {props.children ? (
            cloneElement(props.children, { onLongPress: () => setOpen(true) })
          ) : (
            <View className="min-h-11 min-w-11 items-center justify-center rounded-md bg-black/60">
              <SymbolView name="ellipsis" size={20} tintColor="#ffffff" type="monochrome" />
            </View>
          )}
        </ControllerPressable>
        {open ? (
          <Modal transparent visible onRequestClose={() => setOpen(false)}>
            <ControllerConsole
              scopeKey="media-actions"
              initialRegion="content"
              onBack={() => setOpen(false)}
            >
              <View className="flex-1 justify-center bg-black/50 px-6">
                <Pressable
                  className="absolute inset-0"
                  accessible={false}
                  onPress={() => setOpen(false)}
                />
                <View
                  nativeID="t3-controller-region:content:media-actions"
                  className="max-h-[80%] overflow-hidden rounded-3xl bg-sheet-solid p-4"
                >
                  <AppText className="mb-3 text-lg font-t3-semibold">
                    {props.media.title ?? "Media actions"}
                  </AppText>
                  <ScreenScrollView>
                    {props.media.actions.map((action) => (
                      <NavigationRow
                        key={action.id}
                        title={action.title}
                        trailing={null}
                        disabled={action.disabled}
                        onPress={() => {
                          if (action.disabled) return;
                          setOpen(false);
                          void action.run();
                        }}
                      />
                    ))}
                  </ScreenScrollView>
                </View>
              </View>
            </ControllerConsole>
          </Modal>
        ) : null}
      </>
    );
  const MediaMenu = nativeAndroidMenu ? MenuView : Menu;
  return (
    <MediaMenu
      title={props.media.title}
      style={props.style}
      shouldOpenOnLongPress={props.children !== undefined}
      actions={props.media.actions.map(({ id, title, disabled }) => ({
        id,
        title,
        attributes: { disabled: disabled ?? false },
      }))}
      onPressAction={({ nativeEvent }) => {
        props.media.actions.find(({ id }) => id === nativeEvent.event)?.run();
      }}
    >
      {props.children ?? (
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel="Media actions"
          className="min-h-11 min-w-11 items-center justify-center rounded-md bg-black/60"
        >
          <SymbolView name="ellipsis" size={20} tintColor="#ffffff" type="monochrome" />
        </View>
      )}
    </MediaMenu>
  );
}
