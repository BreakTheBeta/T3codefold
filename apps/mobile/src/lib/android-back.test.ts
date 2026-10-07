import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const native = vi.hoisted(() => ({
  platform: { OS: "android" },
  keyboard: { isVisible: vi.fn(), dismiss: vi.fn() },
}));
vi.mock("react-native", () => ({ Platform: native.platform, Keyboard: native.keyboard }));

import { androidKeyboardFirst, dismissAndroidKeyboard } from "./android-back";

beforeEach(() => {
  native.platform.OS = "android";
  native.keyboard.isVisible.mockReset();
  native.keyboard.dismiss.mockReset();
});

describe("Android keyboard-first Back", () => {
  it("keeps search and its text on the first press, then closes search on the next", () => {
    let search = "modified files";
    let searchOpen = true;
    const back = androidKeyboardFirst(() => {
      search = "";
      searchOpen = false;
    });
    native.keyboard.isVisible.mockReturnValue(true);
    back();
    expect(native.keyboard.dismiss).toHaveBeenCalledOnce();
    expect({ search, searchOpen }).toEqual({ search: "modified files", searchOpen: true });

    // Wait for the actual hide event rather than treating a dismiss request as hidden.
    back();
    expect(searchOpen).toBe(true);
    native.keyboard.isVisible.mockReturnValue(false);
    back();
    expect({ search, searchOpen }).toEqual({ search: "", searchOpen: false });
  });

  it("preserves a modal draft until Back is pressed with the keyboard hidden", () => {
    const draft = "Please review this change";
    let open = true;
    const requestClose = androidKeyboardFirst(() => {
      open = false;
    });
    native.keyboard.isVisible.mockReturnValue(true);
    requestClose();
    expect({ open, draft }).toEqual({ open: true, draft: "Please review this change" });
    native.keyboard.isVisible.mockReturnValue(false);
    requestClose();
    expect(open).toBe(false);
  });

  it("allows navigation when the native IME already consumed Back and hid itself", () => {
    native.keyboard.isVisible.mockReturnValue(false);
    expect(dismissAndroidKeyboard()).toBe(false);
    expect(native.keyboard.dismiss).not.toHaveBeenCalled();
  });

  it("preserves iOS dismissal behavior even when its keyboard is visible", () => {
    native.platform.OS = "ios";
    native.keyboard.isVisible.mockReturnValue(true);
    const close = vi.fn();
    androidKeyboardFirst(close)();
    expect(close).toHaveBeenCalledOnce();
    expect(native.keyboard.dismiss).not.toHaveBeenCalled();
  });
});
