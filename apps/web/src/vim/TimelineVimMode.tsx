import { useCallback, useEffect, useRef, useState } from "react";
import { openCommandPalette } from "~/commandPaletteBus";
import { isPreviewFocused } from "~/lib/previewFocus";
import { isTerminalFocused } from "~/lib/terminalFocus";
import { moveTextCursor, orderedRange, type VimMotion } from "./vimText";

const HINT_ALPHABET = "asdfghjklqwertyuiopzxcvbnm";
const HINT_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "[contenteditable=true]",
  "[role=button]:not([aria-disabled=true])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");
const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable=true]";
const FLOATING_SELECTOR = [
  '[role="dialog"]',
  '[data-slot="menu-popup"]',
  '[data-slot="select-popup"]',
  '[data-slot="popover-popup"]',
  '[data-slot="combobox-popup"]',
  '[data-slot="autocomplete-popup"]',
].join(",");
const SIDEBAR_ITEM_SELECTOR = [
  "[data-app-sidebar] [data-thread-item] [role=button]",
  "[data-app-sidebar] [data-thread-item] [data-sidebar='menu-sub-button']",
  "[data-app-sidebar] [data-sidebar='menu-button']",
  "[data-app-sidebar] [data-sidebar='menu-sub-button']",
].join(",");

type Hint = { element: HTMLElement; label: string; left: number; top: number };
type VisualState = {
  source: HTMLElement;
  chunks: Array<{ node: Text; start: number; end: number }>;
  text: string;
  anchor: number;
  focus: number;
};
type Mark = { rowId: string | null; rowOffset: number; scrollTop: number };
export type VimFocusDirection = "h" | "j" | "k" | "l";
export type VimFocusRegionId = "sidebar" | "conversation" | "composer";
export type VimFocusRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type VimFocusRegion = {
  id: VimFocusRegionId;
  rect: VimFocusRect;
};

export function buildVimHintLabels(length: number): string[] {
  if (length <= HINT_ALPHABET.length) return HINT_ALPHABET.slice(0, length).split("");
  const width = Math.ceil(Math.log(length) / Math.log(HINT_ALPHABET.length));
  return Array.from({ length }, (_, index) => {
    let value = index;
    let label = "";
    for (let position = 0; position < width; position += 1) {
      label = HINT_ALPHABET[value % HINT_ALPHABET.length]! + label;
      value = Math.floor(value / HINT_ALPHABET.length);
    }
    return label;
  });
}

export function nextVimListIndex(
  length: number,
  current: number,
  direction: -1 | 1,
  count: number,
): number {
  if (length <= 0) return -1;
  if (current < 0) return direction > 0 ? 0 : length - 1;
  return Math.max(0, Math.min(length - 1, current + direction * Math.max(1, count)));
}

export function nextDirectionalVimRegion(
  regions: ReadonlyArray<VimFocusRegion>,
  currentId: VimFocusRegionId,
  direction: VimFocusDirection,
  sourceRect?: VimFocusRect,
): VimFocusRegionId | null {
  const current = regions.find((region) => region.id === currentId);
  const source = sourceRect ?? current?.rect;
  if (!source) return null;

  const sourceX = (source.left + source.right) / 2;
  const sourceY = (source.top + source.bottom) / 2;
  const horizontal = direction === "h" || direction === "l";
  const sign = direction === "h" || direction === "k" ? -1 : 1;

  return (
    regions
      .filter((region) => region.id !== currentId)
      .map((region) => {
        const candidateX = (region.rect.left + region.rect.right) / 2;
        const candidateY = (region.rect.top + region.rect.bottom) / 2;
        const primaryDelta = sign * (horizontal ? candidateX - sourceX : candidateY - sourceY);
        const perpendicularOverlap = horizontal
          ? Math.min(region.rect.bottom, source.bottom) - Math.max(region.rect.top, source.top)
          : Math.min(region.rect.right, source.right) - Math.max(region.rect.left, source.left);
        if (primaryDelta <= 1 || perpendicularOverlap <= 1) return null;
        const perpendicularDelta = Math.abs(
          horizontal ? candidateY - sourceY : candidateX - sourceX,
        );
        return { id: region.id, score: primaryDelta + perpendicularDelta / 4 };
      })
      .filter((candidate) => candidate !== null)
      .sort((left, right) => left.score - right.score)[0]?.id ?? null
  );
}

