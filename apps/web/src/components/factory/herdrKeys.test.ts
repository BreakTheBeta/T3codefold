import { describe, expect, it } from "vite-plus/test";

import { herdrKeyName } from "./herdrKeys";

const press = (key: string, modifiers: { ctrl?: boolean; alt?: boolean; meta?: boolean } = {}) =>
  herdrKeyName({
    key,
    ctrlKey: modifiers.ctrl ?? false,
    altKey: modifiers.alt ?? false,
    metaKey: modifiers.meta ?? false,
  });

describe("herdrKeyName", () => {
  it.each([
    ["Enter", {}, "enter"],
    ["Escape", {}, "esc"],
    ["ArrowUp", {}, "up"],
    [" ", {}, "space"],
    ["F5", {}, "f5"],
    ["y", {}, "y"],
    ["Y", {}, "Y"],
    ["c", { ctrl: true }, "ctrl+c"],
    ["X", { alt: true }, "alt+x"],
    ["c", { ctrl: true, alt: true }, "ctrl+alt+c"],
  ] as const)("names %s %o as %s", (key, modifiers, expected) => {
    expect(press(key, modifiers)).toBe(expected);
  });
  it("leaves Command shortcuts, bare modifiers and unknown keys to the app", () => {
    expect(press("c", { meta: true })).toBeNull();
    expect(press("Shift")).toBeNull();
    expect(press("Unidentified")).toBeNull();
  });
});
