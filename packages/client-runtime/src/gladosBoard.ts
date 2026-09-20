import {
  isUserWorkMessage,
  workNeedsUserInput,
  type PitbossMessage,
  type PitbossSnapshot,
  type PitbossAttempt,
  type PitbossTask,
} from "@t3tools/contracts";

// Like t3code-custom's agent board, lanes follow live state rather than manual moves.
export const GLADOS_BOARD_LANES = [
  { id: "needs-you", label: "Chat input", tone: "attention" },
  { id: "queued", label: "Up next", tone: "muted" },
  { id: "working", label: "Working", tone: "working" },
  { id: "review", label: "Verifying", tone: "review" },
  { id: "waiting", label: "Waiting", tone: "muted" },
  { id: "done", label: "Delivered", tone: "done" },
  { id: "closed", label: "Closed", tone: "muted" },
] as const;
export type GladosBoardLaneId = (typeof GLADOS_BOARD_LANES)[number]["id"];
export type GladosBoardItem =
  | { key: string; task: PitbossTask; message?: never }
  | { key: string; task?: never; message: PitbossMessage };

export interface ManagedWorkerRow {
  readonly attemptId: string;
  readonly current: boolean;
  readonly generation: number;
  readonly model: string;
  readonly state: PitbossAttempt["state"];
  readonly threadId: PitbossAttempt["threadId"];
}

/** Current worker first, while retaining prior attempts as navigable history. */
export function managedWorkerRows(task: PitbossTask): ManagedWorkerRow[] {
  const current = task.attempts.at(-1)?.id;
  return [...task.attempts].reverse().map((attempt) => ({
    attemptId: attempt.id,
    current: attempt.id === current,
    generation: attempt.generation,
    model: attempt.model.model,
    state: attempt.state,
    threadId: attempt.threadId,
  }));
}

export function isManagedWorkerLive(attempt: PitbossAttempt | undefined): boolean {
  return !!attempt && ["pending", "running", "submitted", "stop_requested"].includes(attempt.state);
}

export function gladosTaskLane(task: PitbossTask, hasQuestion = false): GladosBoardLaneId {
  if (task.status === "done") return "done";
  if (task.status === "cancelled") return "closed";
  if (hasQuestion || workNeedsUserInput(task)) return "needs-you";
  switch (task.status) {
    case "queued":
      return "queued";
    case "active":
      return isManagedWorkerLive(task.attempts.at(-1)) ? "working" : "waiting";
    case "verifying":
      return "review";
    case "blocked":
      return "waiting";
  }
}

/** One card per outcome; task questions stay with their outcome and evidence. */
export function buildGladosBoard(
  state: Pick<PitbossSnapshot, "tasks" | "messages">,
  filter: { query?: string; projectId?: string } = {},
) {
  const query = filter.query?.trim().toLocaleLowerCase() ?? "";
  const questions = new Set(
    state.messages.filter(isUserWorkMessage).map((message) => message.taskId),
  );
  const ids = new Set(state.tasks.map((task) => task.id));
  const lanes = GLADOS_BOARD_LANES.map((lane) => ({ ...lane, items: [] as GladosBoardItem[] }));
  const add = (laneId: GladosBoardLaneId, item: GladosBoardItem) => {
    lanes.find((lane) => lane.id === laneId)!.items.push(item);
  };
  for (const task of [...state.tasks].sort(
    (a, b) => a.priority - b.priority || b.updatedAt.localeCompare(a.updatedAt),
  )) {
    if (filter.projectId && task.projectId !== filter.projectId) continue;
    if (query && !`${task.title} ${task.outcome} ${task.note}`.toLocaleLowerCase().includes(query))
      continue;
    add(gladosTaskLane(task, questions.has(task.id)), { key: `task:${task.id}`, task });
  }
  for (const message of state.messages) {
    if (message.acknowledged || (message.taskId && ids.has(message.taskId)) || filter.projectId)
      continue;
    if (query && !message.text.toLocaleLowerCase().includes(query)) continue;
    add(isUserWorkMessage(message) ? "needs-you" : "working", {
      key: `message:${message.id}`,
      message,
    });
  }
  return lanes;
}

/** Measure the modal itself so folding, rotation, and split-screen keep cards usable. */
export function gladosBoardColumnWidth(width: number) {
  return Math.max(200, Math.min(300, width - 40));
}
