/** Separate the transcript and controls without placing either across a horizontal fold. */
export function deriveTabletopChatLayout(input: {
  readonly hingeTop: number | null;
  readonly hingeHeight: number;
  readonly viewportTop: number;
  readonly viewportHeight: number;
  readonly keyboardHeight: number;
  readonly controlsHeight: number;
}) {
  if (input.hingeTop === null) return null;
  const feedHeight = Math.round(input.hingeTop - input.viewportTop);
  const controlsTop = feedHeight + Math.max(0, input.hingeHeight);
  const controlsSpace = input.viewportHeight - controlsTop - Math.max(0, input.keyboardHeight);
  // A tall IME can occupy the whole lower half. Use the normal keyboard layout
  // then, rather than clipping the input or leaving it behind the keyboard.
  if (feedHeight < 120 || controlsSpace < input.controlsHeight) return null;
  return { feedHeight, controlsTop };
}
