import { RegistryContext } from "@effect/atom-react";
import {
  BearerConnectionProfile,
  BearerConnectionTarget,
  type ConnectionCatalogEntry,
  type ConnectionRoute,
} from "@t3tools/client-runtime/connection";
import { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AtomRegistry } from "effect/reactivity";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

type PanEvent = { readonly translationY: number };
type Pan = {
  start?: () => void;
  move?: (event: PanEvent) => void;
  end?: (event: PanEvent, success: boolean) => void;
};
const native = vi.hoisted(() => ({
  size: { width: 800, height: 600 },
  gestures: new WeakMap<Element, Pan>(),
  reorder: vi.fn(async (_input: { routeIds: ReadonlyArray<string> }) => ({ _tag: "Success" })),
}));

const atoms = await vi.hoisted(async () => {
  const { Atom } = await import("effect/reactivity");
  return { catalog: Atom.make({ entries: new Map<EnvironmentId, ConnectionCatalogEntry>() }) };
});
vi.mock("../../connection/catalog", () => ({
  environmentCatalog: {
    catalogValueAtom: atoms.catalog,
    reorderRoutes: "reorder",
    removeRoute: "remove",
  },
}));
vi.mock("../../state/session", async () => {
  const { Atom, AsyncResult } = await import("effect/reactivity");
  const Option = await import("effect/Option");
  const prepared = Atom.make(Option.none());
  const session = Atom.make(AsyncResult.success(null));
  return {
    environmentSession: {
      preparedConnectionValueAtom: () => prepared,
      sessionStateAtom: () => session,
    },
  };
});
vi.mock("../../state/presentation", async () => {
  const { Atom } = await import("effect/reactivity");
  const presentation = Atom.make(null);
  return { environmentPresentations: { presentationAtom: () => presentation } };
});
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => native.reorder }));
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  useWindowDimensions: () => native.size,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Pressable: ({ children, onPress }: { children?: ReactNode; onPress: () => void }) => (
    <button onClick={onPress}>{children}</button>
  ),
}));
vi.mock("react-native-reanimated", async () => {
  const { useState, useLayoutEffect } = await import("react");
  return {
    default: {
      View: (props: {
        children?: ReactNode;
        style: { zIndex: number; transform: Array<{ translateY: number }> };
        onLayout: (event: { nativeEvent: { layout: { height: number } } }) => void;
      }) => {
        useLayoutEffect(() => {
          props.onLayout({ nativeEvent: { layout: { height: 48 } } });
        }, [props.onLayout]);
        return (
          <div
            data-route-row
            data-lifted={props.style.zIndex === 1}
            data-offset={props.style.transform[0]?.translateY}
          >
            {props.children}
          </div>
        );
      },
    },
    ReduceMotion: { System: "system" },
    useAnimatedStyle: (read: () => unknown) => read(),
    useSharedValue: (value: number) => useState(() => ({ value }))[0],
    withTiming: (value: number) => value,
    runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
  };
});
vi.mock("react-native-gesture-handler", () => ({
  GestureDetector: ({ children, gesture }: { children?: ReactNode; gesture: Pan }) => (
    <div
      data-gesture
      ref={(element) => {
        if (element) native.gestures.set(element, gesture);
      }}
    >
      {children}
    </div>
  ),
  Gesture: {
    Pan: () => {
      const pan = {
        enabled: () => pan,
        minDistance: () => pan,
        shouldCancelWhenOutside: () => pan,
        onStart: (callback: Pan["start"]) => ((pan.start = callback), pan),
        onUpdate: (callback: Pan["move"]) => ((pan.move = callback), pan),
        onFinalize: (callback: Pan["end"]) => ((pan.end = callback), pan),
        start: undefined as Pan["start"],
        move: undefined as Pan["move"],
        end: undefined as Pan["end"],
      };
      return pan;
    },
  },
}));
vi.mock("../controller/ControllerPressable", () => ({
  ControllerPressable: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../components/ui/Button", () => ({
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button onClick={onPress}>{label}</button>
  ),
}));
vi.mock("../../components/ui/Dialog", () => ({ alert: vi.fn() }));
vi.mock("../../components/ui/AppText", () => ({
  AppText: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../../components/ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../../components/StatusPill", () => ({ StatusPill: () => null }));
vi.mock("../connection/connectionTone", () => ({ connectionTone: () => ({}) }));
vi.mock("../../components/ui/ListActionRow", () => ({ ListActionRow: () => null }));
vi.mock("./components/SettingsSection", () => ({
  SettingsSection: ({ children, trailing }: { children?: ReactNode; trailing?: ReactNode }) => (
    <section>
      {trailing}
      {children}
    </section>
  ),
}));

import { EnvironmentRoutesSection } from "./EnvironmentRoutesSection";

const environmentId = EnvironmentId.make("desk");
function route(id: string): ConnectionRoute {
  return {
    target: new BearerConnectionTarget({ environmentId, connectionId: id, label: "Desk" }),
    profile: Option.some(
      new BearerConnectionProfile({
        environmentId,
        connectionId: id,
        label: "Desk",
        httpBaseUrl: `https://${id}.example.com/`,
        wsBaseUrl: `wss://${id}.example.com/`,
      }),
    ),
  };
}

function setup() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  native.size = { width: 800, height: 600 };
  native.gestures = new WeakMap();
  native.reorder.mockClear();
  const registry = AtomRegistry.make();
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = () =>
    act(() =>
      root.render(
        <RegistryContext.Provider value={registry}>
          <EnvironmentRoutesSection environmentId={environmentId} connected onAddRoute={() => {}} />
        </RegistryContext.Provider>,
      ),
    );
  const save = (ids: ReadonlyArray<string>) => {
    const [first, ...alternateRoutes] = ids.map(route);
    if (!first) throw new Error("A route is required");
    act(() =>
      registry.set(atoms.catalog, {
        entries: new Map([[environmentId, { ...first, alternateRoutes, enabled: true }]]),
      }),
    );
  };
  const rows = () => [...container.querySelectorAll("[data-route-row]")];
  const toggleEdit = () => act(() => container.querySelector("button")!.click());
  save(["a", "b", "c"]);
  render();
  toggleEdit();
  return {
    container,
    rows,
    save,
    toggleEdit,
    resize: (size: typeof native.size) => {
      native.size = size;
      render();
    },
    pan: () => native.gestures.get(container.querySelector("[data-gesture]")!)!,
    order: () => rows().map((row) => row.textContent?.match(/[abc]\.example\.com/)?.[0]),
    [Symbol.dispose]() {
      act(() => root.unmount());
      registry.dispose();
    },
  };
}

it.each([true, false])("touch reorder commits only a successful drop (%s)", async (success) => {
  using screen = setup();
  const pan = screen.pan();
  act(() => pan.start?.());
  act(() => pan.move?.({ translationY: 52 }));
  expect(screen.rows()[0]?.getAttribute("data-lifted")).toBe("true");
  expect(screen.rows()[1]?.getAttribute("data-offset")).toBe("-48");
  await act(async () => pan.end?.({ translationY: 52 }, success));
  expect(screen.order()).toEqual(
    success
      ? ["b.example.com", "a.example.com", "c.example.com"]
      : ["a.example.com", "b.example.com", "c.example.com"],
  );
  expect(native.reorder.mock.calls.map(([input]) => input.routeIds)).toEqual(
    success ? [["b", "a", "c"]] : [],
  );
  expect(screen.container.querySelector('[data-lifted="true"]')).toBeNull();
});

it.each(["width", "height", "order", "edit"])(
  "cancels an active touch drag on %s change and rejects its late native drop",
  async (change) => {
    using screen = setup();
    const pan = screen.pan();
    act(() => pan.start?.());
    act(() => pan.move?.({ translationY: 52 }));
    expect(screen.container.querySelector('[data-lifted="true"]')).not.toBeNull();
    if (change === "width") screen.resize({ width: 1000, height: 600 });
    if (change === "height") screen.resize({ width: 800, height: 400 });
    if (change === "order") screen.save(["c", "a", "b"]);
    if (change === "edit") screen.toggleEdit();
    expect(screen.container.querySelector('[data-lifted="true"]')).toBeNull();
    expect(screen.rows().map((row) => row.getAttribute("data-offset"))).toEqual(["0", "0", "0"]);
    const cancelledOrder = screen.order();
    act(() => pan.move?.({ translationY: 100 }));
    await act(async () => pan.end?.({ translationY: 100 }, true));
    expect(screen.order()).toEqual(cancelledOrder);
    expect(screen.container.querySelector('[data-lifted="true"]')).toBeNull();
    expect(native.reorder).not.toHaveBeenCalled();

    if (change === "width" || change === "height") screen.resize({ width: 800, height: 600 });
    if (change === "order") screen.save(["a", "b", "c"]);
    if (change === "edit") screen.toggleEdit();
    await act(async () => pan.end?.({ translationY: 100 }, true));
    expect(native.reorder).not.toHaveBeenCalled();
    const freshPan = screen.pan();
    act(() => freshPan.start?.());
    act(() => freshPan.move?.({ translationY: 52 }));
    await act(async () => freshPan.end?.({ translationY: 52 }, true));
    expect(screen.order()).toEqual(["b.example.com", "a.example.com", "c.example.com"]);
    expect(native.reorder.mock.calls.map(([input]) => input.routeIds)).toEqual([["b", "a", "c"]]);
  },
);
