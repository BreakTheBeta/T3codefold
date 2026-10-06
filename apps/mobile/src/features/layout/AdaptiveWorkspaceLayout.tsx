import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ThreadId, type SidebarProjectGroupingMode } from "@t3tools/contracts";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CommonActions,
  NavigationContext,
  NavigationRouteContext,
  StackActions,
  useNavigation,
} from "@react-navigation/native";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { AsyncResult } from "effect/reactivity";

import {
  deriveLayout,
  deriveWorkspacePaneLayout,
  type FileInspectorPaneLayout,
  type Layout,
  type WorkspacePaneLayout,
} from "../../lib/layout";
import { deriveHingeSnapWidths, type PaneDividerRelease } from "../../lib/foldable-pane-layout";
import { useWindowPosture } from "../../native/T3WindowPosture";
import {
  resolveThreadSelectionNavigationAction,
  shouldRestorePrimarySidebar,
  resolveThreadSelectionOverlayState,
} from "../../lib/adaptive-navigation";
import { scopedThreadKey } from "../../lib/scopedEntities";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import type { Preferences } from "../../persistence/mobile-preferences";
import {
  DEFAULT_MOBILE_PROJECT_GROUPING_SETTINGS,
  resolveMobileProjectGroupingSettings,
} from "../../state/project-grouping";
import {
  parseActiveThreadPath,
  useHardwareKeyboardCommand,
} from "../keyboard/hardwareKeyboardCommands";
import {
  useWorkspaceVimNavigation,
  VimPaneFocusMarker,
} from "../keyboard/useWorkspaceVimNavigation";
import { AndroidHomeFabLayout } from "../home/AndroidHomeFab";
import { HomeListOptionsProvider } from "../home/home-list-options";
import { ThreadNavigationSidebar } from "../threads/ThreadNavigationSidebar";
import { RenderErrorBoundary, RenderFailureView } from "../../components/RenderErrorBoundary";
import { WORKSPACE_PANE_REVEAL_TIMING } from "./workspace-pane-animation";
import { WorkspaceInspectorPane } from "./workspace-inspector-pane";

interface AdaptiveWorkspaceContextValue {
  readonly layout: Layout;
  readonly panes: WorkspacePaneLayout;
  readonly fileInspector: FileInspectorPaneLayout;
  readonly primarySidebarSearchQuery: string;
  readonly selectThread: (thread: EnvironmentThreadShell) => void;
  /**
   * Route screens hand their inspector pane content to the workspace so it
   * renders BESIDE the navigator (outside the native stack header) instead of
   * inside the route. Returns a deactivate callback: the pane animates closed
   * (content kept mounted for the exit transition) unless a newer
   * registration already took over — stale deactivates never clobber it.
   * Prefer useRegisterWorkspaceInspector over calling this directly.
   */
  readonly registerWorkspaceInspector: (render: () => ReactNode) => () => void;
  readonly setPrimarySidebarSearchQuery: (query: string) => void;
  readonly showAuxiliaryPane: () => void;
  readonly hideAuxiliaryPane: () => void;
  readonly toggleAuxiliaryPane: () => void;
  /** Gives the inspector the whole workspace, or returns it beside the chat. */
  readonly setAuxiliaryPaneMaximized: (maximized: boolean) => void;
  readonly toggleAuxiliaryPaneMaximized: () => void;
  readonly togglePrimarySidebar: () => void;
}

const compactLayout = deriveLayout({ width: 0, height: 0 });
const compactPanes = deriveWorkspacePaneLayout({
  layout: compactLayout,
  viewportWidth: 0,
  primarySidebarPreferredVisible: true,
  auxiliaryPanePreferredVisible: true,
});
const compactFileInspector: FileInspectorPaneLayout = { supported: false, width: null };
const AdaptiveWorkspaceContext = createContext<AdaptiveWorkspaceContextValue>({
  layout: compactLayout,
  panes: compactPanes,
  fileInspector: compactFileInspector,
  primarySidebarSearchQuery: "",
  selectThread: () => undefined,
  registerWorkspaceInspector: () => () => undefined,
  setPrimarySidebarSearchQuery: () => undefined,
  showAuxiliaryPane: () => undefined,
  hideAuxiliaryPane: () => undefined,
  toggleAuxiliaryPane: () => undefined,
  setAuxiliaryPaneMaximized: () => undefined,
  toggleAuxiliaryPaneMaximized: () => undefined,
  togglePrimarySidebar: () => undefined,
});

