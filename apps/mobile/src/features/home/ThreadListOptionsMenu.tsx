import type { MenuAction } from "@react-native-menu/menu";
import type { ComponentProps } from "react";
import { View } from "react-native";

import { AndroidAnchoredMenu } from "../../components/AndroidAnchoredMenu";
import { AndroidHeaderIconButton } from "../../components/AndroidScreenHeader";

/**
 * Fold's Android thread-list overflow menu: thread filters, Pull requests when the
 * toolbar is too narrow for its own button, and Settings. A dot marks active filters.
 */
export function ThreadListOptionsMenu(props: {
  readonly hasConnections: boolean;
  readonly filterActions: MenuAction[];
  readonly filterCustomized: boolean;
  readonly includePullRequests: boolean;
  readonly onFilterAction: NonNullable<ComponentProps<typeof AndroidAnchoredMenu>["onPressAction"]>;
  readonly onOpenPullRequests: () => void;
  readonly onOpenSettings: () => void;
}) {
  return (
    <AndroidAnchoredMenu
      title="Thread options"
      actions={[
        ...(props.hasConnections
          ? [
              {
                id: "thread-filters",
                title: "Filter threads",
                subactions: props.filterActions,
              },
            ]
          : []),
        ...(props.includePullRequests ? [{ id: "pull-requests", title: "Pull requests" }] : []),
        { id: "settings", title: "Settings" },
      ]}
      onPressAction={(event) => {
        if (event.nativeEvent.event === "pull-requests") props.onOpenPullRequests();
        else if (event.nativeEvent.event === "settings") props.onOpenSettings();
        else props.onFilterAction(event);
      }}
    >
      {(open) => (
        <View>
          <AndroidHeaderIconButton
            accessibilityLabel={
              props.filterCustomized ? "Thread options, filters active" : "Thread options"
            }
            icon="ellipsis"
            onPress={open}
          />
          {props.filterCustomized ? (
            <View
              pointerEvents="none"
              className="absolute right-2 top-2 size-1.5 rounded-full bg-primary"
            />
          ) : null}
        </View>
      )}
    </AndroidAnchoredMenu>
  );
}
