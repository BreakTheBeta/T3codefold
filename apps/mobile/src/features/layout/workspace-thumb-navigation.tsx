import { useCallback, useMemo } from "react";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { AppText } from "../../components/AppText";

import {
  resolveWorkspaceThumbAction,
  type WorkspaceThumbAction,
} from "../../lib/workspace-thumb-navigation";
export type { WorkspaceThumbAction } from "../../lib/workspace-thumb-navigation";

export function WorkspaceThumbNavigation(props: {
  readonly onAction: (action: WorkspaceThumbAction) => void;
}) {
  const { onAction } = props;
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
    <View className="items-center bg-header" style={{ paddingHorizontal: 32 }}>
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
          className="h-10 w-40 items-center justify-center"
        >
          <View className="h-1 w-12 rounded-full bg-foreground-muted" />
        </View>
      </GestureDetector>
      <View className="flex-row gap-4 pb-1">
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
          >
            <AppText className="text-xs text-foreground-muted">
              {action === "previous" ? "‹" : action === "next" ? "›" : action}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
