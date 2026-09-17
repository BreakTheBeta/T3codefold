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
  windowBlurred: boolean;
  windowRefocused: boolean;
  dispose: () => void;
}

// Native focus may leave the renderer before a second automation request starts.
// Keep one snapshot until the whole overlapping group settles so a later request
// cannot mistake the automation-owned host focus for the user's original focus.
let activeSession: PreviewAutomationFocusSession | null = null;

const startFocusSession = (): PreviewAutomationFocusSession => {
  const session: PreviewAutomationFocusSession = {
    activeOperations: 0,
    previouslyFocused: getMeaningfulActiveElement(),
    wasDocumentFocused: isDocumentFocused(),
    userFocusObserved: false,
    pendingUserFocus: false,
    pendingVersion: 0,
    nativeFocusElements: new Set(),
    windowBlurred: false,
    windowRefocused: false,
    dispose: () => {},
  };

  const markPendingUserFocus = (event: Event): void => {
    if (!event.isTrusted) return;
    session.pendingUserFocus = true;
    const version = ++session.pendingVersion;
    queueMicrotask(() => {
      if (session.pendingVersion === version) session.pendingUserFocus = false;
    });
  };
  const onFocusIn = (event: Event): void => {
    const nativeFocusTransfer = session.windowBlurred && session.windowRefocused;
    const target = event.target instanceof HTMLElement ? event.target : null;
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

/**
 * Keeps preview automation from changing focus in the shared renderer.
 */
export async function withPreviewAutomationFocus<T>(operation: () => Promise<T>): Promise<T> {
  const session = activeSession ?? (activeSession = startFocusSession());
  session.activeOperations += 1;

  try {
    return await operation();
  } finally {
    session.activeOperations -= 1;
    if (session.activeOperations === 0) {
      if (activeSession === session) activeSession = null;
      session.dispose();

      const activeElement = getMeaningfulActiveElement();
      const activeFocusIsExpected =
        !activeElement ||
        activeElement === session.previouslyFocused ||
        session.nativeFocusElements.has(activeElement);
      if (
        !session.userFocusObserved &&
        session.wasDocumentFocused &&
        !session.windowBlurred &&
        isDocumentFocused() &&
        session.previouslyFocused?.isConnected &&
        activeFocusIsExpected &&
        activeElement !== session.previouslyFocused
      ) {
        try {
          session.previouslyFocused.focus({ preventScroll: true });
        } catch {
          // Focus restoration is best effort; never mask the automation result.
        }
      }
    }
  }
}
