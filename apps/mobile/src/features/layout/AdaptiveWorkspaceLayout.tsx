import { WindowHingeContext } from "../../native/window-hinge-context";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { AdaptiveWorkspaceContext, useAdaptiveWorkspaceLayout } from "./adaptive-workspace-context";
import { threadSelectionDeferral } from "./deferred-navigation";
import { uuidv4 } from "../../lib/uuid";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ThreadId, type SidebarProjectGroupingMode } from "@t3tools/contracts";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useFocusEffect } from "@react-navigation/native";
import { NavigationContext, NavigationRouteContext, useNavigation } from "@react-navigation/native";
import {
  use,
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Keyboard, Platform, View } from "react-native";
import { KeyboardController, useKeyboardState } from "react-native-keyboard-controller";
import { AsyncResult } from "effect/reactivity";

import {
  isWorkspaceListPath,
  type FileInspectorPaneLayout,
  type WorkspaceAuxiliaryPaneRole,
} from "../../lib/layout";
import {
  deriveFoldWorkspacePaneLayout,
  type PaneDividerRelease,
} from "../../lib/foldable-pane-layout";
import { shouldRestorePrimarySidebar } from "../../lib/fold-workspace-navigation";
import { scopedThreadKey } from "../../lib/scopedEntities";
import type { Preferences } from "../../persistence/mobile-preferences";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { appAtomRegistry } from "../../state/atom-registry";
import { useProjects } from "../../state/entities";
import { useThreadCwd } from "../../state/use-selected-thread-worktree";
import { environmentThreadShells } from "../../state/threads";
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
import { AndroidWorkspaceSidebar } from "../workspace/AndroidWorkspaceSidebar";
import { AndroidWorkspaceNavigation } from "../workspace/AndroidWorkspaceNavigation";
import {
  selectWorkspaceDetail,
  type WorkspaceDetail,
  type WorkspaceDetailSheet,
} from "../workspace/workspace-detail-selection";
import { startOpeningDetail } from "../workspace/useSelectWorkspaceDetail";
import { useWorkspaceTabs } from "../workspace/WorkspaceTabsContext";
import { HomeListOptionsProvider } from "../home/home-list-options";
import { newTaskDestination } from "../threads/new-task-project-selection";
import { usePendingTaskListActions } from "../home/usePendingTaskListActions";
import { ThreadNavigationSidebar } from "../threads/ThreadNavigationSidebar";
import { useOpenThreadPullRequests } from "../threads/use-open-thread-pull-requests";
import { RenderErrorBoundary, RenderFailureView } from "../../components/RenderErrorBoundary";
import { useWorkspaceThumbActions, WorkspaceThumbNavigation } from "./workspace-thumb-navigation";
import { FoldWorkspaceInspectorPane } from "./fold-workspace-inspector-pane";
import { WorkspaceSidebarColumn } from "./fold-workspace-sidebar-column";
import {
  NativeWorkspaceModeContext,
  NativeWorkspaceInspectorContext,
} from "../../native/v5-workspace-context";
import { useFoldWorkspaceGeometry } from "./fold-workspace-geometry";

import { useAndroidWorkspaceRoot } from "../workspace/AndroidWorkspaceTabsProvider";
import { openSettings } from "../settings/settings-navigation";
import { dispatchRootStackReset, rootStackState } from "../../lib/root-stack-reset";
import {
  currentWorkspaceSelections,
  workspaceSelectionCheck,
} from "../workspace/workspace-selection-store";
import {
  workspaceTabColumns,
  workspaceTabNavigationState,
} from "../workspace/workspace-tab-navigation";
import type { WorkspaceTab } from "../workspace/workspace-tabs-state";
import { workspaceRoutesOf } from "./workspace-overlay-routes";
import { SettingsWorkspaceLayout } from "../settings/SettingsWorkspaceLayout";

export { useAdaptiveWorkspaceLayout };

export function useAdaptiveWorkspacePaneRole(role: WorkspaceAuxiliaryPaneRole) {
  const { activateAuxiliaryPaneRole } = useAdaptiveWorkspaceLayout();

  useFocusEffect(
    useCallback(() => activateAuxiliaryPaneRole(role), [activateAuxiliaryPaneRole, role]),
  );
}

// Fold's workspace has one inspector pane whose content each route registers, so upstream's
// auxiliary pane roles are accepted and ignored.
const activateAuxiliaryPaneRole = () => () => undefined;

