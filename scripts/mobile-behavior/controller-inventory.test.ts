import { expect, it } from "@effect/vitest";
import {
  controllerRoutes,
  controllerMenuSites,
  androidControllerSources,
} from "./controller-inventory.ts";

it("includes named routes across settings spreads and omits only development routes from production coverage", () => {
  const routes = controllerRoutes(
    `const settings = { 'Voice': createNativeStackScreen({screen: Voice}) }; const stack = { screens: { ...settings, ...(__DEV__ ? { Catalog: createNativeStackScreen({}) } : {}), Thread: createNativeStackScreen({linking: {path: 'threads/:id'}}) } };`,
  );
  expect(routes).toEqual([
    { name: "Voice", developmentOnly: false },
    { name: "Catalog", developmentOnly: true },
    { name: "Thread", developmentOnly: false },
  ]);
  expect(() => controllerRoutes("const empty = {};")).toThrow("coverage denominator");
  expect(() =>
    controllerRoutes("const routes = {[dynamic]: createNativeStackScreen({})};"),
  ).toThrow("Computed route key");
});

it("inventories real menu entry sites including aliases, nested routes and dynamic definitions without counting comments or strings", () => {
  const sites = controllerMenuSites(
    "feature.tsx",
    `
    import { Sheet as LocalSheet } from "./ui/Sheet";
    import * as Dialog from "./ui/Dialog";
    import { getDocumentAsync as chooseDocument } from "expo-document-picker";
    import { Alert } from "react-native";
    const text = "<Menu />"; // <LocalSheet />
    function Screen() {
      const actions = [{ id: "model", title: "Model", subactions: models }];
      Dialog.confirm("Discard", "Really?");
      Alert.alert("External alert");
      chooseDocument();
      return <LocalSheet title="Models"><Picker.Screen name="Reasoning" /></LocalSheet>;
    }
  `,
  );
  expect(sites.map((site) => [site.owner, site.kind, site.title])).toEqual([
    ["Screen", "submenu", "Model"],
    ["Screen", "dialog", "Discard"],
    ["Screen", "system", "External alert"],
    ["Screen", "system", null],
    ["Screen", "sheet", "Models"],
    ["Screen", "route", "Reasoning"],
  ]);
  expect(sites.every((site) => site.file === "feature.tsx" && site.line > 0)).toBe(true);
});

it("uses Android platform implementations and excludes tests and iOS code from menu discovery", () => {
  expect(
    androidControllerSources([
      "src/ui/Menu.tsx",
      "src/ui/Menu.android.tsx",
      "src/ui/Menu.ios.tsx",
      "src/Screen.tsx",
      "src/Screen.test.tsx",
      "src/logic.ts",
      "src/types.d.ts",
    ]),
  ).toEqual(["src/Screen.tsx", "src/logic.ts", "src/ui/Menu.android.tsx"]);
});
