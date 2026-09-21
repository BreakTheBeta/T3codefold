import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { withPreviewAutomationFocus } from "./previewAutomationFocus";

class MockHTMLElement {
  isConnected = true;
  tagName = "DIV";
  dataset: { previewTab?: string } = {};
  readonly focus = vi.fn((_options?: FocusOptions) => {
    setActiveElement(this);
  });
}

const setActiveElement = (activeElement: MockHTMLElement | null): void => {
  (globalThis.document as unknown as { activeElement: MockHTMLElement | null }).activeElement =
    activeElement;
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const setupDocument = (activeElement: MockHTMLElement | null, focused = true) => {
  const body = new MockHTMLElement();
  const documentElement = new MockHTMLElement();
  let documentFocused = focused;
  const documentListeners = new Map<string, Set<(event: Event) => void>>();
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const windowListeners = new Map<string, Set<() => void>>();
  vi.stubGlobal("HTMLElement", MockHTMLElement);
  vi.stubGlobal("document", {
    activeElement,
    body,
    documentElement,
    hasFocus: () => documentFocused,
    addEventListener: (type: string, listener: (event: Event) => void) => {
      const listeners = documentListeners.get(type) ?? new Set();
      listeners.add(listener);
      documentListeners.set(type, listeners);
    },
    removeEventListener: (type: string, listener: (event: Event) => void) => {
      documentListeners.get(type)?.delete(listener);
    },
  });
  vi.stubGlobal("window", {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    addEventListener: (type: string, listener: () => void) => {
      const listeners = windowListeners.get(type) ?? new Set();
      listeners.add(listener);
      windowListeners.set(type, listeners);
    },
    removeEventListener: (type: string, listener: () => void) => {
      windowListeners.get(type)?.delete(listener);
    },
  });
  return {
    flushFrames: () => {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(0);
    },
    body,
    setDocumentFocused: (value: boolean) => {
      documentFocused = value;
    },
    dispatchDocument: (type: string, target: MockHTMLElement, isTrusted = true) => {
      for (const listener of documentListeners.get(type) ?? []) {
        listener({ target, isTrusted } as unknown as Event);
      }
    },
    dispatchWindow: (type: string) => {
      for (const listener of windowListeners.get(type) ?? []) listener();
    },
  };
};

describe("withPreviewAutomationFocus", () => {
  it.each([false, true])(
    "takes focus back from the automation webview without waiting for native refocus (focusin=%s)",
    async (withFocusIn) => {
      const composer = new MockHTMLElement();
      const guest = new MockHTMLElement();
      guest.tagName = "WEBVIEW";
      guest.dataset.previewTab = "background-tab";
      const { dispatchDocument, dispatchWindow, setDocumentFocused } = setupDocument(composer);

      await withPreviewAutomationFocus(async (trackWebview) => {
        trackWebview("background-tab");
        setActiveElement(guest);
        if (withFocusIn) dispatchDocument("focusin", guest);
        setDocumentFocused(false);
        dispatchWindow("blur");
      });

      expect(Object.is(document.activeElement, composer)).toBe(true);
      expect(composer.focus).toHaveBeenCalledWith({ preventScroll: true });
    },
  );

  it("does not take focus from a different browser tab", async () => {
    const composer = new MockHTMLElement();
    const otherGuest = new MockHTMLElement();
    otherGuest.tagName = "WEBVIEW";
    otherGuest.dataset.previewTab = "user-tab";
    const { dispatchDocument, setDocumentFocused } = setupDocument(composer);

    await withPreviewAutomationFocus(async (trackWebview) => {
      trackWebview("background-tab");
      setActiveElement(otherGuest);
      dispatchDocument("focusin", otherGuest);
      setDocumentFocused(false);
    });

    expect(document.activeElement).toBe(otherGuest);
    expect(composer.focus).not.toHaveBeenCalled();
  });

  it("preserves a deliberate user focus change to the automated tab", async () => {
    const composer = new MockHTMLElement();
    const guest = new MockHTMLElement();
    guest.tagName = "WEBVIEW";
    guest.dataset.previewTab = "background-tab";
    const { dispatchDocument, setDocumentFocused } = setupDocument(composer);

    await withPreviewAutomationFocus(async (trackWebview) => {
      trackWebview("background-tab");
      dispatchDocument("pointerdown", guest);
      setActiveElement(guest);
      dispatchDocument("focusin", guest);
      setDocumentFocused(false);
    });

    expect(document.activeElement).toBe(guest);
    expect(composer.focus).not.toHaveBeenCalled();
  });

  it("restores the composer after overlapping operations move focus between guest tabs", async () => {
    const composer = new MockHTMLElement();
    const firstGuest = new MockHTMLElement();
    firstGuest.tagName = "WEBVIEW";
    firstGuest.dataset.previewTab = "first-tab";
    const secondGuest = new MockHTMLElement();
    secondGuest.tagName = "WEBVIEW";
    secondGuest.dataset.previewTab = "second-tab";
    const { dispatchDocument, setDocumentFocused } = setupDocument(composer);
    let finishFirst!: () => void;

    const first = withPreviewAutomationFocus(async (trackWebview) => {
      trackWebview("first-tab");
      setActiveElement(firstGuest);
      dispatchDocument("focusin", firstGuest);
      setDocumentFocused(false);
      await new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
    });
    await withPreviewAutomationFocus(async (trackWebview) => {
      trackWebview("second-tab");
      setActiveElement(secondGuest);
      dispatchDocument("focusin", secondGuest);
    });
    expect(composer.focus).not.toHaveBeenCalled();
    finishFirst();
    await first;

    expect(Object.is(document.activeElement, composer)).toBe(true);
    expect(composer.focus).toHaveBeenCalledOnce();
  });

  it("restores focus when automation leaves a connected host control focused", async () => {
    const composer = new MockHTMLElement();
    const hostButton = new MockHTMLElement();
    const { dispatchDocument, dispatchWindow } = setupDocument(composer);

    const result = await withPreviewAutomationFocus(async () => {
      // Native guest focus briefly transfers the renderer window away and back.
      dispatchWindow("blur");
      dispatchWindow("focus");
      setActiveElement(hostButton);
      dispatchDocument("focusin", hostButton, false);
      return "pressed";
    });

    expect(result).toBe("pressed");
    expect(composer.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(globalThis.document.activeElement).toBe(composer);
  });

  it("preserves newer DOM focus while the bridge operation is pending", async () => {
    const composer = new MockHTMLElement();
    const newerControl = new MockHTMLElement();
    const { body, dispatchDocument } = setupDocument(composer);
    let finish!: () => void;
    let started!: () => void;
    const operationStarted = new Promise<void>((resolve) => {
      started = resolve;
    });

    const pending = withPreviewAutomationFocus(async () => {
      setActiveElement(body);
      started();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });

    await operationStarted;
    setActiveElement(newerControl);
    // This models a newer programmatic or user focus event in the host.
    dispatchDocument("focusin", newerControl);
    finish();
    await pending;

    expect(composer.focus).not.toHaveBeenCalled();
    expect(globalThis.document.activeElement).toBe(newerControl);
  });

  it("does not restore a detached prior element", async () => {
    const detachedComposer = new MockHTMLElement();
    const { body } = setupDocument(detachedComposer);
    await withPreviewAutomationFocus(async () => {
      detachedComposer.isConnected = false;
      setActiveElement(body);
    });
    expect(detachedComposer.focus).not.toHaveBeenCalled();
  });

  it("does not restore when the document is unfocused at invocation", async () => {
    const unfocusedComposer = new MockHTMLElement();
    const unfocused = setupDocument(unfocusedComposer, false);
    setActiveElement(unfocusedComposer);
    await withPreviewAutomationFocus(async () => {
      setActiveElement(unfocused.body);
    });
    expect(unfocusedComposer.focus).not.toHaveBeenCalled();
  });

  it("does not restore when the document loses focus during the operation", async () => {
    const composer = new MockHTMLElement();
    const { body, setDocumentFocused } = setupDocument(composer);
    await withPreviewAutomationFocus(async () => {
      setActiveElement(body);
      setDocumentFocused(false);
    });
    expect(composer.focus).not.toHaveBeenCalled();
  });

  it.each(["pointerdown", "keydown"] as const)(
    "preserves user focus after a native transfer and %s",
    async (userEvent) => {
      const composer = new MockHTMLElement();
      const hostButton = new MockHTMLElement();
      const { dispatchDocument, dispatchWindow } = setupDocument(composer);

      await withPreviewAutomationFocus(async () => {
        dispatchWindow("blur");
        dispatchWindow("focus");
        dispatchDocument(userEvent, hostButton);
        setActiveElement(hostButton);
        dispatchDocument("focusin", hostButton);
      });

      expect(composer.focus).not.toHaveBeenCalled();
      expect(globalThis.document.activeElement).toBe(hostButton);
    },
  );

  it("does not mask the operation rejection when restoration fails", async () => {
    const composer = new MockHTMLElement();
    const { body } = setupDocument(composer);
    const error = new Error("press failed");
    composer.focus.mockImplementation(() => {
      throw new Error("focus failed");
    });

    await expect(
      withPreviewAutomationFocus(async () => {
        setActiveElement(body);
        throw error;
      }),
    ).rejects.toBe(error);
  });

  it("does not mask the operation result when restoration fails", async () => {
    const composer = new MockHTMLElement();
    const { body } = setupDocument(composer);
    composer.focus.mockImplementation(() => {
      throw new Error("focus failed");
    });

    await expect(
      withPreviewAutomationFocus(async () => {
        setActiveElement(body);
        return "pressed";
      }),
    ).resolves.toBe("pressed");
  });

  it("waits for the last overlapping operation before restoring focus", async () => {
    const composer = new MockHTMLElement();
    const { body } = setupDocument(composer);
    let finish!: () => void;
    let firstStarted!: () => void;
    const firstIsStarted = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });

    const first = withPreviewAutomationFocus(async () => {
      setActiveElement(body);
      firstStarted();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    await firstIsStarted;

    const second = withPreviewAutomationFocus(async () => {
      setActiveElement(body);
      return "second";
    });

    await expect(second).resolves.toBe("second");
    expect(composer.focus).not.toHaveBeenCalled();
    finish();
    await first;
    expect(composer.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(globalThis.document.activeElement).toBe(composer);
  });

  it("restores the original composer after overlapping native focus transfers", async () => {
    const composer = new MockHTMLElement();
    const hostButton = new MockHTMLElement();
    const { dispatchDocument, dispatchWindow } = setupDocument(composer);
    let finishFirst!: () => void;
    let firstStarted!: () => void;
    const firstIsStarted = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });

    const first = withPreviewAutomationFocus(async () => {
      dispatchWindow("blur");
      dispatchWindow("focus");
      setActiveElement(hostButton);
      dispatchDocument("focusin", hostButton, false);
      firstStarted();
      await new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
    });
    await firstIsStarted;

    await withPreviewAutomationFocus(async () => undefined);
    finishFirst();
    await first;

    expect(composer.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(globalThis.document.activeElement).toBe(composer);
  });
  it.each([false, true])(
    "restores after a late native window focus (focusin=%s)",
    async (withFocusIn) => {
      const composer = new MockHTMLElement();
      const hostButton = new MockHTMLElement();
      const { body, setDocumentFocused, dispatchWindow, dispatchDocument, flushFrames } =
        setupDocument(composer);
      await withPreviewAutomationFocus(async () => {
        setActiveElement(body);
        setDocumentFocused(false);
        dispatchWindow("blur");
      });
      expect(composer.focus).not.toHaveBeenCalled();
      setDocumentFocused(true);
      dispatchWindow("focus");
      if (withFocusIn) {
        setActiveElement(hostButton);
        dispatchDocument("focusin", hostButton);
      }
      flushFrames();
      expect(Object.is(document.activeElement, composer)).toBe(true);
    },
  );

  it("keeps the original target when another operation starts before native focus returns", async () => {
    const composer = new MockHTMLElement();
    const { body, setDocumentFocused, dispatchWindow, flushFrames } = setupDocument(composer);
    await withPreviewAutomationFocus(async () => {
      setActiveElement(body);
      setDocumentFocused(false);
      dispatchWindow("blur");
    });
    await withPreviewAutomationFocus(async () => undefined);
    setDocumentFocused(true);
    dispatchWindow("focus");
    flushFrames();
    expect(Object.is(document.activeElement, composer)).toBe(true);
  });

  it.each(["pointerdown", "keydown"])("cancels a late restore on deliberate %s", async (type) => {
    const composer = new MockHTMLElement();
    const chosen = new MockHTMLElement();
    const { body, setDocumentFocused, dispatchWindow, dispatchDocument, flushFrames } =
      setupDocument(composer);
    await withPreviewAutomationFocus(async () => {
      setActiveElement(body);
      setDocumentFocused(false);
      dispatchWindow("blur");
    });
    setDocumentFocused(true);
    dispatchWindow("focus");
    dispatchDocument(type, chosen);
    setActiveElement(chosen);
    dispatchDocument("focusin", chosen);
    flushFrames();
    expect(Object.is(document.activeElement, chosen)).toBe(true);
    expect(composer.focus).not.toHaveBeenCalled();
  });

  it("expires a pending restore instead of changing focus on a later app switch", async () => {
    const composer = new MockHTMLElement();
    const { body, setDocumentFocused, dispatchWindow, flushFrames } = setupDocument(composer);
    await withPreviewAutomationFocus(async () => {
      setActiveElement(body);
      setDocumentFocused(false);
      dispatchWindow("blur");
    });
    vi.runOnlyPendingTimers();
    setDocumentFocused(true);
    dispatchWindow("focus");
    flushFrames();
    expect(composer.focus).not.toHaveBeenCalled();
  });
  it("restores when native window focus returns before the operation finishes without focusin", async () => {
    const composer = new MockHTMLElement();
    const { body, dispatchWindow, flushFrames } = setupDocument(composer);
    await withPreviewAutomationFocus(async () => {
      setActiveElement(body);
      dispatchWindow("blur");
      dispatchWindow("focus");
      flushFrames();
      expect(composer.focus).not.toHaveBeenCalled();
    });
    expect(composer.focus).toHaveBeenCalledOnce();
  });
});
