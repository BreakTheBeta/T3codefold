const NAMED_KEYS: Record<string, string> = {
  Enter: "enter",
  Escape: "esc",
  Tab: "tab",
  Backspace: "backspace",
  Delete: "delete",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
  " ": "space",
};

/**
 * A browser key press as a Herdr Core key name (`enter`, `up`, `ctrl+c`, `alt+x`, `f5`, `a`).
 * Command-key presses stay with the app, so its own shortcuts keep working.
 */
export function herdrKeyName(event: {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}): string | null {
  if (event.metaKey) return null;
  const base =
    NAMED_KEYS[event.key] ??
    (/^F([1-9]|1[0-2])$/.test(event.key)
      ? event.key.toLowerCase()
      : [...event.key].length === 1
        ? event.key
        : null);
  if (base === null) return null;
  const modifiers = [event.ctrlKey ? "ctrl" : null, event.altKey ? "alt" : null].filter(Boolean);
  // Ctrl and Alt combinations name the unshifted key.
  return modifiers.length > 0 ? `${modifiers.join("+")}+${base.toLowerCase()}` : base;
}
