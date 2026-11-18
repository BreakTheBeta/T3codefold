import type { MenuAction } from "@react-native-menu/menu";

export function browserTabMenuActions(
  actions: readonly MenuAction[],
  permissions: { readonly adjust: boolean; readonly resize: boolean; readonly close: boolean },
): MenuAction[] {
  return actions.map((action) => {
    const allowed =
      action.id === "paste"
        ? true
        : action.id === "close"
          ? permissions.close
          : action.id === "viewport" || action.id?.startsWith("viewport:")
            ? permissions.resize
            : permissions.adjust;
    return {
      ...action,
      attributes: { ...action.attributes, disabled: action.attributes?.disabled || !allowed },
      ...(action.subactions
        ? { subactions: browserTabMenuActions(action.subactions, permissions) }
        : {}),
    };
  });
}
