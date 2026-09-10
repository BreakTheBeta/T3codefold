export type DropdownNavigationKey = "ArrowDown" | "ArrowUp";

export function dropdownNavigationKey(event: {
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly isComposing?: boolean;
  readonly key: string;
  readonly metaKey: boolean;
  readonly nativeEvent?: { readonly isComposing?: boolean };
  readonly shiftKey: boolean;
}): DropdownNavigationKey | null {
  if (
    !event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.shiftKey ||
    (event.isComposing ?? event.nativeEvent?.isComposing)
  ) {
    return null;
  }
  if (event.key.toLowerCase() === "n") return "ArrowDown";
  if (event.key.toLowerCase() === "p") return "ArrowUp";
  return null;
}

export function redirectDropdownNavigationKey(
  event: {
    readonly altKey: boolean;
    readonly ctrlKey: boolean;
    readonly isComposing?: boolean;
    readonly key: string;
    readonly metaKey: boolean;
    readonly nativeEvent?: { readonly isComposing?: boolean };
    readonly shiftKey: boolean;
    readonly target: EventTarget | null;
    preventDefault: () => void;
    stopImmediatePropagation?: () => void;
    stopPropagation: () => void;
  },
  target: EventTarget | null = event.target,
): boolean {
  const key = dropdownNavigationKey(event);
  if (key === null || target === null) return false;
  event.preventDefault();
  if (event.stopImmediatePropagation) event.stopImmediatePropagation();
  else event.stopPropagation();
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
  return true;
}
