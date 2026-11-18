import type { MenuAction } from "@react-native-menu/menu";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  appBarMenuItemsFromActions,
  findAppBarMenuItem,
  menuActionsFromAppBarItems,
  isMenuActionEnabled,
  resolveMenuPath,
} from "./menuActionItems";

describe("appBarMenuItemsFromActions", () => {
  it("round-trips a filter menu through AppBar items back to menu actions", () => {
    const actions: MenuAction[] = [
      { id: "hidden", title: "Hidden action", attributes: { hidden: true } },
      {
        id: "labels",
        title: "Labels",
        subactions: [
          {
            id: "label:bug",
            title: "bug",
            image: "circle.fill",
            imageColor: "#d73a4a",
            state: "on",
          },
          { id: "label:docs", title: "docs", subtitle: "3 open", state: "off" },
        ],
      },
    ];
    const onSelect = vi.fn();

    const items = appBarMenuItemsFromActions(actions, onSelect);

    expect(menuActionsFromAppBarItems(items)).toEqual([
      {
        id: "labels",
        title: "Labels",
        image: undefined,
        subactions: [
          {
            id: "label:bug",
            title: "bug",
            subtitle: undefined,
            image: "circle.fill",
            imageColor: "#d73a4a",
            state: "on",
            attributes: undefined,
          },
          {
            id: "label:docs",
            title: "docs",
            subtitle: "3 open",
            image: undefined,
            imageColor: undefined,
            state: undefined,
            attributes: undefined,
          },
        ],
      },
    ]);
    expect(findAppBarMenuItem(items, "hidden")).toBeUndefined();
    findAppBarMenuItem(items, "label:docs")?.onPress();
    expect(onSelect).toHaveBeenCalledWith("label:docs");
    const disabledGroup = appBarMenuItemsFromActions(
      [
        {
          id: "disabled-group",
          title: "Unavailable",
          attributes: { disabled: true },
          subactions: [{ id: "child", title: "Child" }],
        },
      ],
      onSelect,
    );
    expect(findAppBarMenuItem(disabledGroup, "child")).toBeUndefined();
    expect(menuActionsFromAppBarItems(disabledGroup)[0]?.attributes?.disabled).toBe(true);

    expect(
      menuActionsFromAppBarItems([{ id: "devices", title: "Devices", inline: true, items: [] }]),
    ).toMatchObject([{ id: "devices", title: "Devices", displayInline: true }]);
  });
});

it("resolves an open submenu against replaced actions and retreats past unavailable owners", () => {
  const actions: MenuAction[] = [
    {
      id: "models",
      title: "Models",
      subactions: [{ id: "loading", title: "Loading", attributes: { disabled: true } }],
    },
  ];
  expect(resolveMenuPath(actions, ["models"]).actions.every(isMenuActionEnabled)).toBe(false);
  const replaced: MenuAction[] = [
    {
      id: "models",
      title: "Models",
      subactions: [{ id: "current", title: "Current", state: "on" }],
    },
  ];
  expect(resolveMenuPath(replaced, ["models"]).actions).toEqual(replaced[0]!.subactions);
  for (const attributes of [{ hidden: true }, { disabled: true }]) {
    expect(resolveMenuPath([{ ...replaced[0]!, attributes }], ["models"]).owners).toEqual([]);
  }
  expect(resolveMenuPath([], ["models"]).owners).toEqual([]);
  const nested: MenuAction[] = [{ id: "providers", title: "Providers", subactions: replaced }];
  expect(resolveMenuPath(nested, ["providers", "models"]).actions).toEqual(replaced[0]!.subactions);
  expect(resolveMenuPath(nested, ["providers", "removed"]).owners.map((owner) => owner.id)).toEqual(
    ["providers"],
  );
  const anonymous: MenuAction = { title: "Anonymous", subactions: [{ id: "done", title: "Done" }] };
  expect(
    resolveMenuPath(
      [{ id: "hidden", title: "Hidden", attributes: { hidden: true } }, anonymous],
      ["0:Anonymous"],
    ).owners,
  ).toEqual([anonymous]);
  expect(isMenuActionEnabled({ title: "No action" })).toBe(false);
  expect(isMenuActionEnabled({ title: "Empty id", id: "" })).toBe(true);
});