/** Capture inspector navigation contexts. Register on focus events because frozen blurred screens may never clean up. */
export function useRegisterWorkspaceInspector(render: (() => ReactNode) | undefined) {
  const { registerWorkspaceInspector } = useAdaptiveWorkspaceLayout();
  const navigation = use(NavigationContext);
  const route = use(NavigationRouteContext);

  const wrappedRender = (() => {
    if (render === undefined) {
      return undefined;
    }
    return () => (
      <NavigationContext.Provider value={navigation}>
        <NavigationRouteContext.Provider value={route}>{render()}</NavigationRouteContext.Provider>
      </NavigationContext.Provider>
    );
  })();

  const focusedRef = useRef(false);
  const deactivateRef = useRef<(() => void) | null>(null);

  // An effect event reads this render's pane without making the focus
  // subscription re-run (and deactivate) every time the pane closure changes.
  const syncRegistration = useEffectEvent(() => {
    if (!focusedRef.current || wrappedRender === undefined) {
      deactivateRef.current?.();
      return;
    }
    deactivateRef.current = registerWorkspaceInspector(wrappedRender);
  });

  useFocusEffect(() => {
    focusedRef.current = true;
    syncRegistration();
    return () => {
      focusedRef.current = false;
      syncRegistration();
    };
  });

  useEffect(() => {
    if (focusedRef.current) {
      syncRegistration();
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- The effect event reads the new renderer without re-subscribing to focus.
  }, [wrappedRender]);

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
  readonly workspaceRouteName: string | undefined;
  readonly workspaceRouteKeys: ReadonlyArray<string>;
  readonly selectedPullRequestKey?: string | null;
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
  readonly selectedPullRequestKey?: string | null;
  readonly workspaceRouteName: string | undefined;
  readonly workspaceRouteKeys: ReadonlyArray<string>;
  readonly projectGroupingMode: SidebarProjectGroupingMode;
  /** Pane preferences are read once; the workspace owns them while mounted. */
  readonly initialPreferences: Preferences;
}) {
  const projectGroupingMode = props.projectGroupingMode;
  const nativeWorkspace = use(NativeWorkspaceModeContext);
  const pathname = props.pathname;
  const workspace = useWorkspaceTabs();
  // Settings and Usage occupy the workspace rather than a list/detail pair.
  const androidSettingsOpen = useAndroidWorkspaceRoot()?.settingsOpen ?? false;
  const safeAreaInsets = useSafeAreaInsets();
  const workspacePage =
    Platform.OS === "android" && (androidSettingsOpen || workspace?.state.selectedTab === "usage");
  const navigation = useNavigation();
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const {
    layout,
    width,
    leadingInset,
    trailingInset,
    foldRegions,
    windowHinge,
    tabletopTopHeight,
    hingeSnapWidths,
    workspaceView,
    onWorkspaceLayout,
  } = useFoldWorkspaceGeometry();

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
  // The overlay sidebar closes when a page opens from it, and stays open on a list or on the
  // page a tab switch opened (`keepOpenFor`, set by that switch).
  const [overlaySidebar, setOverlaySidebar] = useState({
    active: layout.primarySidebarOverlaysContent,
    pathname,
    visible: isWorkspaceListPath(pathname),
    keepOpenFor: null as string | null,
  });
  if (
    overlaySidebar.active !== layout.primarySidebarOverlaysContent ||
    (overlaySidebar.active && overlaySidebar.pathname !== pathname)
  ) {
    setOverlaySidebar({
      active: layout.primarySidebarOverlaysContent,
      pathname,
      visible:
        isWorkspaceListPath(pathname) ||
        (overlaySidebar.keepOpenFor !== null &&
          overlaySidebar.keepOpenFor === props.workspaceRouteKey),
      keepOpenFor: null,
    });
  }
  const preferredSidebarVisible = layout.primarySidebarOverlaysContent
    ? overlaySidebar.visible
    : sidebarPreferredVisible;
  const [composerEditing, setComposerEditing] = useState(false);
  const softKeyboardVisible = useKeyboardState((state) => state.isVisible);
  // Hardware keyboard focus leaves room for the sidebar; Android Back hides the soft keyboard
  // without blurring the editor. Keep the saved sidebar choice through both transitions.
  const composerKeyboardActive = useDeferredValue(
    Platform.OS === "android" && layout.usesSplitView && composerEditing && softKeyboardVisible,
  );
  const showPrimarySidebar =
    !workspacePage && (pathname === "/" || (preferredSidebarVisible && !composerKeyboardActive));
  const [inspectorPreferredVisible, setInspectorPreferredVisible] = useState(true);
  const [inspectorMaximized, setInspectorMaximized] = useState(false);
  const inspectorRatios = props.initialPreferences.workspaceInspectorRatios ?? {};
  useEffect(() => {
    const previousWidth = props.initialPreferences.workspaceInspectorWidth;
    if (!layout.usesSplitView || previousWidth === undefined) return;
    savePreferences({
      transform: (current) => ({
        workspaceInspectorWidth: undefined,
        workspaceInspectorRatios: {
          [foldRegions.presetKey]: Math.min(0.95, Math.max(0.05, previousWidth / width)),
          ...current.workspaceInspectorRatios,
        },
      }),
    });
  }, [
    props.initialPreferences.workspaceInspectorWidth,
    layout.usesSplitView,
    foldRegions.presetKey,
    savePreferences,
    width,
  ]);
  const [primarySidebarSearchQuery, setPrimarySidebarSearchQuery] = useState("");
  const sidebarRoute = `${layout.usesSplitView}:${pathname}`;
  const [restoredSidebarRoute, setRestoredSidebarRoute] = useState<string | null>(null);
  if (restoredSidebarRoute !== sidebarRoute) {
    setRestoredSidebarRoute(sidebarRoute);
    if (shouldRestorePrimarySidebar({ usesSplitView: layout.usesSplitView, pathname })) {
      setPrimarySidebarPreferredVisibleState(true);
      setInspectorPreferredVisible(false);
      setInspectorMaximized(false);
    }
  }

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
  const inspectorPreferredRatio = inspectorRatios[foldRegions.presetKey];
  const inspectorRestingWidth =
    foldRegions.vertical?.trailingWidth ??
    (inspectorPreferredRatio !== undefined ? inspectorPreferredRatio * width : hingeSnapWidths[0]);
  const effectiveLayout = useMemo(
    () =>
      foldRegions.vertical
        ? { ...layout, listPaneWidth: foldRegions.vertical.leadingWidth }
        : layout,
    [foldRegions.vertical, layout],
  );
  const panes = useMemo(() => {
    const derived = deriveFoldWorkspacePaneLayout({
      layout: effectiveLayout,
      viewportWidth: width - (foldRegions.vertical?.gap ?? 0),
      primarySidebarPreferredVisible:
        showPrimarySidebar &&
        tabletopTopHeight === null &&
        !(foldRegions.vertical && inspectorPreferredVisible && workspaceInspector !== null),
      auxiliaryPanePreferredVisible: !workspacePage && inspectorPreferredVisible,
      auxiliaryPaneRegistered: workspaceInspector !== null,
      auxiliaryPaneMaximized: inspectorMaximized,
      ...(inspectorRestingWidth !== undefined
        ? { auxiliaryPanePreferredWidth: inspectorRestingWidth }
        : {}),
    });
    return foldRegions.vertical && derived.auxiliaryPaneMaximized
      ? { ...derived, auxiliaryPaneWidth: foldRegions.vertical.trailingWidth }
      : derived;
  }, [
    inspectorMaximized,
    workspacePage,
    inspectorPreferredVisible,
    inspectorRestingWidth,
    effectiveLayout,
    foldRegions.vertical,
    tabletopTopHeight,
    showPrimarySidebar,
    width,
    workspaceInspector,
  ]);
  const fileInspector = useMemo<FileInspectorPaneLayout>(
    () => ({ supported: panes.supportsAuxiliaryPane, width: panes.auxiliaryPaneWidth }),
    [panes.auxiliaryPaneWidth, panes.supportsAuxiliaryPane],
  );
  const activeThread = useMemo(() => parseActiveThreadPath(pathname), [pathname]);
  const environmentId = activeThread?.environmentId ?? null;
  const threadId = activeThread?.threadId ?? null;
  const selectedThreadRef = (() => {
    if (environmentId === null || threadId === null) {
      return null;
    }
    try {
      return {
        environmentId: EnvironmentId.make(environmentId),
        threadId: ThreadId.make(threadId),
      };
    } catch {
      return null;
    }
  })();
  const selectedThreadKey =
    selectedThreadRef === null
      ? null
      : scopedThreadKey(selectedThreadRef.environmentId, selectedThreadRef.threadId);
  const isFilesRoute = props.workspaceRouteName === "ThreadFiles";
  // Same resolution the Files screen uses: without a cwd it shows "Files unavailable" and
  // registers no inspector, so revealing would only hide the sidebar beside that screen.
  const filesCwd = useThreadCwd(isFilesRoute && fileInspector.supported ? selectedThreadRef : null);
  // Opening a review or the files route reveals its inspector once per route and thread.
  // Routes still on the stack remember their reveal, so going back to one keeps the user's choice.
  const revealsInspector =
    props.workspaceRouteName === "ThreadReview" || (isFilesRoute && filesCwd !== null);
  const [revealedInspectors, setRevealedInspectors] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  if (
    revealsInspector &&
    props.workspaceRouteKey !== undefined &&
    selectedThreadKey !== null &&
    revealedInspectors.get(props.workspaceRouteKey) !== selectedThreadKey
  ) {
    const next = new Map<string, string>();
    for (const routeKey of props.workspaceRouteKeys) {
      const revealedThreadKey = revealedInspectors.get(routeKey);
      if (revealedThreadKey !== undefined) {
        next.set(routeKey, revealedThreadKey);
      }
    }
    next.set(props.workspaceRouteKey, selectedThreadKey);
    setRevealedInspectors(next);
    setInspectorPreferredVisible(true);
  }
  const setPrimarySidebarVisible = useCallback(
    (visible: boolean) => {
      if (layout.primarySidebarOverlaysContent) {
        setOverlaySidebar((current) => ({ ...current, visible }));
      } else {
        setSidebarPreferredVisible(visible);
      }
    },
    [layout.primarySidebarOverlaysContent, setSidebarPreferredVisible],
  );
  const togglePrimarySidebar = useCallback(() => {
    if (composerKeyboardActive) {
      void KeyboardController.dismiss();
      if (preferredSidebarVisible) return;
    }
    if (tabletopTopHeight !== null && pathname !== "/") {
      navigation.navigate("Home");
      return;
    }
    if (foldRegions.vertical && panes.auxiliaryPaneVisible) {
      setInspectorPreferredVisible(false);
      setInspectorMaximized(false);
      setSidebarPreferredVisible(true);
      return;
    }
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
    setPrimarySidebarVisible(!preferredSidebarVisible);
  }, [
    composerKeyboardActive,
    tabletopTopHeight,
    foldRegions.vertical,
    panes.auxiliaryPaneVisible,
    navigation,
    panes.auxiliaryPaneMaximized,
    panes.primarySidebarSuppressedByAuxiliary,
    panes.primarySidebarVisible,
    pathname,
    preferredSidebarVisible,
    setPrimarySidebarVisible,
    setSidebarPreferredVisible,
  ]);
  const revealPrimarySidebar = useCallback(() => {
    if (composerKeyboardActive) void KeyboardController.dismiss();
    setInspectorMaximized(false);
    if (panes.primarySidebarSuppressedByAuxiliary) {
      setInspectorPreferredVisible(false);
    }
    setPrimarySidebarVisible(true);
  }, [composerKeyboardActive, panes.primarySidebarSuppressedByAuxiliary, setPrimarySidebarVisible]);
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
          const ratio = release.width / Math.max(1, width);
          savePreferences({
            transform: (current) => ({
              workspaceInspectorRatios: {
                ...current.workspaceInspectorRatios,
                [foldRegions.presetKey]: ratio,
              },
            }),
          });
          return;
      }
    },
    [foldRegions.presetKey, hideAuxiliaryPane, savePreferences, setAuxiliaryPaneMaximized, width],
  );
  const setAuxiliaryPaneWidth = useCallback(
    (nextWidth: number) => handleDividerRelease({ kind: "resize", width: nextWidth }),
    [handleDividerRelease],
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
  /**
   * The one way to open a workspace tab: replaces the workspace with the tab's list and, when the
   * window has columns, the page it last showed, keeping any sheet on top. An overlay sidebar
   * stays open over that page.
   */
  const openWorkspaceTab = useCallback(
    (tab: WorkspaceTab | "settings", options?: { readonly columns?: boolean }) => {
      const state = rootStackState(navigation);
      if (!state) return;
      const { workspace: routes, overlays } = workspaceRoutesOf(
        state.routes.slice(0, state.index + 1),
      );
      const next = workspaceTabNavigationState(
        { ...state, routes },
        tab,
        currentWorkspaceSelections(),
        {
          columns: workspaceTabColumns(Platform.OS, tab, options?.columns ?? layout.usesSplitView),
          check: workspaceSelectionCheck,
          overlays,
        },
      );
      if (layout.primarySidebarOverlaysContent) {
        const opened = next.routes.at(-1 - overlays.length)?.key ?? null;
        setOverlaySidebar((current) => ({ ...current, visible: true, keepOpenFor: opened }));
      }
      dispatchRootStackReset(navigation, state, next);
    },
    [layout.primarySidebarOverlaysContent, layout.usesSplitView, navigation],
  );
  const handleOpenSettings = useCallback(() => openWorkspaceTab("settings"), [openWorkspaceTab]);

  // Fold's sidebar switcher opens PRs like useSelectWorkspaceTab, which can't be used here.
  const handleOpenPullRequests = useCallback(() => {
    if (!workspace) return navigation.navigate("PullRequests");
    openWorkspaceTab("pullRequests");
    workspace.dispatch({ type: "select", tab: "pullRequests" });
  }, [navigation, openWorkspaceTab, workspace]);

  /** The one way to show a page in the detail column; see `selectWorkspaceDetail`. */
  const handleSelectDetail = useCallback(
    (detail: WorkspaceDetail, sheet?: WorkspaceDetailSheet) => {
      threadSelectionDeferral.run(() => {
        if (Platform.OS === "android") Keyboard.dismiss();
        // Re-selecting the open thread keeps Fold's inspector pane beside it.
        const params = detail.params as { environmentId?: unknown; threadId?: unknown } | undefined;
        const reselecting =
          detail.name === "Thread" &&
          selectedThreadKey !== null &&
          typeof params?.environmentId === "string" &&
          typeof params.threadId === "string" &&
          scopedThreadKey(
            EnvironmentId.make(params.environmentId),
            ThreadId.make(params.threadId),
          ) === selectedThreadKey;
        if (!reselecting) hideAuxiliaryPane();
        if (layout.primarySidebarOverlaysContent) setPrimarySidebarVisible(false);
        workspace?.dispatch({
          type: "select",
          tab: detail.name === "Thread" ? "threads" : "pullRequests",
        });
        startOpeningDetail(detail);
        navigation.dispatch(selectWorkspaceDetail(detail, sheet));
      });
    },
    [
      hideAuxiliaryPane,
      layout.primarySidebarOverlaysContent,
      navigation,
      selectedThreadKey,
      setPrimarySidebarVisible,
      workspace,
    ],
  );
  const handleSelectThreadRoute = useCallback(
    (params: ReactNavigation.RootParamList["Thread"]) =>
      handleSelectDetail({ name: "Thread", params }),
    [handleSelectDetail],
  );

  const projects = useProjects();
  const compactAndroidSettings =
    Platform.OS === "android" && androidSettingsOpen && !layout.usesSplitView;
  // Reads the open page when pressed, so the layout context doesn't change on every navigation.
  const handleStartNewTask = useCallback(() => {
    const state = rootStackState(navigation);
    const currentRoute = workspaceRoutesOf(
      state?.routes.slice(0, state.index + 1) ?? [],
    ).workspace.at(-1);
    const params =
      currentRoute?.name === "Thread"
        ? (currentRoute.params as ReactNavigation.RootParamList["Thread"])
        : undefined;
    const first = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] : value;
    const environmentId = first(params?.environmentId);
    const threadId = first(params?.threadId);
    // The full index, not the sidebar list: subagent and archived threads are current threads too.
    const projectId =
      environmentId && threadId
        ? appAtomRegistry
            .get(
              environmentThreadShells.environmentThreadIndexAtom(EnvironmentId.make(environmentId)),
            )
            .get(ThreadId.make(threadId))?.projectId
        : undefined;
    const preferences = appAtomRegistry.get(mobilePreferencesAtom);
    const saved = AsyncResult.isSuccess(preferences) ? preferences.value : undefined;
    handleSelectThreadRoute(
      newTaskDestination({
        projects,
        requestId: uuidv4(),
        useLastProject: saved?.useLastProjectForNewThreads,
        currentProject: environmentId && projectId ? { environmentId, projectId } : undefined,
        lastProject: saved?.lastThreadProject,
      }),
    );
  }, [handleSelectThreadRoute, navigation, projects]);

  useHardwareKeyboardCommand("newTask", () => {
    handleStartNewTask();
    return true;
  });

  // Create at root: the iOS sidebar renders in an independent navigation tree.
  const handleOpenEnvironmentSettings = useCallback(() => {
    openSettings(navigation, "SettingsEnvironments");
  }, [navigation]);

  const handleOpenThreadPullRequests = useOpenThreadPullRequests();
  const { openPendingTask: handleOpenPendingTask } =
    usePendingTaskListActions(handleSelectThreadRoute);

  const handleNewThreadOnBranch = useCallback(
    (thread: EnvironmentThreadShell) => {
      handleSelectThreadRoute({
        draft: {
          requestId: uuidv4(),
          environmentId: String(thread.environmentId),
          projectId: String(thread.projectId),
          branch: thread.branch,
          worktreePath: thread.worktreePath,
        },
      });
    },
    [handleSelectThreadRoute],
  );

  const handleNewThreadInProject = useCallback(
    (project: EnvironmentProject) => {
      handleSelectThreadRoute({
        draft: {
          requestId: uuidv4(),
          environmentId: String(project.environmentId),
          projectId: String(project.id),
          title: project.title,
        },
      });
    },
    [handleSelectThreadRoute],
  );

  const handleSelectThread = useCallback(
    (thread: EnvironmentThreadShell) => {
      handleSelectThreadRoute({
        environmentId: String(thread.environmentId),
        threadId: String(thread.id),
      });
    },
    [handleSelectThreadRoute],
  );

  const handleThumbAction = useWorkspaceThumbActions({
    activeThread,
    usesSplitView: layout.usesSplitView,
    supportsAuxiliaryPane: panes.supportsAuxiliaryPane,
    togglePrimarySidebar,
    toggleAuxiliaryPane,
    hideAuxiliaryPane,
  });

  const contextValue = useMemo(
    () => ({
      tabletopTopHeight,
      tabletopHingeTop: foldRegions.tabletop?.top ?? null,
      tabletopHingeHeight: foldRegions.tabletop?.gap ?? 0,
      layout,
      panes,
      fileInspector,
      primarySidebarSearchQuery,
      startNewTask: handleStartNewTask,
      deferThreadSelectionUntil: threadSelectionDeferral.waitFor,
      selectDetail: handleSelectDetail,
      activateAuxiliaryPaneRole,
      registerWorkspaceInspector,
      setPrimarySidebarSearchQuery,
      showAuxiliaryPane,
      hideAuxiliaryPane,
      toggleAuxiliaryPane,
      setAuxiliaryPaneMaximized,
      toggleAuxiliaryPaneMaximized,
      togglePrimarySidebar,
      setPrimarySidebarVisible,
      openWorkspaceTab,
      // Fold's inspector resizes through its divider and remembers a ratio per fold preset.
      setAuxiliaryPaneWidth,
      composerKeyboardActive,
      // Fold never runs the native iOS split that rotates the sidebar overlay.
      sidebarByOrientation: null,
      setComposerEditing,
    }),
    [
      handleSelectDetail,
      handleStartNewTask,
      openWorkspaceTab,
      setAuxiliaryPaneWidth,
      setPrimarySidebarVisible,
      composerKeyboardActive,
      tabletopTopHeight,
      foldRegions.tabletop?.top,
      foldRegions.tabletop?.gap,
      fileInspector,
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

  // A fold or Duo division separates the sidebar from the chat.
  const sidebarGap = foldRegions.vertical?.gap ?? effectiveLayout.listPaneGap ?? 0;

  if (nativeWorkspace) {
    return (
      <HomeListOptionsProvider
        projectGroupingMode={projectGroupingMode}
        savedFilters={props.initialPreferences.threadListFilters}
      >
        <AdaptiveWorkspaceContext value={contextValue}>
          <NativeWorkspaceInspectorContext
            value={{ render: workspaceInspector?.render, visible: panes.auxiliaryPaneVisible }}
          >
            {props.children}
          </NativeWorkspaceInspectorContext>
        </AdaptiveWorkspaceContext>
      </HomeListOptionsProvider>
    );
  }
  return (
    <HomeListOptionsProvider
      projectGroupingMode={projectGroupingMode}
      savedFilters={props.initialPreferences.threadListFilters}
    >
      <AdaptiveWorkspaceContext.Provider value={contextValue}>
        <WindowHingeContext value={windowHinge}>
          <View
            ref={workspaceView}
            onLayout={onWorkspaceLayout}
            testID="adaptive-workspace-layout"
            className={Platform.OS === "android" ? "flex-1 flex-row bg-header" : "flex-1 flex-row"}
            style={{ paddingLeft: leadingInset, paddingRight: trailingInset }}
          >
            <WorkspaceSidebarColumn layout={effectiveLayout} visible={panes.primarySidebarVisible}>
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
                    <AndroidWorkspaceSidebar
                      onRequestVisibility={revealPrimarySidebar}
                      selectedPullRequestKey={props.selectedPullRequestKey ?? null}
                    >
                      <ThreadNavigationSidebar
                        width={listPaneWidth}
                        visible={panes.primarySidebarVisible}
                        onRequestVisibility={revealPrimarySidebar}
                        selectedThreadKey={selectedThreadKey}
                        onOpenSettings={handleOpenSettings}
                        onOpenEnvironmentSettings={handleOpenEnvironmentSettings}
                        onOpenPullRequests={handleOpenPullRequests}
                        onOpenThreadPullRequests={handleOpenThreadPullRequests}
                        onNewThreadInProject={handleNewThreadInProject}
                        onNewThreadOnBranch={handleNewThreadOnBranch}
                        onOpenPendingTask={handleOpenPendingTask}
                        onSelectThread={handleSelectThread}
                        onSearchQueryChange={setPrimarySidebarSearchQuery}
                        searchQuery={primarySidebarSearchQuery}
                      />
                    </AndroidWorkspaceSidebar>
                  </AndroidHomeFabLayout>
                </RenderErrorBoundary>
              )}
            </WorkspaceSidebarColumn>
            {sidebarGap > 0 && panes.primarySidebarVisible ? (
              <View style={{ width: sidebarGap }} />
            ) : null}
            <View
              className={
                Platform.OS === "android"
                  ? "overflow-hidden bg-header"
                  : "overflow-hidden bg-screen"
              }
              collapsable={false}
              accessibilityElementsHidden={panes.auxiliaryPaneMaximized}
              importantForAccessibility={
                panes.auxiliaryPaneMaximized ? "no-hide-descendants" : "auto"
              }
              // A maximized inspector collapses the chat without unmounting it.
              style={
                panes.auxiliaryPaneMaximized
                  ? { width: 0 }
                  : foldRegions.vertical &&
                      !panes.primarySidebarVisible &&
                      !panes.auxiliaryPaneVisible
                    ? { width: foldRegions.vertical.leadingWidth }
                    : { flex: 1 }
              }
            >
              {/* Compact Settings keeps the bottom navigation under all of its pages. */}
              <SafeAreaInsetsContext
                value={compactAndroidSettings ? { ...safeAreaInsets, bottom: 0 } : safeAreaInsets}
              >
                <View className="flex-1">
                  <SettingsWorkspaceLayout>{props.children}</SettingsWorkspaceLayout>
                </View>
              </SafeAreaInsetsContext>
              {compactAndroidSettings ? (
                <AndroidWorkspaceNavigation onNewThread={handleStartNewTask} />
              ) : null}
              {Platform.OS === "android" &&
              props.initialPreferences.workspaceThumbGesturesEnabled === true ? (
                <WorkspaceThumbNavigation onAction={handleThumbAction} />
              ) : null}
              <VimPaneFocusMarker region="chat" />
            </View>
            {foldRegions.vertical && panes.auxiliaryPaneVisible ? (
              <View
                style={{
                  width:
                    foldRegions.vertical.gap +
                    (panes.auxiliaryPaneMaximized ? foldRegions.vertical.leadingWidth : 0),
                }}
              />
            ) : null}
            <FoldWorkspaceInspectorPane
              topRegionHeight={tabletopTopHeight}
              fixedDivider={foldRegions.vertical !== null}
              pathname={props.pathname}
              panes={panes}
              renderInspector={workspaceInspector?.render}
              snapWidths={hingeSnapWidths}
              onDividerRelease={handleDividerRelease}
              onToggleMaximized={toggleAuxiliaryPaneMaximized}
            />
          </View>
        </WindowHingeContext>
      </AdaptiveWorkspaceContext.Provider>
    </HomeListOptionsProvider>
  );
}
