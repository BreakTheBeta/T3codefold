/**
 * Vim-style workspace navigation for hardware keyboards, mirroring the web
 * client's Zed-style mode (docs/user/vim-keyboard-mode.md) where it makes
 * sense on a phone: move between the sidebar, chat and inspector panes, move
 * through threads, scroll the conversation, and jump into the composer.
 *
 * Pure: keys go in, effects come out. The native layer only forwards keys
 * while no text field has focus, so typing is never intercepted.
 */

export type VimRegion = "sidebar" | "chat" | "inspector";

/** A key as forwarded by the native keyboard layer. */
export interface VimKey {
  /** The printed character ("j", "G", "/"), or a name: Escape, Enter, ArrowUp, ArrowDown. */
  readonly key: string;
  readonly ctrl?: boolean;
}

export interface VimState {
  readonly region: VimRegion;
  readonly pending: "g" | "ctrl-w" | null;
  readonly count: number | null;
}

export type VimEffect =
  | { readonly type: "focusRegion"; readonly region: VimRegion }
  | { readonly type: "moveCursor"; readonly delta: number }
  | { readonly type: "cursorToEdge"; readonly edge: "first" | "last" }
  | { readonly type: "openCursor" }
  | { readonly type: "scroll"; readonly unit: "line" | "halfPage"; readonly delta: number }
  | { readonly type: "scrollToEdge"; readonly edge: "top" | "bottom" }
  | { readonly type: "focusComposer" }
  | { readonly type: "focusSearch" }
  | { readonly type: "toggleMaximize" }
  | { readonly type: "commandPalette" };

export interface VimContext {
  /** Visible panes, leading to trailing. */
  readonly regions: ReadonlyArray<VimRegion>;
}

export const INITIAL_VIM_STATE: VimState = { region: "chat", pending: null, count: null };

const HALF_PAGE_THREADS = 10;

/** Keeps the focused region on a visible pane, preferring the chat. */
export function reconcileVimRegion(state: VimState, context: VimContext): VimState {
  if (context.regions.includes(state.region)) return state;
  const region = context.regions.includes("chat") ? "chat" : (context.regions[0] ?? "chat");
  return { ...state, region, pending: null, count: null };
}

export function reduceVimKey(
  current: VimState,
  input: VimKey,
  context: VimContext,
): { readonly state: VimState; readonly effects: ReadonlyArray<VimEffect> } {
  const state = reconcileVimRegion(current, context);
  const idle: VimState = { ...state, pending: null, count: null };
  const count = state.count ?? 1;
  const { key } = input;
  const ctrl = input.ctrl === true;
  const focus = (region: VimRegion | undefined) =>
    region === undefined || region === state.region
      ? { state: idle, effects: [] }
      : {
          state: { ...idle, region },
          effects: [{ type: "focusRegion", region } as const],
        };
  const regionIndex = context.regions.indexOf(state.region);
  const neighbor = (direction: 1 | -1) => context.regions[regionIndex + direction];

  if (state.pending === "ctrl-w") {
    switch (key) {
      case "h":
        return focus(neighbor(-1));
      case "l":
        return focus(neighbor(1));
      case "w":
        return focus(context.regions[(regionIndex + 1) % context.regions.length]);
      case "W":
        return focus(
          context.regions[(regionIndex - 1 + context.regions.length) % context.regions.length],
        );
      case "o":
        return { state: idle, effects: [{ type: "toggleMaximize" }] };
      default:
        return { state: idle, effects: [] };
    }
  }

  if (ctrl) {
    switch (key) {
      case "w":
        return { state: { ...idle, pending: "ctrl-w" }, effects: [] };
      case "h":
        return focus(neighbor(-1));
      case "l":
        return focus(neighbor(1));
      case "d":
      case "u": {
        const direction = key === "d" ? 1 : -1;
        return {
          state: idle,
          effects: [
            state.region === "sidebar"
              ? { type: "moveCursor", delta: direction * HALF_PAGE_THREADS * count }
              : { type: "scroll", unit: "halfPage", delta: direction * count },
          ],
        };
      }
      default:
        return { state: idle, effects: [] };
    }
  }

  if (/^[0-9]$/.test(key) && (key !== "0" || state.count !== null)) {
    return {
      state: { ...state, pending: null, count: (state.count ?? 0) * 10 + Number(key) },
      effects: [],
    };
  }

  if (state.pending === "g") {
    return key === "g"
      ? { state: idle, effects: [edgeEffect(state.region, "start")] }
      : { state: idle, effects: [] };
  }

  switch (key) {
    case "Escape":
      return { state: idle, effects: [] };
    case "g":
      return { state: { ...state, pending: "g" }, effects: [] };
    case "G":
      return { state: idle, effects: [edgeEffect(state.region, "end")] };
    case "j":
    case "k":
    case "ArrowDown":
    case "ArrowUp": {
      const direction = key === "j" || key === "ArrowDown" ? 1 : -1;
      return {
        state: idle,
        effects: [
          state.region === "sidebar"
            ? { type: "moveCursor", delta: direction * count }
            : { type: "scroll", unit: "line", delta: direction * count },
        ],
      };
    }
    case "Enter":
    case "o":
    case "l":
      if (state.region !== "sidebar") return { state: idle, effects: [] };
      return {
        state: { ...idle, region: context.regions.includes("chat") ? "chat" : state.region },
        effects: [{ type: "openCursor" }],
      };
    case "i":
    case "a":
      return {
        state: { ...idle, region: "chat" },
        effects: [{ type: "focusComposer" }],
      };
    case "/":
      return {
        state: { ...idle, region: "sidebar" },
        effects: [{ type: "focusSearch" }],
      };
    case ":":
    case " ":
      return { state: idle, effects: [{ type: "commandPalette" }] };
    default:
      return { state: idle, effects: [] };
  }
}

function edgeEffect(region: VimRegion, edge: "start" | "end"): VimEffect {
  return region === "sidebar"
    ? { type: "cursorToEdge", edge: edge === "start" ? "first" : "last" }
    : { type: "scrollToEdge", edge: edge === "start" ? "top" : "bottom" };
}

/** The thread a cursor lands on after moving `delta` rows, clamped to the list. */
export function moveVimCursor<T>(
  items: ReadonlyArray<T>,
  current: T | null,
  delta: number,
  isSame: (a: T, b: T) => boolean,
): T | null {
  if (items.length === 0) return null;
  const index = current === null ? -1 : items.findIndex((item) => isSame(item, current));
  const start = index < 0 ? (delta > 0 ? -1 : items.length) : index;
  return items[Math.min(items.length - 1, Math.max(0, start + delta))] ?? null;
}
