export const FOLDABLE_PANE_COMPACT_WIDTH = 72;

/** Allows either side of an unfolded workspace to collapse to a usable sliver. */
export function constrainFoldablePaneWidth(input: {
  readonly preferredWidth: number;
  readonly availableWidth: number;
}): number {
  const availableWidth = Number.isFinite(input.availableWidth)
    ? Math.max(0, input.availableWidth)
    : 0;
  const preferredWidth = Number.isFinite(input.preferredWidth)
    ? input.preferredWidth
    : FOLDABLE_PANE_COMPACT_WIDTH;
  const maximumWidth = Math.max(
    FOLDABLE_PANE_COMPACT_WIDTH,
    availableWidth - FOLDABLE_PANE_COMPACT_WIDTH,
  );
  return Math.min(maximumWidth, Math.max(FOLDABLE_PANE_COMPACT_WIDTH, Math.round(preferredWidth)));
}