function visible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
}

function rendered(element: HTMLElement): boolean {
  return (
    element.getClientRects().length > 0 && element.closest("[hidden], [aria-hidden=true]") === null
  );
}

function collectHints(): Hint[] {
  const elements = [...document.querySelectorAll<HTMLElement>(HINT_SELECTOR)].filter(
    (element) =>
      visible(element) && !element.closest("[data-vim-hint-ignore], [data-terminal-root], webview"),
  );
  const labels = buildVimHintLabels(elements.length);
  return elements.map((element, index) => {
    const rect = element.getBoundingClientRect();
    return { element, label: labels[index]!, left: rect.left, top: rect.top };
  });
}

function collectVisualText(source: HTMLElement): Omit<VisualState, "source" | "anchor" | "focus"> {
  const chunks: VisualState["chunks"] = [];
  let text = "";
  const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      return parent?.closest("button, input, textarea, select, [aria-hidden=true], script, style")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.textContent ?? "";
    if (value.length === 0) continue;
    const start = text.length;
    text += value;
    chunks.push({ node: node as Text, start, end: text.length });
  }
  return { chunks, text };
}

function pointAt(chunks: VisualState["chunks"], offset: number) {
  const last = chunks.at(-1);
  if (!last) return null;
  const bounded = Math.max(0, Math.min(last.end, offset));
  const chunk = chunks.find((entry) => bounded < entry.end) ?? last;
  return {
    node: chunk.node,
    offset: Math.max(0, Math.min(chunk.node.length, bounded - chunk.start)),
  };
}

function renderVisualSelection(state: VisualState): void {
  if (!state.source.isConnected) return;
  const range = orderedRange(state.anchor, state.focus, true);
  const start = pointAt(state.chunks, range.start);
  const end = pointAt(state.chunks, range.end);
  if (!start || !end) return;
  const domRange = document.createRange();
  domRange.setStart(start.node, start.offset);
  domRange.setEnd(end.node, end.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(domRange);
  document.dispatchEvent(new Event("selectionchange"));
}

function firstVisibleAssistantSource(): HTMLElement | null {
  const sources = [...document.querySelectorAll<HTMLElement>("[data-assistant-citation-source]")]
    .filter(visible)
    .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);
  const middle = window.innerHeight / 2;
  return (
    sources.find((source) => {
      const rect = source.getBoundingClientRect();
      return rect.top <= middle && rect.bottom >= middle;
    }) ??
    sources[0] ??
    null
  );
}

function sidebarItems(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(SIDEBAR_ITEM_SELECTOR)].filter(
    (element) => rendered(element) && !element.matches(":disabled, [aria-disabled=true]"),
  );
}

function focusSidebar(): void {
  const focusTarget = () => {
    const items = sidebarItems();
    const target =
      items.find((item) => item.matches('[aria-current="page"], [data-active=true]')) ??
      items.find((item) => item.closest("[data-thread-item]")) ??
      items[0];
    target?.focus({ preventScroll: false });
  };
  const sidebar = document.querySelector<HTMLElement>("[data-app-sidebar]");
  if (!sidebar || !visible(sidebar)) {
    document.querySelector<HTMLElement>('[aria-label="Toggle main sidebar"]')?.click();
    requestAnimationFrame(() => requestAnimationFrame(focusTarget));
    return;
  }
  focusTarget();
}

function focusConversation(scrollNode: HTMLElement | null): void {
  if (!scrollNode) return;
  scrollNode.tabIndex = -1;
  scrollNode.focus({ preventScroll: true });
}

