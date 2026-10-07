import { androidKeyboardFirst, dismissAndroidKeyboard } from "../../lib/android-back";
import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import {
  BackHandler,
  Keyboard,
  type TextInputInstance,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MenuAction } from "@react-native-menu/menu";

import { AndroidHeaderIconButton } from "../../components/AndroidScreenHeader";
import { CompactBrandTitle } from "../../components/CompactBrandTitle";
import { MaterialFloatingActionButton } from "../../components/MaterialFloatingActionButton";
import { AndroidAnchoredMenu } from "../../components/AndroidAnchoredMenu";
import { ControlPillMenu } from "../../components/ControlPill";
import { MaterialSearchField } from "../../components/MaterialSearchField";
import { useHardwareKeyboardCommand } from "../keyboard/hardwareKeyboardCommands";
import { WorkspaceConnectionTitle } from "./WorkspaceConnectionTitle";
import { useWorkspaceState } from "../../state/workspace";
import { useAndroidControlSizing } from "../../components/useAndroidControlSizing";
import { useMaterialToolbarLayout } from "../../components/useMaterialToolbarLayout";

/** One toolbar height for the compact list and expanded sidebar, including search. */
export function MaterialThreadListToolbar(props: {
  readonly searchQuery: string;
  readonly onSearchQueryChange: (query: string) => void;
  readonly filterActions: MenuAction[];
  readonly filterCustomized: boolean;
  readonly onFilterAction: NonNullable<ComponentProps<typeof ControlPillMenu>["onPressAction"]>;
  readonly onOpenSettings: () => void;
  readonly onOpenEnvironments: () => void;
  readonly onOpenPullRequests: () => void;
  readonly sidebar?: boolean;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly onRequestVisibility?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { fabSize, scale } = useAndroidControlSizing();
  const [toolbarWidth, setToolbarWidth] = useState(0);
  // Reserve the full brand width before exposing secondary actions, including at large text sizes.
  const compactActions = toolbarWidth < 200 * scale + 3 * 48 + 32;
  const { height: toolbarHeight, ...headerPadding } = useMaterialToolbarLayout();
  const { state } = useWorkspaceState();
  const { onRequestVisibility, onSearchQueryChange } = props;
  const searchRef = useRef<TextInputInstance>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const searching = searchOpen || props.searchQuery.length > 0;
  const openSearch = useCallback(() => {
    onRequestVisibility?.();
    setSearchOpen(true);
    searchRef.current?.focus();
    return true;
  }, [onRequestVisibility]);
  useHardwareKeyboardCommand("focusSearch", openSearch);

  const closeSearch = useCallback(() => {
    onSearchQueryChange("");
    setSearchOpen(false);
    Keyboard.dismiss();
  }, [onSearchQueryChange]);

  useEffect(() => {
    if (!searching) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (dismissAndroidKeyboard()) return true;
      closeSearch();
      return true;
    });
    return () => subscription.remove();
  }, [closeSearch, searching]);

  const filterIcon = props.filterCustomized
    ? "line.3.horizontal.decrease.circle.fill"
    : "line.3.horizontal.decrease.circle";
  const searchField = (
    <MaterialSearchField
      inputRef={searchRef}
      accessibilityLabel="Search threads"
      clearAccessibilityLabel="Clear search"
      placeholder="Search"
      value={props.searchQuery}
      onChangeText={onSearchQueryChange}
    />
  );

  return (
    <>
      <View
        onLayout={(event) => {
          setToolbarWidth(event.nativeEvent.layout.width);
          props.onLayout?.(event);
        }}
        className={
          props.sidebar ? "absolute inset-x-0 top-0 z-[4] bg-header px-2" : "bg-header px-2"
        }
        style={headerPadding}
      >
        <View className="flex-row items-center gap-1" style={{ minHeight: toolbarHeight }}>
          {searching ? (
            <>
              <AndroidHeaderIconButton
                accessibilityLabel="Close search"
                icon="arrow.left"
                onPress={androidKeyboardFirst(closeSearch)}
              />
              {searchField}
            </>
          ) : (
            <>
              {/* Match the visible inset of the trailing 48dp icon button. */}
              <View className="min-w-0 flex-1 overflow-hidden pl-4">
                <WorkspaceConnectionTitle
                  grow
                  onPress={props.onOpenEnvironments}
                  brand={<CompactBrandTitle allowFontScaling={false} />}
                />
              </View>
              {compactActions ? null : (
                <AndroidHeaderIconButton
                  accessibilityLabel="Pull requests"
                  icon="arrow.triangle.pull"
                  onPress={props.onOpenPullRequests}
                />
              )}
              <AndroidHeaderIconButton
                accessibilityLabel="Search threads"
                icon="magnifyingglass"
                onPress={openSearch}
              />
              {compactActions ? (
                <AndroidAnchoredMenu
                  title="Thread options"
                  actions={[
                    { id: "pull-requests", title: "Pull requests" },
                    { id: "settings", title: "Settings" },
                  ]}
                  onPressAction={({ nativeEvent }) => {
                    if (nativeEvent.event === "pull-requests") props.onOpenPullRequests();
                    if (nativeEvent.event === "settings") props.onOpenSettings();
                  }}
                >
                  {(open) => (
                    <AndroidHeaderIconButton
                      accessibilityLabel="Thread options"
                      icon="ellipsis"
                      onPress={open}
                    />
                  )}
                </AndroidAnchoredMenu>
              ) : (
                <AndroidHeaderIconButton
                  accessibilityLabel="Open settings"
                  icon="gearshape"
                  onPress={props.onOpenSettings}
                />
              )}
            </>
          )}
        </View>
      </View>
      {/* Keep the filter above the New thread FAB at every text size. */}
      {state.hasConnections ? (
        <View
          className="absolute right-5 z-[5]"
          style={{
            bottom:
              (props.sidebar ? Math.max(insets.bottom, 12) + 6 : Math.max(insets.bottom, 16) + 16) +
              fabSize +
              8,
          }}
        >
          <AndroidAnchoredMenu actions={props.filterActions} onPressAction={props.onFilterAction}>
            {(open) => (
              <MaterialFloatingActionButton
                label="Filter threads"
                icon={filterIcon}
                onPress={open}
              />
            )}
          </AndroidAnchoredMenu>
        </View>
      ) : null}
    </>
  );
}
