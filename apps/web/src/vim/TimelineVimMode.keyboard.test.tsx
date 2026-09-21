import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { TimelineVimMode } from "./TimelineVimMode";

class FocusTarget {
  tabIndex = 0;
  isConnected = true;
  tagName = "INPUT";
  constructor(
    readonly selector: string,
    readonly region: FocusTarget | null = null,
  ) {}
  closest(selector: string): FocusTarget | null {
    if (this.region && selector.includes(this.region.selector)) return this.region;
    return selector.includes(this.selector) ||
      (selector.startsWith("input,") && this.tagName === "INPUT")
      ? this
      : null;
  }
  matches(selector: string) {
    return selector.split(",").some((part) => part.trim() === this.selector);
  }
  blur() {
    activeElement = null;
  }
  focus() {
    setActiveElement(this);
  }
  getClientRects() {
    return [{}];
  }
  click = vi.fn();
}

let activeElement: FocusTarget | null;
function setActiveElement(target: FocusTarget) {
  activeElement = target;
}
let renderer: ReactTestRenderer;
let keyboard: EventTarget;
let conversation: FocusTarget;

beforeEach(() => {
  keyboard = new EventTarget();
  conversation = new FocusTarget("conversation");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("HTMLElement", FocusTarget);
  vi.stubGlobal("window", keyboard);
  vi.stubGlobal("document", {
    get activeElement() {
      return activeElement;
    },
    querySelectorAll: () => [],
  });
  act(() => {
    renderer = create(
      <TimelineVimMode
        routeKey="test"
        getScrollNode={() => conversation as unknown as HTMLElement}
        focusComposer={vi.fn()}
        onUserNavigation={vi.fn()}
        onScrollToEnd={vi.fn()}
      />,
    );
  });
});

afterEach(() => {
  act(() => renderer.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function press(key: string, properties = {}) {
  const event = Object.assign(new Event("keydown", { cancelable: true }), {
    key,
    ...properties,
  });
  act(() => keyboard.dispatchEvent(event));
  return event;
}

it.each(['input[type="search"]', '[role="searchbox"]'])(
  "Escape leaves %s and returns focus to navigation",
  (selector) => {
    activeElement = new FocusTarget(selector);
    press("Escape");
    expect(activeElement === conversation).toBe(true);
  },
);

it("leaves ordinary input editing alone", () => {
  const input = new FocusTarget("input");
  activeElement = input;
  expect(press("Escape").defaultPrevented).toBe(false);
  expect(activeElement).toBe(input);
});

it("does not leave search during composition", () => {
  const input = new FocusTarget('input[type="search"]');
  activeElement = input;
  press("Escape", { isComposing: true });
  expect(activeElement).toBe(input);
});

it("keeps typing in the search field", () => {
  const input = new FocusTarget('input[type="search"]');
  activeElement = input;
  expect(press("j").defaultPrevented).toBe(false);
  expect(activeElement).toBe(input);
});

it.each(["[data-app-sidebar]", "[data-right-panel-surface-content]"])(
  "returns search focus to its %s region and preserves local Escape handling",
  (selector) => {
    const region = new FocusTarget(selector);
    activeElement = new FocusTarget('input[type="search"]', region);
    const localEscape = vi.fn();
    keyboard.addEventListener("keydown", localEscape);
    expect(press("Escape").defaultPrevented).toBe(false);
    expect(activeElement === region).toBe(true);
    expect(localEscape).toHaveBeenCalledOnce();
  },
);

it("leaves modified Escape to the field", () => {
  const input = new FocusTarget('input[type="search"]');
  activeElement = input;
  press("Escape", { ctrlKey: true });
  expect(activeElement).toBe(input);
});

it("lets an open dialog own Escape", () => {
  const input = new FocusTarget('input[type="search"]');
  activeElement = input;
  vi.spyOn(document, "querySelectorAll").mockReturnValue([
    {
      getBoundingClientRect: () => ({
        width: 100,
        height: 100,
        top: 0,
        left: 0,
        bottom: 100,
        right: 100,
      }),
    },
  ] as unknown as NodeListOf<Element>);
  Object.assign(keyboard, {
    innerHeight: 800,
    innerWidth: 1200,
    getComputedStyle: () => ({ visibility: "visible", display: "block" }),
  });
  expect(press("Escape").defaultPrevented).toBe(false);
  expect(activeElement).toBe(input);
});

function setupSidebar(previewThreads: boolean) {
  vi.useFakeTimers();
  const sidebar = new FocusTarget("[data-app-sidebar]");
  const thread = new FocusTarget("[data-thread-item]", sidebar);
  const rows = Array.from({ length: 3 }, () => {
    const row = new FocusTarget("[role=button]", sidebar);
    row.tagName = "DIV";
    const closest = row.closest.bind(row);
    vi.spyOn(row, "closest").mockImplementation((selector) =>
      selector === "[data-thread-item]" ? thread : closest(selector),
    );
    return row;
  });
  vi.spyOn(document, "querySelectorAll").mockImplementation(
    (selector) =>
      (selector.includes("[data-app-sidebar]") ? rows : []) as unknown as NodeListOf<Element>,
  );
  act(() => renderer.unmount());
  keyboard = new EventTarget();
  vi.stubGlobal("window", keyboard);
  act(
    () =>
      (renderer = create(
        <TimelineVimMode
          routeKey="test"
          previewThreads={previewThreads}
          getScrollNode={() => conversation as unknown as HTMLElement}
          focusComposer={vi.fn()}
          onUserNavigation={vi.fn()}
          onScrollToEnd={vi.fn()}
        />,
      )),
  );
  rows[0]!.focus();
  return rows;
}

it("keeps sidebar navigation focus-only when preview is disabled, and i opens the selection", () => {
  const rows = setupSidebar(false);
  press("j");
  act(() => vi.runAllTimers());
  expect(activeElement).toBe(rows[1]);
  expect(rows[1]!.click).not.toHaveBeenCalled();
  expect(press("i").defaultPrevented).toBe(true);
  expect(rows[1]!.click).toHaveBeenCalledOnce();
});

it("previews only the final thread after rapid sidebar navigation, preserving focus", () => {
  const rows = setupSidebar(true);
  press("j");
  expect(activeElement).toBe(rows[1]);
  press("j");
  expect(activeElement).toBe(rows[2]);
  expect(rows[2]!.click).not.toHaveBeenCalled();
  act(() => vi.runAllTimers());
  expect(rows[1]!.click).not.toHaveBeenCalled();
  expect(rows[2]!.click).toHaveBeenCalledOnce();
  expect(activeElement).toBe(rows[2]);
});

it("cancels a preview when focus leaves the selected thread", () => {
  const rows = setupSidebar(true);
  press("j");
  conversation.focus();
  act(() => vi.runAllTimers());
  expect(rows[1]!.click).not.toHaveBeenCalled();
});

it("does not preview project headers", () => {
  const rows = setupSidebar(true);
  vi.spyOn(rows[1]!, "closest").mockReturnValue(null);
  press("j");
  act(() => vi.runAllTimers());
  expect(rows[1]!.click).not.toHaveBeenCalled();
});