export function useAdaptiveWorkspaceLayout(): AdaptiveWorkspaceContextValue {
  return use(AdaptiveWorkspaceContext);
}

/**
 * Register this screen's inspector pane content with the workspace column.
 *
 * The column renders BESIDE the navigator — outside any screen — so the
 * registering screen's navigation and route contexts are captured here and
 * re-provided around the portal content. Without them, useNavigation/useRoute
 * inside the pane (e.g. GitOverviewSheet via useThreadSelection) throw
 * "Couldn't find a route object".
 *
 * Registration is FOCUS-scoped, driven by navigation events rather than the
 * screen's own render cycle: react-native-screens freezes blurred screens, so
 * a cleanup that depends on the blurred subtree re-rendering never runs and
 * would leak the pane into the next route. Blur deactivates the pane (it
 * animates closed, or is replaced seamlessly when the next route registers in
 * the same commit); focus re-registers it.
 */
export function useRegisterWorkspaceInspector(render: (() => ReactNode) | undefined) {
  const { registerWorkspaceInspector } = useAdaptiveWorkspaceLayout();
  // Raw context values (not the useNavigation/useRoute wrappers) so the
  // portal re-provides exactly what this screen sees.
  const navigation = use(NavigationContext);
  const route = use(NavigationRouteContext);

  const wrappedRender = useMemo(() => {
    if (render === undefined) {
      return undefined;
    }
    return () => (
      <NavigationContext.Provider value={navigation}>
        <NavigationRouteContext.Provider value={route}>{render()}</NavigationRouteContext.Provider>
      </NavigationContext.Provider>
    );
  }, [navigation, render, route]);

  const wrappedRenderRef = useRef(wrappedRender);
  wrappedRenderRef.current = wrappedRender;
  const focusedRef = useRef(false);
  const deactivateRef = useRef<(() => void) | null>(null);

  const syncRegistration = useCallback(() => {
    if (!focusedRef.current || wrappedRenderRef.current === undefined) {
      deactivateRef.current?.();
      return;
    }
    deactivateRef.current = registerWorkspaceInspector(wrappedRenderRef.current);
  }, [registerWorkspaceInspector]);

  // Focus lifecycle. Blur/focus events fire even when the blurred subtree is
  // frozen (events are navigation-driven, renders are not).
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      syncRegistration();
      return () => {
        focusedRef.current = false;
        syncRegistration();
      };
    }, [syncRegistration]),
  );

  // Content changes while focused re-register in place.
  useEffect(() => {
    if (focusedRef.current) {
      syncRegistration();
    }
  }, [syncRegistration, wrappedRender]);

  // Unmount: hand the pane back (owner-guarded, so a route that already
  // took over is unaffected).
  useEffect(
    () => () => {
      deactivateRef.current?.();
      deactivateRef.current = null;
    },
    [],
  );
}

export function AdaptiveWorkspaceLayout(props: {
  readonly children: ReactNode;
  readonly pathname: string;
  readonly workspaceRouteKey: string | undefined;
}) {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  if (!AsyncResult.isSuccess(preferencesResult)) {
    return AsyncResult.isFailure(preferencesResult) ? (
      <AdaptiveWorkspaceLayoutContent
        {...props}
        projectGroupingMode={DEFAULT_MOBILE_PROJECT_GROUPING_SETTINGS.sidebarProjectGroupingMode}
        initialPreferences={{}}
      />
    ) : null;
  }
  const groupingSettings = resolveMobileProjectGroupingSettings(preferencesResult.value);
  return (
    <AdaptiveWorkspaceLayoutContent
      {...props}
      projectGroupingMode={groupingSettings.sidebarProjectGroupingMode}
      initialPreferences={preferencesResult.value}
    />
  );
}

