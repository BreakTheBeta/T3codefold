const getMeaningfulActiveElement = (): HTMLElement | null => {
  if (typeof document === "undefined" || typeof HTMLElement === "undefined") return null;

  const activeElement = document.activeElement;
  if (
    !(activeElement instanceof HTMLElement) ||
    !activeElement.isConnected ||
    activeElement === document.body ||
    activeElement === document.documentElement
  ) {
    return null;
  }
  return activeElement;
};

const isDocumentFocused = (): boolean => {
  if (typeof document === "undefined") return false;
  return typeof document.hasFocus !== "function" || document.hasFocus();
};

interface PreviewAutomationFocusSession {
  activeOperations: number;
  previouslyFocused: HTMLElement | null;
  wasDocumentFocused: boolean;
  userFocusObserved: boolean;
  pendingUserFocus: boolean;
  pendingVersion: number;
  nativeFocusElements: Set<HTMLElement>;
  automationTabs: Set<string>;
  windowBlurred: boolean;
  windowRefocused: boolean;
  restoreFrame: number | null;
  restoreTimeout: ReturnType<typeof setTimeout> | null;
  dispose: () => void;
}

// Native focus may leave the renderer before a second automation request starts.
// Keep one snapshot until the whole overlapping group settles so a later request
// cannot mistake the automation-owned host focus for the user's original focus.
let activeSession: PreviewAutomationFocusSession | null = null;

const isAutomationWebview = (
  session: PreviewAutomationFocusSession,
  element: HTMLElement | null,
): boolean =>
  element?.tagName === "WEBVIEW" &&
  element.dataset.previewTab !== undefined &&
  session.automationTabs.has(element.dataset.previewTab);

const startFocusSession = (): PreviewAutomationFocusSession => {
  const session: PreviewAutomationFocusSession = {
    activeOperations: 0,
    previouslyFocused: getMeaningfulActiveElement(),
    wasDocumentFocused: isDocumentFocused(),
    userFocusObserved: false,
    pendingUserFocus: false,
    pendingVersion: 0,
    nativeFocusElements: new Set(),
    automationTabs: new Set(),
    windowBlurred: false,
    windowRefocused: false,
    restoreFrame: null,
    restoreTimeout: null,
    dispose: () => {},
  };

  const markPendingUserFocus = (event: Event): void => {
    if (!event.isTrusted) return;
    if (session.activeOperations === 0) {
      closeFocusSession(session);
      return;
    }
    session.pendingUserFocus = true;
    const version = ++session.pendingVersion;
    queueMicrotask(() => {
      if (session.pendingVersion === version) session.pendingUserFocus = false;
    });
  };
  const onFocusIn = (event: Event): void => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    // Guest focus is a trusted DOM event too, and need not be preceded by a
    // window blur/focus pair. Only the tabs participating in this operation
    // may bypass the newer-user-focus check.
    const nativeFocusTransfer =
      isAutomationWebview(session, target) || (session.windowBlurred && session.windowRefocused);
    if (nativeFocusTransfer && target) session.nativeFocusElements.add(target);
    if (
      event.isTrusted &&
      (session.pendingUserFocus || (!nativeFocusTransfer && target?.isConnected))
    ) {
      session.userFocusObserved = true;
    }
    session.pendingUserFocus = false;
    session.pendingVersion += 1;
    session.windowBlurred = false;
    session.windowRefocused = false;
  };
  const onWindowBlur = (): void => {
    session.windowBlurred = true;
    session.windowRefocused = false;
  };
  const onWindowFocus = (): void => {
    if (session.windowBlurred) session.windowRefocused = true;
    // Native focus can arrive after the bridge promise resolves. Let the
    // accompanying focusin event identify the restored host control first.
    if (session.restoreFrame !== null) window.cancelAnimationFrame(session.restoreFrame);
    session.restoreFrame = window.requestAnimationFrame(() => {
      session.restoreFrame = null;
      if (activeSession !== session) return;
      session.windowBlurred = false;
      if (session.activeOperations === 0) finishFocusSession(session);
    });
  };

  if (typeof document !== "undefined") {
    document.addEventListener("pointerdown", markPendingUserFocus, true);
    document.addEventListener("keydown", markPendingUserFocus, true);
    document.addEventListener("focusin", onFocusIn, true);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
  }
  session.dispose = () => {
    if (typeof document !== "undefined") {
      document.removeEventListener("pointerdown", markPendingUserFocus, true);
      document.removeEventListener("keydown", markPendingUserFocus, true);
      document.removeEventListener("focusin", onFocusIn, true);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
    }
  };
  return session;
};

const closeFocusSession = (session: PreviewAutomationFocusSession): void => {
  if (activeSession === session) activeSession = null;
  if (session.restoreTimeout !== null) clearTimeout(session.restoreTimeout);
  if (session.restoreFrame !== null) window.cancelAnimationFrame(session.restoreFrame);
  session.dispose();
};

const finishFocusSession = (session: PreviewAutomationFocusSession): void => {
  const activeElement = getMeaningfulActiveElement();
  const automationOwnsFocus = isAutomationWebview(session, activeElement);
  if (
    !session.userFocusObserved &&
    session.wasDocumentFocused &&
    session.previouslyFocused?.isConnected &&
    !automationOwnsFocus &&
    (!isDocumentFocused() || session.windowBlurred)
  ) {
    // Bound the native-event grace period: returning from another application
    // much later must not revive a stale automation focus snapshot.
    session.restoreTimeout ??= setTimeout(() => closeFocusSession(session), 1_000);
    return;
  }
  closeFocusSession(session);
  const activeFocusIsExpected =
    !activeElement ||
    activeElement === session.previouslyFocused ||
    automationOwnsFocus ||
    session.nativeFocusElements.has(activeElement);
  if (
    !session.userFocusObserved &&
    session.wasDocumentFocused &&
    (automationOwnsFocus || (!session.windowBlurred && isDocumentFocused())) &&
    session.previouslyFocused?.isConnected &&
    activeFocusIsExpected &&
    activeElement !== session.previouslyFocused
  ) {
    try {
      // On macOS the guest can retain the focused frame after the native
      // window is restored. DOM focus must leave that webview explicitly;
      // waiting for document.hasFocus() here would wait on our own restore.
      session.previouslyFocused.focus({ preventScroll: true });
    } catch {
      // Focus restoration is best effort; never mask the automation result.
    }
  }
};

/** Keeps preview automation from changing focus in the shared renderer. */
export async function withPreviewAutomationFocus<T>(
  operation: (trackWebview: (runtimeTabId: string) => void) => Promise<T>,
): Promise<T> {
  const session = activeSession ?? (activeSession = startFocusSession());
  if (session.restoreTimeout !== null) {
    clearTimeout(session.restoreTimeout);
    session.restoreTimeout = null;
  }
  session.activeOperations += 1;

  try {
    return await operation((runtimeTabId) => session.automationTabs.add(runtimeTabId));
  } finally {
    session.activeOperations -= 1;
    if (session.activeOperations === 0) finishFocusSession(session);
  }
}
