import { Keyboard, Platform } from "react-native";

/** Consume this press without changing the screen, search, or draft beneath the IME. */
export function dismissAndroidKeyboard() {
  if (Platform.OS !== "android" || !Keyboard.isVisible()) return false;
  Keyboard.dismiss();
  return true;
}

/** Also used by modal request-close callbacks, which bypass BackHandler on Android. */
export function androidKeyboardFirst(onBack: () => void) {
  return () => {
    if (!dismissAndroidKeyboard()) onBack();
  };
}
