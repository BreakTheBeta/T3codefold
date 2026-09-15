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