function focusComposerRegion(focusComposer: () => void): void {
  const editor = document.querySelector<HTMLElement>('[data-testid="composer-editor"]');
  if (editor && visible(editor)) editor.focus({ preventScroll: true });
  else focusComposer();
}

function vimFocusRegions(scrollNode: HTMLElement | null): VimFocusRegion[] {
  const regions: VimFocusRegion[] = [];
  const sidebar = document.querySelector<HTMLElement>("[data-app-sidebar]");
  const composer = document.querySelector<HTMLElement>('[data-testid="composer-editor"]');
  const composerRect = composer && visible(composer) ? composer.getBoundingClientRect() : null;

  if (sidebar && visible(sidebar))
    regions.push({ id: "sidebar", rect: sidebar.getBoundingClientRect() });
  if (scrollNode && visible(scrollNode)) {
    const rect = scrollNode.getBoundingClientRect();
    const bottom = composerRect ? Math.min(rect.bottom, composerRect.top) : rect.bottom;
    regions.push({
      id: "conversation",
      rect:
        bottom > rect.top ? { left: rect.left, right: rect.right, top: rect.top, bottom } : rect,
    });
  }
  if (composerRect) regions.push({ id: "composer", rect: composerRect });
  return regions;
}

function activeVimFocusRegion(
  active: Element | null,
  scrollNode: HTMLElement | null,
): VimFocusRegionId {
  if (active instanceof HTMLElement && active.closest("[data-app-sidebar]")) return "sidebar";
  if (
    active instanceof HTMLElement &&
    active.closest('[data-chat-composer-form="true"], [data-testid="composer-editor"]')
  ) {
    return "composer";
  }
  if (scrollNode?.contains(active)) return "conversation";
  return "conversation";
}

function focusSidebarSearch(): void {
  const focusSearch = () =>
    document.querySelector<HTMLElement>('[aria-label="Search threads"]')?.focus();
  const sidebar = document.querySelector<HTMLElement>("[data-app-sidebar]");
  if (!sidebar || !visible(sidebar)) {
    document.querySelector<HTMLElement>('[aria-label="Toggle main sidebar"]')?.click();
    requestAnimationFrame(() => requestAnimationFrame(focusSearch));
    return;
  }
  focusSearch();
}

function moveSidebarFocus(direction: -1 | 1, repetitions: number): void {
  const items = sidebarItems();
  if (items.length === 0) return;
  const active = document.activeElement;
  const current = active instanceof HTMLElement ? items.indexOf(active) : -1;
  const next = nextVimListIndex(items.length, current, direction, repetitions);
  items[next]?.focus({ preventScroll: false });
}