function AdaptiveWorkspaceLayoutContent(props: {
  readonly children: ReactNode;
  readonly pathname: string;
  readonly workspaceRouteKey: string | undefined;
  readonly projectGroupingMode: SidebarProjectGroupingMode;
  /** Pane preferences are read once; the workspace owns them while mounted. */
  readonly initialPreferences: Preferences;
}) {
  const projectGroupingMode = props.projectGroupingMode;
  const window = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const pathname = props.pathname;
  const navigation = useNavigation();
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const layout = useMemo(
    () => deriveLayout({ width: window.width, height: window.height }),
    [window.height, window.width],
  );
  // A landscape navigation bar or display cutout sits beside the panes, not under them.
  const leadingInset = layout.usesSplitView ? safeAreaInsets.left : 0;
  const trailingInset = layout.usesSplitView ? safeAreaInsets.right : 0;
  const width = Math.max(0, window.width - leadingInset - trailingInset);
  const posture = useWindowPosture();
  const hingeSnapWidths = useMemo(
    () =>
      deriveHingeSnapWidths({
        hinges: posture.hinges,
        windowWidth: window.width,
        trailingInset,
      }),
    [posture.hinges, trailingInset, window.width],
  );

  const [primarySidebarPreferredVisible, setPrimarySidebarPreferredVisibleState] = useState(
    props.initialPreferences.workspaceSidebarVisible ?? true,
  );
  const setPrimarySidebarPreferredVisible = useCallback(
    (visible: boolean) => {
      setPrimarySidebarPreferredVisibleState(visible);
      savePreferences({ workspaceSidebarVisible: visible });
    },
    [savePreferences],
  );
  // Pull request review keeps its own sidebar choice, hidden by default: a list beside a PR
  // (or a diff beside its files) needs the whole width. The sidebar button still reveals it.
  const onPullRequestRoute = /^\/pull-requests(?:\/|$)/.test(pathname);
  const [pullRequestSidebarPreferredVisible, setPullRequestSidebarPreferredVisible] =
    useState(false);
  const sidebarPreferredVisible = onPullRequestRoute
    ? pullRequestSidebarPreferredVisible
    : primarySidebarPreferredVisible;
  const setSidebarPreferredVisible = onPullRequestRoute
    ? setPullRequestSidebarPreferredVisible
    : setPrimarySidebarPreferredVisible;
  const showPrimarySidebar = pathname === "/" || sidebarPreferredVisible;
  const [inspectorPreferredVisible, setInspectorPreferredVisible] = useState(true);
  const [inspectorMaximized, setInspectorMaximized] = useState(false);
  const [inspectorPreferredWidth, setInspectorPreferredWidth] = useState<number | null>(
    props.initialPreferences.workspaceInspectorWidth ?? null,
  );
  const [primarySidebarSearchQuery, setPrimarySidebarSearchQuery] = useState("");
  useEffect(() => {
    if (!shouldRestorePrimarySidebar({ usesSplitView: layout.usesSplitView, pathname })) {
      return;
    }
    setPrimarySidebarPreferredVisibleState(true);
    setInspectorPreferredVisible(false);
    setInspectorMaximized(false);
  }, [layout.usesSplitView, pathname]);

  // Wrapped in an object: bare functions in useState would be treated as
  // lazy initializers/updaters.
  const [workspaceInspector, setWorkspaceInspector] = useState<{
    readonly render: () => ReactNode;
  } | null>(null);
  const workspaceInspectorOwner = useRef<symbol | null>(null);
  const registerWorkspaceInspector = useCallback((render: () => ReactNode) => {
    const owner = Symbol("workspace-inspector");
    workspaceInspectorOwner.current = owner;
    setWorkspaceInspector({ render });

    return () => {
      // During a push/replace the outgoing screen deactivates AFTER the
      // incoming screen registered — only the current owner may deactivate.
      if (workspaceInspectorOwner.current !== owner) {
        return;
      }
      workspaceInspectorOwner.current = null;
      setWorkspaceInspector(null);
      // A maximized pane belongs to the route that filled it.
      setInspectorMaximized(false);
    };
  }, []);

  // Until the user picks a width, an unfolded display splits at its fold.
  const inspectorRestingWidth = inspectorPreferredWidth ?? hingeSnapWidths[0];
  const panes = useMemo(
    () =>
      deriveWorkspacePaneLayout({
        layout,
        viewportWidth: width,
        primarySidebarPreferredVisible: showPrimarySidebar,
        auxiliaryPanePreferredVisible: inspectorPreferredVisible,
        auxiliaryPaneRegistered: workspaceInspector !== null,
        auxiliaryPaneMaximized: inspectorMaximized,
        ...(inspectorRestingWidth !== undefined
          ? { auxiliaryPanePreferredWidth: inspectorRestingWidth }
          : {}),
      }),
    [
      inspectorMaximized,
      inspectorPreferredVisible,
      inspectorRestingWidth,
      layout,
      showPrimarySidebar,
      width,
      workspaceInspector,
    ],
  );
  const fileInspector = useMemo<FileInspectorPaneLayout>(
    () => ({ supported: panes.supportsAuxiliaryPane, width: panes.auxiliaryPaneWidth }),
    [panes.auxiliaryPaneWidth, panes.supportsAuxiliaryPane],
  );
  const activeThread = parseActiveThreadPath(pathname);
  const environmentId = activeThread?.environmentId ?? null;
  const threadId = activeThread?.threadId ?? null;
  const selectedThreadKey = useMemo(() => {
    if (environmentId === null || threadId === null) {
      return null;
    }
    try {
      return scopedThreadKey(EnvironmentId.make(environmentId), ThreadId.make(threadId));
    } catch {
      return null;
    }
  }, [environmentId, threadId]);

  const togglePrimarySidebar = useCallback(() => {
    if (pathname === "/") {
      return;
    }
    if (panes.auxiliaryPaneMaximized) {
      setInspectorMaximized(false);
      setSidebarPreferredVisible(true);
      return;
    }
    if (!panes.primarySidebarVisible && panes.primarySidebarSuppressedByAuxiliary) {
      setInspectorPreferredVisible(false);
      setSidebarPreferredVisible(true);
      return;
    }
    setSidebarPreferredVisible(!sidebarPreferredVisible);
  }, [
    panes.auxiliaryPaneMaximized,
    panes.primarySidebarSuppressedByAuxiliary,
    panes.primarySidebarVisible,
    pathname,
    setSidebarPreferredVisible,
    sidebarPreferredVisible,
  ]);
  const revealPrimarySidebar = useCallback(() => {
    setInspectorMaximized(false);
    if (panes.primarySidebarSuppressedByAuxiliary) {
      setInspectorPreferredVisible(false);
    }
    setSidebarPreferredVisible(true);
  }, [panes.primarySidebarSuppressedByAuxiliary, setSidebarPreferredVisible]);
  const handleToggleSidebarCommand = useCallback(() => {
    togglePrimarySidebar();
    return true;
  }, [togglePrimarySidebar]);
  const sidebarCommands = useMemo(
    () => (pathname === "/" ? [] : (["toggleSidebar"] as const)),
    [pathname],
  );
  useHardwareKeyboardCommand(sidebarCommands, handleToggleSidebarCommand);
  const showAuxiliaryPane = useCallback(() => setInspectorPreferredVisible(true), []);
  const hideAuxiliaryPane = useCallback(() => {
    setInspectorPreferredVisible(false);
    setInspectorMaximized(false);
  }, []);
  const toggleAuxiliaryPane = useCallback(() => {
    if (panes.auxiliaryPaneVisible) hideAuxiliaryPane();
    else showAuxiliaryPane();
  }, [hideAuxiliaryPane, panes.auxiliaryPaneVisible, showAuxiliaryPane]);
  const setAuxiliaryPaneMaximized = useCallback((maximized: boolean) => {
    setInspectorMaximized(maximized);
    if (maximized) setInspectorPreferredVisible(true);
  }, []);
  const toggleAuxiliaryPaneMaximized = useCallback(() => {
    setAuxiliaryPaneMaximized(!panes.auxiliaryPaneMaximized);
  }, [panes.auxiliaryPaneMaximized, setAuxiliaryPaneMaximized]);
  const handleDividerRelease = useCallback(
    (release: PaneDividerRelease) => {
      switch (release.kind) {
        case "maximize":
          setAuxiliaryPaneMaximized(true);
          return;
        case "close":
          hideAuxiliaryPane();
          return;
        case "resize":
          setInspectorMaximized(false);
          setInspectorPreferredWidth(release.width);
          savePreferences({ workspaceInspectorWidth: release.width });
          return;
      }
    },
    [hideAuxiliaryPane, savePreferences, setAuxiliaryPaneMaximized],
  );
  const handleOpenFilesCommand = useCallback(() => {
    const activeThread = parseActiveThreadPath(pathname);
    if (!panes.supportsAuxiliaryPane || activeThread === null) {
      return false;
    }
    showAuxiliaryPane();
    if (/\/files(?:\/|$)/.test(pathname)) {
      return true;
    }
    navigation.navigate("ThreadFiles", activeThread);
    return true;
  }, [panes.supportsAuxiliaryPane, pathname, navigation, showAuxiliaryPane]);
  useHardwareKeyboardCommand("files", handleOpenFilesCommand);
  useWorkspaceVimNavigation({
    usesSplitView: layout.usesSplitView,
    panes,
    togglePrimarySidebar,
    toggleAuxiliaryPaneMaximized,
  });
  const handleOpenSettings = useCallback(() => {
    navigation.navigate("SettingsSheet", {
      screen: "SettingsContent",
      params: { screen: "Settings" },
    });
  }, [navigation]);

  const handleOpenPullRequests = useCallback(() => {
    navigation.navigate("PullRequests");
  }, [navigation]);

  const handleStartNewTask = useCallback(() => {
    navigation.navigate("NewTaskSheet", { screen: "NewTask" });
  }, [navigation]);

  // Minted here (root stack navigation) so the sidebar pane stays free of
  // navigation hooks — on iOS it renders inside an independent nav tree.
  const handleOpenEnvironmentSettings = useCallback(() => {
    navigation.navigate("SettingsSheet", {
      screen: "SettingsContent",
      params: { screen: "SettingsEnvironments" },
    });
  }, [navigation]);

  const handleNewThreadOnBranch = useCallback(
    (thread: EnvironmentThreadShell) => {
      navigation.navigate("NewTaskSheet", {
        screen: "NewTaskDraft",
        params: {
          environmentId: String(thread.environmentId),
          projectId: String(thread.projectId),
          branch: thread.branch,
          worktreePath: thread.worktreePath,
        },
      });
    },
    [navigation],
  );

  const handleNewThreadInProject = useCallback(
    (project: EnvironmentProject) => {
      navigation.navigate("NewTaskSheet", {
        screen: "NewTaskDraft",
        params: {
          environmentId: String(project.environmentId),
          projectId: String(project.id),
          title: project.title,
        },
      });
    },
    [navigation],
  );

  const handleSelectThread = useCallback(
    (thread: EnvironmentThreadShell) => {
      const params = {
        environmentId: String(thread.environmentId),
        threadId: String(thread.id),
      };
      const navigationAction = resolveThreadSelectionNavigationAction({
        usesSplitView: layout.usesSplitView,
        pathname,
      });
      const overlayState = resolveThreadSelectionOverlayState({
        state: navigation.getState(),
        workspaceRouteKey: props.workspaceRouteKey,
        action: navigationAction,
        params,
      });
      if (overlayState !== null) {
        hideAuxiliaryPane();
        navigation.dispatch(CommonActions.reset(overlayState));
        return;
      }
      if (navigationAction === "set-params") {
        const nextThreadKey = scopedThreadKey(thread.environmentId, thread.id);
        if (nextThreadKey === selectedThreadKey) {
          return;
        }
        hideAuxiliaryPane();
        navigation.navigate("Thread", params);
        return;
      }
      if (navigationAction === "replace") {
        hideAuxiliaryPane();
        navigation.dispatch(StackActions.replace("Thread", params));
        return;
      }
      navigation.navigate("Thread", params);
    },
    [
      hideAuxiliaryPane,
      layout.usesSplitView,
      pathname,
      navigation,
      selectedThreadKey,
      props.workspaceRouteKey,
    ],
  );

  const contextValue = useMemo(
    () => ({
      layout,
      panes,
      fileInspector,
      primarySidebarSearchQuery,
      selectThread: handleSelectThread,
      registerWorkspaceInspector,
      setPrimarySidebarSearchQuery,
      showAuxiliaryPane,
      hideAuxiliaryPane,
      toggleAuxiliaryPane,
      setAuxiliaryPaneMaximized,
      toggleAuxiliaryPaneMaximized,
      togglePrimarySidebar,
    }),
    [
      fileInspector,
      handleSelectThread,
      hideAuxiliaryPane,
      layout,
      panes,
      primarySidebarSearchQuery,
      registerWorkspaceInspector,
      setAuxiliaryPaneMaximized,
      showAuxiliaryPane,
      toggleAuxiliaryPane,
      toggleAuxiliaryPaneMaximized,
      togglePrimarySidebar,
    ],
  );

  return (
    <HomeListOptionsProvider projectGroupingMode={projectGroupingMode}>
      <AdaptiveWorkspaceContext.Provider value={contextValue}>
        <View
          testID="adaptive-workspace-layout"
          className="flex-1 flex-row"
          style={{ paddingLeft: leadingInset, paddingRight: trailingInset }}
        >
          <WorkspaceSidebarColumn layout={layout} visible={panes.primarySidebarVisible}>
            {(listPaneWidth) => (
              <RenderErrorBoundary
                renderFallback={(fallback) => (
                  <RenderFailureView
                    {...fallback}
                    title="The sidebar couldn't be displayed"
                    exit={{ label: "Open settings", onPress: handleOpenSettings }}
                  />
                )}
              >
                <AndroidHomeFabLayout sidebar onStartNewTask={handleStartNewTask}>
                  <ThreadNavigationSidebar
                    width={listPaneWidth}
                    visible={panes.primarySidebarVisible}
                    onRequestVisibility={revealPrimarySidebar}
                    selectedThreadKey={selectedThreadKey}
                    onOpenSettings={handleOpenSettings}
                    onOpenEnvironmentSettings={handleOpenEnvironmentSettings}
                    onOpenPullRequests={handleOpenPullRequests}
                    onNewThreadInProject={handleNewThreadInProject}
                    onNewThreadOnBranch={handleNewThreadOnBranch}
                    onSelectThread={handleSelectThread}
                    onSearchQueryChange={setPrimarySidebarSearchQuery}
                    searchQuery={primarySidebarSearchQuery}
                  />
                </AndroidHomeFabLayout>
              </RenderErrorBoundary>
            )}
          </WorkspaceSidebarColumn>
          <View
            className={
              Platform.OS === "android" ? "overflow-hidden bg-header" : "overflow-hidden bg-screen"
            }
            collapsable={false}
            accessibilityElementsHidden={panes.auxiliaryPaneMaximized}
            importantForAccessibility={
              panes.auxiliaryPaneMaximized ? "no-hide-descendants" : "auto"
            }
            // A maximized inspector collapses the chat without unmounting it.
            style={panes.auxiliaryPaneMaximized ? { width: 0 } : { flex: 1 }}
          >
            {props.children}
            <VimPaneFocusMarker region="chat" />
          </View>
          <WorkspaceInspectorPane
            pathname={props.pathname}
            panes={panes}
            renderInspector={workspaceInspector?.render}
            snapWidths={hingeSnapWidths}
            onDividerRelease={handleDividerRelease}
            onToggleMaximized={toggleAuxiliaryPaneMaximized}
          />
        </View>
      </AdaptiveWorkspaceContext.Provider>
    </HomeListOptionsProvider>
  );
}

