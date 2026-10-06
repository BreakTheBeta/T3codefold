import { Easing, ReduceMotion } from "react-native-reanimated";

/**
 * Reveal for a workspace pane (thread sidebar or inspector) as it appears.
 *
 * Pane widths change in one layout pass rather than animating: animating a
 * width re-lays out the chat feed (and resizes any terminal) every frame, and
 * freezing the chat at one width while its container animates clips it. Only
 * the pane being shown fades and slides in over its final position.
 */
export const WORKSPACE_PANE_REVEAL_TIMING = {
  duration: 180,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
} as const;
