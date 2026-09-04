export type AdaptiveNavigationAction = "push" | "replace" | "set-params";
export type AdaptiveWorkspaceBackAction = "close-inspector" | "show-sidebar" | "navigate";

const BASE_THREAD_ROUTE_PATTERN = /^\/threads\/[^/]+\/[^/]+\/?$/;

export function isBaseThreadRoute(pathname: string): boolean {
  return BASE_THREAD_ROUTE_PATTERN.test(pathname);
}

export function shouldRestorePrimarySidebar(input: {
  readonly usesSplitView: boolean;
  readonly pathname: string;
}): boolean {
  return input.usesSplitView && input.pathname === "/";
}

export function resolveAdaptiveWorkspaceBackAction(input: {
  readonly auxiliaryPaneVisible: boolean;
  readonly primarySidebarVisible: boolean;
}): AdaptiveWorkspaceBackAction {
  if (input.auxiliaryPaneVisible) return "close-inspector";
  if (!input.primarySidebarVisible) return "show-sidebar";
  return "navigate";
}

/**
 * A persistent sidebar selects a peer destination in place. A compact list
 * drills into a new destination so the native back stack remains available.
 * From Home the selection pushes (never replaces) so Home stays beneath the
 * thread — collapsing back to a compact width keeps a sane back stack.
 */
export function resolveThreadSelectionNavigationAction(input: {
  readonly usesSplitView: boolean;
  readonly pathname: string;
}): AdaptiveNavigationAction {
  if (!input.usesSplitView || input.pathname === "/") {
    return "push";
  }

  return isBaseThreadRoute(input.pathname) ? "set-params" : "replace";
}

/**
 * On regular-width layouts, the file browser and preview occupy one workspace
 * destination. Replacing the browser route keeps a single back step to chat.
 * Compact layouts retain the browser as the previous stack screen.
 */
export function resolveFileSelectionNavigationAction(input: {
  readonly hasPersistentFileInspector: boolean;
}): AdaptiveNavigationAction {
  return input.hasPersistentFileInspector ? "replace" : "push";
}