/**
 * The thread sidebar column. Once the window has been wide enough for it, it
 * stays mounted — hidden in compact layouts — so folding and unfolding keeps
 * its scroll position and search instead of rebuilding the list.
 */
function WorkspaceSidebarColumn(props: {
  readonly layout: Layout;
  readonly visible: boolean;
  readonly children: (listPaneWidth: number) => ReactNode;
}) {
  const lastListPaneWidth = useRef<number | null>(null);
  if (props.layout.listPaneWidth !== null) lastListPaneWidth.current = props.layout.listPaneWidth;
  const listPaneWidth = lastListPaneWidth.current;
  const shown = props.visible && props.layout.usesSplitView;

  // Only a toggle reveals; unfolding into a visible sidebar shows it at once.
  const reveal = useSharedValue(1);
  const wasShown = useRef(shown);
  useEffect(() => {
    if (shown && !wasShown.current) {
      reveal.value = 0;
      reveal.value = withTiming(1, WORKSPACE_PANE_REVEAL_TIMING);
    }
    wasShown.current = shown;
  }, [reveal, shown]);
  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateX: (reveal.value - 1) * 16 }],
  }));

  if (listPaneWidth === null) return null;

  return (
    <View
      className="self-stretch overflow-hidden"
      accessibilityElementsHidden={!shown}
      collapsable={false}
      importantForAccessibility={shown ? "auto" : "no-hide-descendants"}
      pointerEvents={shown ? "auto" : "none"}
      style={
        props.layout.usesSplitView ? { width: shown ? listPaneWidth : 0 } : { display: "none" }
      }
    >
      <Animated.View className="flex-1" style={[{ width: listPaneWidth }, revealStyle]}>
        {props.children(listPaneWidth)}
      </Animated.View>
      <VimPaneFocusMarker region="sidebar" />
    </View>
  );
}
