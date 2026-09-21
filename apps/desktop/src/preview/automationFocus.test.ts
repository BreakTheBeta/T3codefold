import { expect, it, vi } from "vite-plus/test";
import { createAutomationFocusScope } from "./automationFocus.js";

const target = (id: number) => ({ id, isDestroyed: () => false, focus: vi.fn() });

it.each([false, true])(
  "restores the original renderer across two guests (reverse=%s)",
  (reverse) => {
    const composer = target(1);
    const first = target(2);
    const second = target(3);
    let focused = composer;
    const begin = createAutomationFocusScope(() => focused);
    const endFirst = begin(first);
    focused = first;
    const endSecond = begin(second);
    focused = second;
    const releases = reverse ? [endSecond, endFirst] : [endFirst, endSecond];
    releases[0]!();
    expect(composer.focus).not.toHaveBeenCalled();
    releases[1]!();
    expect(composer.focus).toHaveBeenCalledOnce();
    expect(first.focus).not.toHaveBeenCalled();
    expect(second.focus).not.toHaveBeenCalled();
  },
);

it("preserves a newer user renderer selection", () => {
  const composer = target(1);
  const browser = target(2);
  const other = target(3);
  let focused = composer;
  const begin = createAutomationFocusScope(() => focused);
  const end = begin(browser);
  focused = other;
  end();
  expect(composer.focus).not.toHaveBeenCalled();
});

it("does not restore a destroyed renderer or an already focused automation guest", () => {
  const composer = target(1);
  const browser = target(2);
  const begin = createAutomationFocusScope(() => composer);
  const end = begin(browser);
  composer.isDestroyed = () => true;
  end();
  expect(composer.focus).not.toHaveBeenCalled();
  createAutomationFocusScope(() => browser)(browser)();
  expect(browser.focus).not.toHaveBeenCalled();
});

it("captures a fresh target after the previous group finishes", () => {
  const first = target(1);
  const second = target(2);
  const browser = target(3);
  let focused = first;
  const begin = createAutomationFocusScope(() => focused);
  const endFirst = begin(browser);
  focused = browser;
  endFirst();
  focused = second;
  const endSecond = begin(browser);
  focused = browser;
  endSecond();
  expect(first.focus).toHaveBeenCalledOnce();
  expect(second.focus).toHaveBeenCalledOnce();
});
