import { controllerTargets } from "./controllerTargets";
import { createContext, useSyncExternalStore } from "react";
export const ControllerScope = createContext("");

export function useControllerNativeScope(scope: string) {
  const version = useSyncExternalStore(
    controllerTargets.subscribe,
    () => controllerTargets.getScopeVersion(scope),
    () => 0,
  );
  return `${scope}:${version}`;
}
