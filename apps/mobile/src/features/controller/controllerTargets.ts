export function createControllerTargets() {
  const targets = new Map<string, { activate: () => void; dictate?: () => void; scope: string }>();
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
    register(id: string, target: { activate: () => void; dictate?: () => void }, scope = "") {
      const registered = { ...target, scope };
      targets.set(id, registered);
      changed(scope);
      return () => {
        if (targets.get(id) === registered) {
          targets.delete(id);
          changed(scope);
        }
      };
    },
    dispatch(id: string, action: "activate" | "dictate", scope = "") {
      const target = targets.get(id);
      if (!target || target.scope !== scope) return false;
      const handler = action === "activate" ? target.activate : target.dictate;
      handler?.();
      return handler !== undefined;
    },
  };
}
export const controllerTargets = createControllerTargets();
