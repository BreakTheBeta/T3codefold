import type { HerdrWorkspace, HerdrWorkspaceState } from "@t3tools/client-runtime/herdr/workspace";
import { EyeIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";

import { cn } from "~/lib/utils";
import { ComposerControl, ComposerControlIcon } from "../chat/ComposerControl";
import { herdrKeyName } from "./herdrKeys";

const REFRESH_MS = 1500;
const KEY_BATCH_MS = 120;
const KEY_BAR = [
  ["↑", "up"],
  ["↓", "down"],
  ["←", "left"],
  ["→", "right"],
  ["Enter", "enter"],
  ["Esc", "esc"],
  ["Tab", "tab"],
  ["Ctrl+C", "ctrl+c"],
] as const;

/** A Herdr terminal's screen, for TUI tools and for agents without a recorded conversation. */
export function HerdrPaneView({
  workspace,
  state,
  readOnly,
  run,
}: {
  readonly workspace: HerdrWorkspace;
  readonly state: HerdrWorkspaceState;
  readonly readOnly: boolean;
  readonly run: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  const screenRef = useRef<HTMLPreElement>(null);
  const atEnd = useRef(true);
  const queued = useRef<{ terminal: string; keys: string[] } | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentId = state.selected?.id ?? null;
  const pane = state.pane?.terminal === agentId ? state.pane : null;
  const canPress = workspace.canPressKeys();

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Core has no screen stream on this connection; poll the visible pane.
  useEffect(() => {
    if (state.connection !== "connected" || agentId === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!document.hidden) await workspace.readPane().catch(() => undefined);
      if (!stopped) timer = setTimeout(() => void tick(), REFRESH_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [workspace, state.connection, agentId]);

  const paneText = pane?.text ?? null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Scrolls the DOM screen to its bottom row until the reader scrolls away, like a terminal.
  useLayoutEffect(() => {
    const element = screenRef.current;
    if (paneText !== null && element && atEnd.current) element.scrollTop = element.scrollHeight;
  }, [paneText]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Unmounting drops a batch that never left; it was not sent.
  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
    },
    [],
  );

  const press = (keys: readonly string[]) => {
    if (agentId === null) return;
    // Keys go to the terminal they were typed in, even if another is selected before they send.
    if (queued.current && queued.current.terminal !== agentId) flush();
    if (queued.current === null) queued.current = { terminal: agentId, keys: [] };
    queued.current.keys.push(...keys);
    if (flushTimer.current === null) flushTimer.current = setTimeout(flush, KEY_BATCH_MS);
  };
  function flush() {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = null;
    const batch = queued.current;
    queued.current = null;
    if (batch) void run(() => workspace.pressKeys(batch.terminal, batch.keys));
  }
  const onKeyDown = (event: KeyboardEvent<HTMLPreElement>) => {
    if (!canPress || event.nativeEvent.isComposing) return;
    const name = herdrKeyName(event);
    if (name === null) return;
    event.preventDefault();
    press([name]);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <pre
        ref={screenRef}
        tabIndex={0}
        role="log"
        aria-label={`${state.selected?.label ?? "Terminal"} screen`}
        aria-live="off"
        onKeyDown={onKeyDown}
        onScroll={(event) => {
          const element = event.currentTarget;
          atEnd.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
        }}
        className={cn(
          "min-h-0 flex-1 overflow-auto px-5 py-4 font-mono text-xs leading-snug whitespace-pre text-foreground outline-none",
          canPress && "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        )}
      >
        {pane ? pane.text : "Reading terminal…"}
      </pre>
      <div className="chat-content-lane flex shrink-0 flex-wrap items-center gap-2 px-4 pt-2 pb-4">
        {readOnly ? (
          <ComposerControl
            render={<span />}
            aria-label="Read-only connection"
            className="pointer-events-none"
          >
            <ComposerControlIcon icon={EyeIcon} />
            <span>Read only</span>
          </ComposerControl>
        ) : (
          KEY_BAR.map(([label, key]) => (
            <ComposerControl
              key={key}
              aria-label={`Press ${label}`}
              disabled={!canPress}
              onClick={() => press([key])}
            >
              <span className="font-mono text-xs">{label}</span>
            </ComposerControl>
          ))
        )}
        <span className="ms-auto text-xs text-muted-foreground" role="status">
          {state.pendingKeys > 0
            ? "Pressing keys…"
            : canPress
              ? "Click the screen to type into it"
              : pane && !pane.complete
                ? "Showing the screen only"
                : null}
        </span>
      </div>
    </div>
  );
}
