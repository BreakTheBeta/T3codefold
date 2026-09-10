import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { dropdownNavigationKey, redirectDropdownNavigationKey } from "./dropdownNavigationKey";

const event = (key: string, overrides: Partial<Parameters<typeof dropdownNavigationKey>[0]> = {}) =>
  ({
    altKey: false,
    ctrlKey: true,
    isComposing: false,
    key,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  }) satisfies Parameters<typeof dropdownNavigationKey>[0];

describe("dropdownNavigationKey", () => {
  it("maps Ctrl-n and Ctrl-p to the dropdown's native arrow navigation", () => {
    expect(dropdownNavigationKey(event("n"))).toBe("ArrowDown");
    expect(dropdownNavigationKey(event("p"))).toBe("ArrowUp");
    expect(dropdownNavigationKey(event("N"))).toBe("ArrowDown");
  });

  it("leaves modified, composing, and unrelated keys alone", () => {
    expect(dropdownNavigationKey(event("n", { ctrlKey: false }))).toBeNull();
    expect(dropdownNavigationKey(event("p", { shiftKey: true }))).toBeNull();
    expect(dropdownNavigationKey(event("n", { metaKey: true }))).toBeNull();
    expect(dropdownNavigationKey(event("p", { altKey: true }))).toBeNull();
    expect(dropdownNavigationKey(event("n", { isComposing: true }))).toBeNull();
    expect(
      dropdownNavigationKey(
        event("n", { isComposing: undefined, nativeEvent: { isComposing: true } }),
      ),
    ).toBeNull();
    expect(dropdownNavigationKey(event("j"))).toBeNull();
  });

  it("consumes Ctrl-n and redispatches the native ArrowDown event", () => {
    class TestKeyboardEvent extends Event {
      readonly key: string;

      constructor(type: string, init: KeyboardEventInit) {
        super(type, init);
        this.key = init.key ?? "";
      }
    }
    vi.stubGlobal("KeyboardEvent", TestKeyboardEvent);
    const target = new EventTarget();
    const keys: string[] = [];
    target.addEventListener("keydown", (dispatched) =>
      keys.push((dispatched as KeyboardEvent).key),
    );
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    expect(
      redirectDropdownNavigationKey({
        ...event("n"),
        target,
        preventDefault,
        stopPropagation,
      }),
    ).toBe(true);
    expect(keys).toEqual(["ArrowDown"]);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });
});

afterEach(() => vi.unstubAllGlobals());
