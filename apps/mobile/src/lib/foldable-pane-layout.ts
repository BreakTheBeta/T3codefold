export const FOLDABLE_PANE_COMPACT_WIDTH = 72;
/** How far past either end of its range the divider must travel to maximize or close the pane. */
export const PANE_DIVIDER_OVERSHOOT = 56;
/** Release within this distance of a snap width (e.g. the hinge) lands on it. */
export const PANE_DIVIDER_SNAP_DISTANCE = 32;

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

export type PaneDividerRelease =
  | { readonly kind: "resize"; readonly width: number }
  | { readonly kind: "maximize" }
  | { readonly kind: "close" };

/**
 * Resolves where a trailing pane lands when its divider is released. Dragging
 * past the far end of the range maximizes the pane, past the near end closes
 * it, and anything between rests at a width, snapping to nearby `snapWidths`.
 */
export function resolvePaneDividerRelease(input: {
  /** The pane's rendered width when the drag began. */
  readonly startWidth: number;
  /** Horizontal finger travel; negative (leftward) grows a trailing pane. */
  readonly translationX: number;
  readonly range: { readonly min: number; readonly max: number };
  readonly snapWidths?: ReadonlyArray<number>;
}): PaneDividerRelease {
  const target = input.startWidth - input.translationX;
  if (target > input.range.max + PANE_DIVIDER_OVERSHOOT) return { kind: "maximize" };
  if (target < input.range.min - PANE_DIVIDER_OVERSHOOT) return { kind: "close" };
  const width = Math.round(Math.min(input.range.max, Math.max(input.range.min, target)));
  const snap = input.snapWidths
    ?.filter((snapWidth) => snapWidth >= input.range.min && snapWidth <= input.range.max)
    .reduce<number | null>(
      (nearest, snapWidth) =>
        Math.abs(snapWidth - width) <= PANE_DIVIDER_SNAP_DISTANCE &&
        (nearest === null || Math.abs(snapWidth - width) < Math.abs(nearest - width))
          ? snapWidth
          : nearest,
      null,
    );
  return { kind: "resize", width: snap ?? width };
}
