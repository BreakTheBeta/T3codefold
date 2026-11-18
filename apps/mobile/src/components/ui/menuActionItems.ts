import type { MenuAction } from "@react-native-menu/menu";
import type { AppBarMenuItem } from "./AppBar.types";

/** Adapts a `MenuAction` tree and its selection handler to `AppBar` menu items. */
export function appBarMenuItemsFromActions(
  actions: ReadonlyArray<MenuAction>,
  onSelect: (id: string) => void,
): AppBarMenuItem[] {
  return actions.flatMap((action, index): AppBarMenuItem[] => {
    if (action.attributes?.hidden) return [];
    const id = action.id ?? String(index);
    const disabled = action.attributes?.disabled;
    return action.subactions?.length
      ? [
          {
            id,
            title: action.title,
            icon: action.image,
            disabled,
            items: appBarMenuItemsFromActions(action.subactions, onSelect),
          },
        ]
      : [
          {
            id,
            title: action.title,
            subtitle: action.subtitle,
            icon: action.image,
            iconColor: action.imageColor,
            selected: action.state === "on",
            disabled,
            destructive: action.attributes?.destructive,
            onPress: () => {
              if (!disabled) onSelect(id);
            },
          },
        ];
  });
}

/** Adapts `AppBar` menu items to a `Menu`'s actions; `findAppBarMenuItem` resolves a selection. */
export function menuActionsFromAppBarItems(items: ReadonlyArray<AppBarMenuItem>): MenuAction[] {
  return items.flatMap((item): MenuAction[] =>
    "items" in item
      ? item.inline && !item.title
        ? menuActionsFromAppBarItems(item.items)
        : [
            {
              id: item.id,
              title: item.title ?? "",
              image: item.icon,
              displayInline: item.inline,
              attributes: item.disabled ? { disabled: true } : undefined,
              subactions: menuActionsFromAppBarItems(item.items),
            },
          ]
      : [
          {
            id: item.id,
            title: item.title,
            subtitle: item.subtitle,
            image: item.icon,
            imageColor: item.iconColor,
            state: item.selected ? "on" : undefined,
            attributes:
              item.disabled || item.destructive
                ? { disabled: item.disabled, destructive: item.destructive }
                : undefined,
          },
        ],
  );
}

export function findAppBarMenuItem(
  items: ReadonlyArray<AppBarMenuItem>,
  id: string,
): Extract<AppBarMenuItem, { readonly onPress: () => void }> | undefined {
  for (const item of items) {
    if ("items" in item) {
      if (item.disabled) continue;
      const action = findAppBarMenuItem(item.items, id);
      if (action) return action;
    } else if (item.id === id && !item.disabled) {
      return item;
    }
  }
  return undefined;
}

export function isMenuActionEnabled(action: MenuAction): boolean {
  return (
    !action.attributes?.hidden &&
    !action.attributes?.disabled &&
    (Boolean(action.subactions?.length) || action.id !== undefined)
  );
}

// Resolve owners from live actions so replacing a loading submenu cannot retain stale choices.
export function resolveMenuPath(actions: readonly MenuAction[], path: readonly string[]) {
  const owners: MenuAction[] = [];
  let choices = actions.filter((action) => !action.attributes?.hidden);
  for (const key of path) {
    const owner = choices.find((action, index) => menuActionKey(action, index) === key);
    if (!owner || !isMenuActionEnabled(owner) || !owner.subactions?.length) break;
    owners.push(owner);
    choices = owner.subactions.filter((action) => !action.attributes?.hidden);
  }
  return { owners, actions: choices };
}

export function menuActionKey(action: MenuAction, index: number): string {
  return action.id ?? `${index}:${action.title}`;
}
