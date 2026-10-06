import { useMemo, useRef } from "react";
import { Gesture } from "react-native-gesture-handler";
import { runOnJS, useSharedValue, type SharedValue } from "react-native-reanimated";

/** Finger tracking stays on the UI thread; JS only previews crossed slots and saves a drop. */
export function useUIThreadDrag(input: {
  disabled?: boolean;
  translation: SharedValue<number>;
  onStart: () => void;
  onMove: (translation: number) => void;
  onEnd: (translation: number, success: boolean) => void;
}) {
  const latest = useRef(input);
  latest.current = input;
  const slot = useSharedValue(0);
  const { translation, disabled } = input;
  const callbacks = useMemo(
    () => ({
      start: () => latest.current.onStart(),
      move: (value: number) => latest.current.onMove(value),
      end: (value: number, success: boolean) => {
        latest.current.onMove(value);
        latest.current.onEnd(value, success);
      },
    }),
    [],
  );
  return useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled)
        .minDistance(0)
        .shouldCancelWhenOutside(false)
        .onStart(() => {
          translation.value = 0;
          slot.value = 0;
          runOnJS(callbacks.start)();
        })
        .onUpdate((event) => {
          translation.value = event.translationY;
          const next = Math.round(event.translationY / 24);
          if (next !== slot.value) {
            slot.value = next;
            runOnJS(callbacks.move)(event.translationY);
          }
        })
        .onFinalize((event, success) => runOnJS(callbacks.end)(event.translationY, success)),
    [disabled, translation, slot, callbacks],
  );
}