export function TimelineVimMode({
  routeKey,
  getScrollNode,
  focusComposer,
  onUserNavigation,
  onScrollToEnd,
}: {
  routeKey: string;
  getScrollNode: () => HTMLElement | null;
  focusComposer: () => void;
  onUserNavigation: () => void;
  onScrollToEnd: () => void;
}) {
  const [view, setView] = useState({
    mode: "NORMAL" as "NORMAL" | "PASS" | "VISUAL" | "HINT",
    count: "",
    pending: "",
    hintInput: "",
    hints: [] as Hint[],
    helpOpen: false,
  });
  const stateRef = useRef({
    mode: "NORMAL" as "NORMAL" | "PASS" | "VISUAL" | "HINT",
    count: "",
    pending: "",
    hintInput: "",
    hints: [] as Hint[],
    hintFocusOnly: false,
    helpOpen: false,
    visual: null as VisualState | null,
    marks: new Map<string, Mark>(),
    previousJump: null as Mark | null,
  });
  const update = useCallback(() => {
    const state = stateRef.current;
    setView({
      mode: state.mode,
      count: state.count,
      pending: state.pending,
      hintInput: state.hintInput,
      hints: state.hints,
      helpOpen: state.helpOpen,
    });
  }, []);
  const clear = useCallback(() => {
    const state = stateRef.current;
    state.count = "";
    state.pending = "";
    state.hintInput = "";
    state.hints = [];
    state.helpOpen = false;
    if (state.mode !== "PASS") state.mode = "NORMAL";
    update();
  }, [update]);

  useEffect(() => {
    const currentMark = (): Mark | null => {
      const scrollNode = getScrollNode();
      if (!scrollNode) return null;
      const viewport = scrollNode.getBoundingClientRect();
      const rows = [...scrollNode.querySelectorAll<HTMLElement>("[data-timeline-row-id]")];
      const row = rows.find((candidate) => candidate.getBoundingClientRect().bottom > viewport.top);
      return {
        rowId: row?.dataset.timelineRowId ?? null,
        rowOffset: row ? viewport.top - row.getBoundingClientRect().top : 0,
        scrollTop: scrollNode.scrollTop,
      };
    };
    const jumpToMark = (mark: Mark) => {
      const scrollNode = getScrollNode();
      if (!scrollNode) return;
      stateRef.current.previousJump = currentMark();
      const row = [...scrollNode.querySelectorAll<HTMLElement>("[data-timeline-row-id]")].find(
        (candidate) => candidate.dataset.timelineRowId === mark.rowId,
      );
      onUserNavigation();
      scrollNode.scrollTop = row
        ? scrollNode.scrollTop +
          row.getBoundingClientRect().top -
          scrollNode.getBoundingClientRect().top +
          mark.rowOffset
        : mark.scrollTop;
    };
    const moveMessage = (direction: -1 | 1, repetitions: number) => {
      const scrollNode = getScrollNode();
      if (!scrollNode) return;
      onUserNavigation();
      for (let index = 0; index < repetitions; index += 1) {
        const viewport = scrollNode.getBoundingClientRect();
        const rows = [...scrollNode.querySelectorAll<HTMLElement>("[data-timeline-row-id]")].filter(
          (row) => row.dataset.messageId,
        );
        const target =
          direction > 0
            ? rows.find((row) => row.getBoundingClientRect().top > viewport.top + 12)
            : rows.toReversed().find((row) => row.getBoundingClientRect().top < viewport.top - 12);
        if (target) target.scrollIntoView({ block: "start" });
        else scrollNode.scrollBy({ top: direction * scrollNode.clientHeight * 0.8 });
      }
    };
    const beginVisual = (linewise: boolean) => {
      const source = firstVisibleAssistantSource();
      if (!source) return;
      const collected = collectVisualText(source);
      if (!collected.text) return;
      const anchor = collected.text.search(/\S/u);
      const visual: VisualState = {
        source,
        ...collected,
        anchor: Math.max(0, anchor),
        focus: linewise ? collected.text.length : Math.max(0, anchor),
      };
      stateRef.current.visual = visual;
      stateRef.current.mode = "VISUAL";
      renderVisualSelection(visual);
      update();
    };
    const finishHints = (hint: Hint) => {
      if (stateRef.current.hintFocusOnly || hint.element.matches(EDITABLE_SELECTOR)) {
        hint.element.focus({ preventScroll: false });
      } else {
        hint.element.click();
      }
      stateRef.current.mode = "NORMAL";
      clear();
    };
    const openHints = (focusOnly: boolean) => {
      const hints = collectHints();
      stateRef.current.mode = "HINT";
      stateRef.current.hints = hints;
      stateRef.current.hintInput = "";
      stateRef.current.hintFocusOnly = focusOnly;
      update();
    };
    const focusRegion = (region: VimFocusRegionId) => {
      if (region === "sidebar") focusSidebar();
      else if (region === "composer") focusComposerRegion(focusComposer);
      else focusConversation(getScrollNode());
    };
    const moveWindowFocus = (direction: VimFocusDirection, active: Element | null) => {
      const scrollNode = getScrollNode();
      const current = activeVimFocusRegion(active, scrollNode);
      if (direction === "h" && current !== "sidebar") {
        const sidebar = document.querySelector<HTMLElement>("[data-app-sidebar]");
        if (!sidebar || !visible(sidebar)) {
          focusSidebar();
          return;
        }
      }
      const regions = vimFocusRegions(scrollNode);
      const currentRect = regions.find((region) => region.id === current)?.rect;
      const activeRect =
        active instanceof HTMLElement && current !== "conversation" && rendered(active)
          ? active.getBoundingClientRect()
          : currentRect;
      const next = nextDirectionalVimRegion(regions, current, direction, activeRect);
      if (next) focusRegion(next);
    };
    const cycleWindowFocus = (active: Element | null) => {
      const order: VimFocusRegionId[] = ["sidebar", "conversation", "composer"];
      const current = activeVimFocusRegion(active, getScrollNode());
      focusRegion(order[(order.indexOf(current) + 1) % order.length]!);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      const state = stateRef.current;
      const consume = () => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      if (state.mode === "PASS") {
        if (event.key === "Escape") {
          event.preventDefault();
          state.mode = "NORMAL";
          clear();
        }
        return;
      }
      const active = document.activeElement;
      if (isTerminalFocused() || isPreviewFocused()) return;
      if ([...document.querySelectorAll<HTMLElement>(FLOATING_SELECTOR)].some(visible)) {
        return;
      }
      const sidebarSearch =
        active instanceof HTMLElement && active.matches('[aria-label="Search threads"]')
          ? active
          : null;
      if (event.ctrlKey && event.key.toLowerCase() === "w") {
        consume();
        state.pending = "CTRL-W";
        update();
        return;
      }
      if (state.pending === "CTRL-W") {
        consume();
        state.pending = "";
        if (["h", "j", "k", "l"].includes(event.key))
          moveWindowFocus(event.key as VimFocusDirection, active);
        else if (event.key === "w") cycleWindowFocus(active);
        update();
        return;
      }
      if (sidebarSearch && event.ctrlKey && (event.key === "n" || event.key === "p")) {
        consume();
        sidebarSearch.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: event.key === "n" ? "ArrowDown" : "ArrowUp",
            bubbles: true,
            cancelable: true,
          }),
        );
        return;
      }
      if (active?.closest(EDITABLE_SELECTOR)) return;
      if (
        event.metaKey ||
        event.altKey ||
        (event.ctrlKey && event.key !== "d" && event.key !== "u")
      ) {
        return;
      }
      if (event.key === "Escape") {
        consume();
        window.getSelection()?.removeAllRanges();
        state.visual = null;
        state.mode = "NORMAL";
        clear();
        return;
      }
      if (state.helpOpen) {
        consume();
        state.helpOpen = false;
        update();
        return;
      }
      if (state.mode === "HINT") {
        consume();
        if (event.key === "Backspace") state.hintInput = state.hintInput.slice(0, -1);
        else if (event.key.length === 1) state.hintInput += event.key.toLowerCase();
        const matches = state.hints.filter((hint) => hint.label.startsWith(state.hintInput));
        if (matches.length === 1 && matches[0]!.label === state.hintInput) finishHints(matches[0]!);
        else if (matches.length === 0) clear();
        else update();
        return;
      }
      const repetitions = Math.max(1, Number.parseInt(state.count || "1", 10));
      if (state.mode === "VISUAL" && state.visual) {
        const visual = state.visual;
        if (event.key === "y" || event.key === "Enter") {
          consume();
          const range = orderedRange(visual.anchor, visual.focus, true);
          void navigator.clipboard
            ?.writeText(visual.text.slice(range.start, range.end))
            .catch(() => undefined);
          window.getSelection()?.removeAllRanges();
          state.visual = null;
          state.mode = "NORMAL";
          clear();
          return;
        }
        if (event.key === "c") {
          consume();
          document.dispatchEvent(new Event("selectionchange"));
          requestAnimationFrame(() => {
            document
              .querySelector<HTMLButtonElement>('[aria-label="Cite selection in composer"]')
              ?.click();
          });
          state.visual = null;
          state.mode = "NORMAL";
          clear();
          return;
        }
        if (event.key === "o") {
          consume();
          [visual.anchor, visual.focus] = [visual.focus, visual.anchor];
          renderVisualSelection(visual);
          update();
          return;
        }
        const motion =
          event.key === "G"
            ? "G"
            : event.key === "$" ||
                event.key === "0" ||
                event.key === "^" ||
                ["h", "j", "k", "l", "w", "b", "e", "{", "}"].includes(event.key)
              ? (event.key as VimMotion)
              : null;
        if (motion) {
          consume();
          visual.focus = moveTextCursor(visual.text, visual.focus, motion, repetitions);
          state.count = "";
          renderVisualSelection(visual);
          update();
          return;
        }
      }
      if (/^[1-9]$/u.test(event.key) || (event.key === "0" && state.count)) {
        consume();
        state.count += event.key;
        update();
        return;
      }
      if (state.pending === "g") {
        consume();
        state.pending = "";
        state.count = "";
        if (event.key === "g") {
          const scrollNode = getScrollNode();
          if (scrollNode) {
            state.previousJump = currentMark();
            onUserNavigation();
            scrollNode.scrollTop = 0;
          }
        } else if (event.key === "i") {
          focusComposer();
        }
        update();
        return;
      }
      if (state.pending === "SPACE") {
        consume();
        state.pending = "";
        if (event.key === "f") openCommandPalette({ mode: "files" });
        else if (event.key === "/") openCommandPalette({ mode: "content" });
        else if (event.key === "b") openCommandPalette({ mode: "command" });
        else if (event.key === "s") focusSidebar();
        update();
        return;
      }
      if (state.pending === "m" || state.pending === "`") {
        consume();
        const pending = state.pending;
        state.pending = "";
        if (event.key === "`" && pending === "`" && state.previousJump)
          jumpToMark(state.previousJump);
        else if (/^[a-z]$/iu.test(event.key)) {
          if (pending === "m") {
            const mark = currentMark();
            if (mark) state.marks.set(`${routeKey}:${event.key.toLowerCase()}`, mark);
          } else {
            const mark = state.marks.get(`${routeKey}:${event.key.toLowerCase()}`);
            if (mark) jumpToMark(mark);
          }
        }
        update();
        return;
      }
      const scrollNode = getScrollNode();
      const sidebarActive = active instanceof HTMLElement && active.closest("[data-app-sidebar]");
      if (sidebarActive) {
        if (event.key === "j" || event.key === "k") {
          consume();
          moveSidebarFocus(event.key === "j" ? 1 : -1, repetitions);
        } else if (event.key === "/") {
          consume();
          focusSidebarSearch();
        } else if (event.key === "Enter" || event.key === "o" || event.key === "l") {
          consume();
          if (
            event.key !== "l" ||
            !(active instanceof HTMLElement) ||
            active.ariaExpanded !== "true"
          ) {
            if (active instanceof HTMLElement) active.click();
          }
        } else if (event.key === "h") {
          consume();
          if (active instanceof HTMLElement && active.ariaExpanded === "true") active.click();
        } else {
          return;
        }
        state.count = "";
        update();
        return;
      }
      if (
        event.key === "j" ||
        event.key === "k" ||
        (event.ctrlKey && (event.key === "d" || event.key === "u"))
      ) {
        consume();
        if (!scrollNode) return;
        const direction = event.key === "j" || event.key === "d" ? 1 : -1;
        onUserNavigation();
        const distance = event.ctrlKey ? scrollNode.clientHeight / 2 : 64;
        scrollNode.scrollBy({ top: direction * distance * repetitions });
        state.count = "";
        update();
        return;
      }
      if (event.key === "{") {
        consume();
        moveMessage(-1, repetitions);
      } else if (event.key === "}") {
        consume();
        moveMessage(1, repetitions);
      } else if (event.key === "G") {
        consume();
        state.previousJump = currentMark();
        onScrollToEnd();
      } else if (event.key === "g" || event.key === "m" || event.key === "`") {
        consume();
        state.pending = event.key;
      } else if (event.key === "f" || event.key === "F") {
        consume();
        openHints(event.key === "F");
        return;
      } else if (event.key === "v" || event.key === "V") {
        consume();
        beginVisual(event.key === "V");
        return;
      } else if (event.key === "i") {
        consume();
        focusComposer();
        queueMicrotask(() => {
          document
            .querySelector<HTMLElement>('[data-testid="composer-editor"]')
            ?.dispatchEvent(new Event("t3-vim-insert"));
        });
      } else if (event.key === "?") {
        consume();
        state.helpOpen = true;
      } else if (event.key === "z") {
        consume();
        state.mode = "PASS";
      } else if (event.key === ":") {
        consume();
        openCommandPalette({ mode: "command" });
      } else if (event.key === "/") {
        consume();
        const search = document.querySelector<HTMLElement>('[aria-label="Search threads"]');
        if (search) focusSidebarSearch();
        else openCommandPalette({ mode: "content" });
      } else if (event.key === " ") {
        consume();
        state.pending = "SPACE";
      } else if (event.key.length === 1) {
        consume();
      } else {
        return;
      }
      state.count = "";
      update();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [clear, focusComposer, getScrollNode, onScrollToEnd, onUserNavigation, routeKey, update]);

  const matchingHints = view.hints.filter((hint) => hint.label.startsWith(view.hintInput));
  return (
    <div className="contents" data-timeline-vim-mode="" data-vim-hint-ignore="true">
      <div className="pointer-events-none absolute bottom-3 left-3 z-40 rounded bg-background/90 px-2 py-1 font-mono text-[10px] font-semibold text-primary shadow-sm ring-1 ring-border">
        {view.mode}
        {view.count || view.pending ? ` ${view.count}${view.pending}` : ""}
      </div>
      {view.mode === "HINT"
        ? matchingHints.map((hint) => (
            <span
              key={hint.label}
              className="pointer-events-none fixed z-100 rounded-sm bg-amber-300 px-1 py-0.5 font-mono text-[11px] font-bold text-black shadow ring-1 ring-black/30"
              style={{ left: hint.left, top: hint.top }}
            >
              {hint.label.slice(0, view.hintInput.length) ? (
                <span className="text-red-700">{hint.label.slice(0, view.hintInput.length)}</span>
              ) : null}
              {hint.label.slice(view.hintInput.length)}
            </span>
          ))
        : null}
      {view.helpOpen ? (
        <div className="fixed inset-0 z-90 flex items-center justify-center bg-black/35 p-4">
          <div className="max-w-xl rounded-xl bg-popover p-5 text-sm text-popover-foreground shadow-xl ring-1 ring-border">
            <h2 className="mb-3 text-base font-semibold">T3 Vim keyboard mode</h2>
            <div className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 font-mono">
              <kbd>j / k</kbd>
              <span>scroll down / up</span>
              <kbd>Ctrl-d / Ctrl-u</kbd>
              <span>half page down / up</span>
              <kbd>gg / G</kbd>
              <span>conversation start / end</span>
              <kbd>{"{ / }"}</kbd>
              <span>previous / next message</span>
              <kbd>m… / `… / ``</kbd>
              <span>set mark / jump / jump back</span>
              <kbd>f / F</kbd>
              <span>activate / focus a visible control</span>
              <kbd>Ctrl-w h / j / k / l</kbd>
              <span>focus left / down / up / right</span>
              <kbd>Ctrl-w w</kbd>
              <span>cycle threads / conversation / composer</span>
              <kbd>Sidebar j / k</kbd>
              <span>previous / next project or thread</span>
              <kbd>Sidebar / · Enter</kbd>
              <span>filter threads · open selection</span>
              <kbd>i / gi</kbd>
              <span>composer Insert / Normal mode</span>
              <kbd>v / V</kbd>
              <span>select assistant text / whole response</span>
              <kbd>y / c</kbd>
              <span>copy / cite a visual selection</span>
              <kbd>z</kbd>
              <span>pass keys through until Escape</span>
              <kbd>: · Space f / /</kbd>
              <span>commands · files / conversation search</span>
            </div>
            <p className="mt-4 text-muted-foreground">Press any key to close this help.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
