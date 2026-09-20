const PENDING_USER_INPUT_MAX_HEIGHT = 560;
const PENDING_USER_INPUT_MIN_HEIGHT = 160;
const PENDING_USER_INPUT_VERTICAL_GAP = 12;

/**
 * Reserve for a portrait iPhone keyboard with the QuickType bar until a real
 * height has been observed. Overestimating only costs card height; an
 * underestimate would let the card overshoot on the first keyboard open.
 */
export const ESTIMATED_KEYBOARD_HEIGHT = 336;

/**
 * One clock for the questionnaire expand/collapse choreography: the card's
 * enter/exit and the feed-inset glide must share it or they visibly drift.
 * Sized for the near-full-height slide (the card travels its own height),
 * in the same class as the iOS keyboard's ~250ms.
 */
export const USER_INPUT_TOGGLE_DURATION_MS = 220;

export function derivePendingUserInputMaxHeight(input: {
  readonly windowHeight: number;
  readonly keyboardHeight: number;
  readonly navigationHeaderHeight: number;
  readonly composerOverlapHeight: number;
}): number {
  const availableHeight =
    input.windowHeight -
    Math.max(0, input.keyboardHeight) -
    Math.max(0, input.navigationHeaderHeight) -
    Math.max(0, input.composerOverlapHeight) -
    PENDING_USER_INPUT_VERTICAL_GAP;

  return Math.min(
    PENDING_USER_INPUT_MAX_HEIGHT,
    Math.max(PENDING_USER_INPUT_MIN_HEIGHT, availableHeight),
  );
}

const FULL_SCREEN_MAX_CONTENT_WIDTH = 720;

export interface PendingUserInputFullScreenLayout {
  readonly contentMaxWidth: number;
  readonly horizontalPadding: number;
}

/**
 * Measure for the full-screen questionnaire. Wide viewports (an unfolded
 * foldable, a tablet) spend the extra width on margin instead of line length,
 * so a long question still reads as a column rather than edge to edge.
 */
export function derivePendingUserInputFullScreenLayout(input: {
  readonly windowWidth: number;
}): PendingUserInputFullScreenLayout {
  const horizontalPadding = input.windowWidth >= 840 ? 32 : input.windowWidth >= 600 ? 24 : 16;
  return {
    horizontalPadding,
    contentMaxWidth: Math.min(
      FULL_SCREEN_MAX_CONTENT_WIDTH,
      Math.max(0, input.windowWidth - horizontalPadding * 2),
    ),
  };
}
