import { useCallback, useMemo } from "react";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "../../components/AppSymbol";

import {
  resolveWorkspaceThumbAction,
  type WorkspaceThumbAction,
} from "../../lib/workspace-thumb-navigation";
export type { WorkspaceThumbAction } from "../../lib/workspace-thumb-navigation";

export function WorkspaceThumbNavigation(props: {
  readonly onAction: (action: WorkspaceThumbAction) => void;
}) {
  const { onAction } = props;
  const insets = useSafeAreaInsets();
  const dispatch = useCallback(
    (x: number, y: number) => {
      const action = resolveWorkspaceThumbAction(x, y);
      if (action) onAction(action);
    },
    [onAction],
  );
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(12)
        .onEnd((event, success) => {
          if (success) runOnJS(dispatch)(event.translationX, event.translationY);
        }),
    [dispatch],
  );
  return (
    <View
      className="border-t border-header-border bg-header"
      style={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 8), paddingTop: 4 }}
    >
      <GestureDetector gesture={gesture}>
        <View
          accessible
          accessibilityLabel="Workspace navigation"
          accessibilityHint="Swipe left or right for recent threads, up for sidebar, down for inspector."
          accessibilityActions={[
            { name: "previous", label: "Previous recent thread" },
            { name: "next", label: "Next recent thread" },
            { name: "sidebar", label: "Toggle sidebar" },
            { name: "inspector", label: "Toggle inspector" },
          ]}
          onAccessibilityAction={(event) => {
            const action = event.nativeEvent.actionName;
            if (
              action === "previous" ||
              action === "next" ||
              action === "sidebar" ||
              action === "inspector"
            )
              props.onAction(action);
          }}
          className="flex-row items-center justify-between self-center"
          style={{ width: "100%", maxWidth: 320, minHeight: 48 }}
        >
          {(["previous", "sidebar", "inspector", "next"] as const).map((action) => (
            <Pressable
              key={action}
              accessibilityRole="button"
              accessibilityLabel={
                action === "previous" || action === "next"
                  ? `${action} recent thread`
                  : `Toggle ${action}`
              }
              onPress={() => props.onAction(action)}
              className="size-12 items-center justify-center rounded-xl active:bg-subtle"
            >
              <SymbolView
                name={
                  action === "previous"
                    ? "chevron.left"
                    : action === "next"
                      ? "chevron.right"
                      : action === "sidebar"
                        ? "sidebar.left"
                        : "sidebar.right"
                }
                size={20}
                tintColorClassName="accent-icon-muted"
              />
            </Pressable>
          ))}
        </View>
      </GestureDetector>
    </View>
  );
}
