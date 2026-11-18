import { expect, it } from "vite-plus/test";
import { browserTabMenuActions } from "./browserTabMenuActions";

it("keeps each browser submenu within the destination's permissions", () => {
  const actions = [
    { id: "paste", title: "Paste" },
    { id: "hard-reload", title: "Hard reload" },
    {
      id: "appearance",
      title: "Appearance",
      subactions: [{ id: "appearance:dark", title: "Dark", state: "on" as const }],
    },
    { id: "viewport", title: "Viewport", subactions: [{ id: "viewport:fill", title: "Fit" }] },
    { id: "close", title: "Close", attributes: { destructive: true } },
  ];
  const result = browserTabMenuActions(actions, { adjust: false, resize: true, close: false });
  expect(result.map((action) => !!action.attributes?.disabled)).toEqual([
    false,
    true,
    true,
    false,
    true,
  ]);
  expect(result[2]?.subactions?.[0]).toMatchObject({ state: "on", attributes: { disabled: true } });
  expect(result[4]?.attributes?.destructive).toBe(true);
  expect(actions[2]?.subactions?.[0]).not.toHaveProperty("attributes");
  const inverse = browserTabMenuActions(actions, { adjust: true, resize: false, close: true });
  expect(inverse.map((action) => !!action.attributes?.disabled)).toEqual([
    false,
    false,
    false,
    true,
    false,
  ]);
  expect(inverse[3]?.subactions?.[0]?.attributes?.disabled).toBe(true);
});
