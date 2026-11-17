import { voiceInputBlocksSubmission } from "@t3tools/client-runtime/voice-input";
import type { VoiceInputSnapshot } from "../voice-input/voiceInputSession";

type Session = {
  readonly getSnapshot: () => Pick<VoiceInputSnapshot, "ownerKey" | "state" | "focusedOwners">;
  readonly subscribe: (listener: () => void) => () => void;
  readonly controller: { readonly cancel: () => unknown };
};

export function createControllerDictationOwnership() {
  let owned: {
    surface: string;
    session: Session;
    ownerKey: string;
    unsubscribe: () => void;
  } | null = null;
  const release = () => {
    const previous = owned;
    owned = null;
    previous?.unsubscribe();
  };
  return {
    owns(surface: string) {
      if (owned?.surface !== surface) return false;
      const current = owned.session.getSnapshot();
      return current.ownerKey === owned.ownerKey && voiceInputBlocksSubmission(current.state);
    },
    start(surface: string, session: Session, start: () => unknown) {
      if (voiceInputBlocksSubmission(session.getSnapshot().state)) return;
      start();
      const snapshot = session.getSnapshot();
      if (!snapshot.ownerKey || !voiceInputBlocksSubmission(snapshot.state)) return;
      release();
      const ownerKey = snapshot.ownerKey;
      const unsubscribe = session.subscribe(() => {
        const current = session.getSnapshot();
        if (current.ownerKey !== ownerKey || !voiceInputBlocksSubmission(current.state)) release();
        else if (!current.focusedOwners.has(ownerKey)) {
          release();
          session.controller.cancel();
        }
      });
      owned = { surface, session, ownerKey, unsubscribe };
    },
    cancel(surface: string) {
      if (owned?.surface !== surface) return;
      const captured = owned;
      release();
      const current = captured.session.getSnapshot();
      if (current.ownerKey === captured.ownerKey && voiceInputBlocksSubmission(current.state))
        captured.session.controller.cancel();
    },
  };
}
export const controllerDictation = createControllerDictationOwnership();
