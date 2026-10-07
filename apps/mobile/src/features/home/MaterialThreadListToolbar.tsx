import { androidKeyboardFirst, dismissAndroidKeyboard } from "../../lib/android-back";
import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import {
  BackHandler,
  Keyboard,
  type TextInputInstance,
  View,
  type LayoutChangeEvent,
} from "react-native";
import type { MenuAction } from "@react-native-menu/menu";

import { AndroidHeaderIconButton } from "../../components/AndroidScreenHeader";
import { CompactBrandTitle } from "../../components/CompactBrandTitle";
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
  const { scale } = useAndroidControlSizing();
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
              <AndroidAnchoredMenu
                title="Thread options"
                actions={[
                  ...(state.hasConnections
                    ? [
                        {
                          id: "thread-filters",
                          title: "Filter threads",
                          subactions: props.filterActions,
                        },
                      ]
                    : []),
                  ...(compactActions ? [{ id: "pull-requests", title: "Pull requests" }] : []),
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
            </>
          )}
        </View>
      </View>
    </>
  );
}
