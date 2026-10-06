import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { THREAD_JUMP_KEYBINDING_COMMANDS } from "@t3tools/contracts";
import { useCallback } from "react";

import { scopedThreadKey } from "../../lib/scopedEntities";
import type { ThreadListV2ListItem } from "../threads/threadListV2";
import {
  useHardwareKeyboardCommand,
  type HardwareKeyboardCommand,
} from "./hardwareKeyboardCommands";

type ThreadShortcutListItem = ThreadListV2ListItem | { readonly type: "v2-show-more" };

const THREAD_TRAVERSAL_COMMANDS: ReadonlyArray<HardwareKeyboardCommand> = [
  "thread.previous",
  "thread.next",
];
const NO_COMMANDS: ReadonlyArray<HardwareKeyboardCommand> = [];

export function threadJumpIndex(command: HardwareKeyboardCommand) {
  return THREAD_JUMP_KEYBINDING_COMMANDS.findIndex((candidate) => candidate === command);
}

/** Uses the rendered list so filters and shelves keep their order. */
export function threadJumpTarget(
  items: ReadonlyArray<ThreadShortcutListItem>,
  command: HardwareKeyboardCommand,
) {
  let index = threadJumpIndex(command);
  if (index < 0) return null;
  for (const item of items) {
    const thread = item.type === "v2-thread" ? item.item.thread : null;
    if (thread !== null && index-- === 0) return thread;
  }
  return null;
}

/**
 * The thread before or after the selected one in rendered order, without wrapping. With nothing
 * selected, next starts at the top and previous at the bottom, matching the web sidebar.
 */
export function adjacentThreadTarget(
  items: ReadonlyArray<ThreadShortcutListItem>,
  selectedThreadKey: string | null,
  direction: "previous" | "next",
) {
  const threads = items.flatMap((item) => (item.type === "v2-thread" ? [item.item.thread] : []));
  if (selectedThreadKey === null) {
    return (direction === "previous" ? threads.at(-1) : threads[0]) ?? null;
  }
  const index = threads.findIndex(
    (thread) => scopedThreadKey(thread.environmentId, thread.id) === selectedThreadKey,
  );
  if (index < 0) return null;
  return threads[direction === "previous" ? index - 1 : index + 1] ?? null;
}

/**
 * Thread jump shortcuts over a rendered list. Pass `selectedThreadKey` (null when nothing is
 * selected) to also step to the previous/next thread; lists without a selection omit it.
 */
export function useThreadJumpShortcuts(
  items: ReadonlyArray<ThreadShortcutListItem>,
  onSelectThread: (thread: EnvironmentThreadShell) => void,
  selectedThreadKey?: string | null,
) {
  const jumpToThread = useCallback(
    (command: HardwareKeyboardCommand) => {
      const thread = threadJumpTarget(items, command);
      if (thread !== null) onSelectThread(thread);
      return true;
    },
    [items, onSelectThread],
  );
  useHardwareKeyboardCommand(THREAD_JUMP_KEYBINDING_COMMANDS, jumpToThread);

  const traverseThreads = useCallback(
    (command: HardwareKeyboardCommand) => {
      const thread = adjacentThreadTarget(
        items,
        selectedThreadKey ?? null,
        command === "thread.previous" ? "previous" : "next",
      );
      if (thread !== null) onSelectThread(thread);
      return true;
    },
    [items, onSelectThread, selectedThreadKey],
  );
  useHardwareKeyboardCommand(
    selectedThreadKey === undefined ? NO_COMMANDS : THREAD_TRAVERSAL_COMMANDS,
    traverseThreads,
  );
}
