export function createControllerTargets() {
  const targets = new Map<
    string,
    {
      activate: () => void;
      dictate?: () => boolean | void;
      adjust?: (direction: -1 | 1) => void;
      reply?: boolean;
      scope: string;
    }
  >();
  const listeners = new Set<() => void>();
  const versions = new Map<string, number>();
  const changed = (scope: string) => {
    versions.set(scope, (versions.get(scope) ?? 0) + 1);
    listeners.forEach((listener) => listener());
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getScopeVersion(scope: string) {
      return versions.get(scope) ?? 0;
    },
    register(
      id: string,
      target: {
        activate: () => void;
        dictate?: () => boolean | void;
        adjust?: (direction: -1 | 1) => void;
        reply?: boolean;
      },
      scope = "",
      scopeBoundary = true,
    ) {
      const registered = { ...target, scope };
      targets.set(id, registered);
      if (scopeBoundary) changed(scope);
      return () => {
        if (targets.get(id) === registered) {
          targets.delete(id);
          if (scopeBoundary) changed(scope);
        }
      };
    },
    dispatch(id: string, action: "activate" | "dictate" | "decrement" | "increment", scope = "") {
      const focused = targets.get(id);
      const target =
        action === "dictate" && (id === "" || (focused?.scope === scope && !focused.dictate))
          ? [...targets.values()].find((candidate) => candidate.scope === scope && candidate.reply)
          : focused;
      if (!target || target.scope !== scope) return false;
      if (action === "activate") {
        target.activate();
        return true;
      }
      if (action === "decrement" || action === "increment") {
        if (!target.adjust) return false;
        target.adjust(action === "decrement" ? -1 : 1);
        return true;
      }
      return target.dictate !== undefined && target.dictate() !== false;
    },
  };
}
export const controllerTargets = createControllerTargets();
