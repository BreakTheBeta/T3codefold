interface FocusTarget {
  readonly id: number;
  isDestroyed(): boolean;
  focus(): void;
}

/** Preserve the user's renderer across overlapping input in background browser tabs. */
export function createAutomationFocusScope(getFocused: () => FocusTarget | null) {
  let session: {
    target: FocusTarget | null;
    guests: Set<number>;
    operations: number;
  } | null = null;

  return (guest: FocusTarget): (() => void) => {
    const current = (session ??= { target: getFocused(), guests: new Set(), operations: 0 });
    current.guests.add(guest.id);
    current.operations += 1;
    return () => {
      current.operations -= 1;
      if (current.operations !== 0) return;
      session = null;
      const target = current.target;
      if (!target || target.isDestroyed() || current.guests.has(target.id)) return;
      const focused = getFocused();
      // A renderer outside this automation group represents a newer user choice.
      if (focused && (focused.id === target.id || !current.guests.has(focused.id))) return;
      target.focus();
    };
  };
}
