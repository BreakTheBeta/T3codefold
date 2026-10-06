import { requireOptionalNativeModule } from "expo";
import { useSyncExternalStore } from "react";

/** A display fold, in window-relative dp. */
export interface WindowHinge {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly orientation: "vertical" | "horizontal";
  readonly state: "flat" | "halfOpened";
  /** True when the fold splits the window into two logical displays. */
  readonly separating: boolean;
}

export interface WindowPosture {
  readonly hinges: ReadonlyArray<WindowHinge>;
}

interface T3WindowPostureModule {
  getPosture(): WindowPosture;
  addListener(
    event: "onPostureChange",
    listener: (posture: WindowPosture) => void,
  ): { remove(): void };
}

// Android only (Jetpack WindowManager); elsewhere there is never a hinge.
const native = requireOptionalNativeModule<T3WindowPostureModule>("T3WindowPosture");
const NO_HINGES: WindowPosture = { hinges: [] };
let current: WindowPosture = native?.getPosture() ?? NO_HINGES;

function subscribe(onChange: () => void) {
  const subscription = native?.addListener("onPostureChange", (posture) => {
    current = posture;
    onChange();
  });
  return () => subscription?.remove();
}

function getSnapshot() {
  return current;
}

/** The current window's folds; updates as the device folds, unfolds or resizes. */
export function useWindowPosture(): WindowPosture {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
