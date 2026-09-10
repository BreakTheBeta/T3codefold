import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

const eventName = "t3code:open-pitboss-panel";
type Target = { environmentId: EnvironmentId; threadId: ThreadId };

export function openPitbossPanel(target: Target): void {
  window.dispatchEvent(new CustomEvent<Target>(eventName, { detail: target }));
}

export function onOpenPitbossPanel(listener: (target: Target) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<Target>).detail);
  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
}
