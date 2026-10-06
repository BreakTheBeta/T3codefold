import { useEffect, useRef, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { type WorkspacePaneLayout } from "../../lib/layout";
import { type PaneDividerRelease } from "../../lib/foldable-pane-layout";
import { RenderErrorBoundary, RenderFailureView } from "../../components/RenderErrorBoundary";
import { WORKSPACE_PANE_REVEAL_TIMING } from "./workspace-pane-animation";
import { WorkspacePaneDivider } from "./workspace-pane-divider";

/**
 * The trailing inspector column: resize divider + reveal.
 *
 * Rendered by AdaptiveWorkspaceLayout as a SIBLING of the navigator so the
 * native stack header (and its trailing toolbar items) spans only the content
 * pane — the inspector owns its own full-height column, mirroring how each
 * column of a UISplitViewController has its own chrome.
 *
 * Widths change in a single layout pass; only the newly shown pane fades in.
 * A hidden pane keeps its content mounted at its last width (clipped to zero)
 * so files keep their scroll position and a terminal never reports a sliver
 * width to its PTY.
 *
 * Receives the pane layout via props (not the workspace context hook) so this
 * module stays import-cycle-free with AdaptiveWorkspaceLayout.
 */
export function WorkspaceInspectorPane(props: {
  readonly pathname: string;
  readonly panes: WorkspacePaneLayout;
  readonly renderInspector?: () => ReactNode;
  readonly snapWidths?: ReadonlyArray<number>;
  readonly onDividerRelease: (release: PaneDividerRelease) => void;
  readonly onToggleMaximized: () => void;
}) {
  const { panes } = props;
  const width = panes.auxiliaryPaneWidth;
  const visible = props.renderInspector !== undefined && panes.auxiliaryPaneVisible;
  const lastVisibleWidth = useRef(width ?? 0);
  if (visible && width !== null) lastVisibleWidth.current = width;

  // A route replace remounts the screen that owns the inspector; starting at
  // the current visibility keeps an already-open pane from replaying its reveal.
  const reveal = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    reveal.value = visible ? withTiming(1, WORKSPACE_PANE_REVEAL_TIMING) : 0;
  }, [reveal, visible]);
  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateX: (1 - reveal.value) * 16 }],
  }));

  if (props.renderInspector === undefined || width === null) return null;

  return (
    <>
      {visible && panes.auxiliaryPaneWidthRange !== null ? (
        <WorkspacePaneDivider
          accessibilityLabel="Resize detail pane"
          width={width}
          range={panes.auxiliaryPaneWidthRange}
          maximized={panes.auxiliaryPaneMaximized}
          {...(props.snapWidths ? { snapWidths: props.snapWidths } : {})}
          onRelease={props.onDividerRelease}
          onToggleMaximized={props.onToggleMaximized}
        />
      ) : null}
      <View
        className="shrink-0 overflow-hidden"
        accessibilityElementsHidden={!visible}
        collapsable={false}
        importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
        pointerEvents={visible ? "auto" : "none"}
        style={{ width: visible ? width : 0 }}
      >
        <Animated.View
          className="flex-1"
          style={[{ width: visible ? width : lastVisibleWidth.current }, revealStyle]}
        >
          <RenderErrorBoundary
            resetKeys={[props.pathname]}
            renderFallback={(fallback) => (
              <RenderFailureView {...fallback} title="The inspector couldn't be displayed" />
            )}
          >
            <InspectorRenderer render={props.renderInspector} />
          </RenderErrorBoundary>
        </Animated.View>
      </View>
    </>
  );
}

// The render callback must run inside the boundary's child, not while its
// parent constructs the boundary element.
function InspectorRenderer(props: { readonly render?: () => ReactNode }) {
  return <>{props.render?.()}</>;
}
