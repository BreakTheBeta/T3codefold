export type WorkspaceThumbAction = "previous" | "next" | "sidebar" | "inspector";

/** Only a deliberate swipe of the dedicated handle navigates; code and system edges stay untouched. */
export function resolveWorkspaceThumbAction(x: number, y: number): WorkspaceThumbAction | null {
  if (Math.max(Math.abs(x), Math.abs(y)) < 40) return null;
  if (Math.abs(x) > Math.abs(y) * 1.3) return x > 0 ? "previous" : "next";
  if (Math.abs(y) > Math.abs(x) * 1.3) return y < 0 ? "sidebar" : "inspector";
  return null;
}
