import { expect, it, vi } from "vite-plus/test";
import {
  createControllerNavigation,
  type ControllerNativeEffect,
  type ControllerScene,
} from "./controllerNavigation";

const region = (
  id: string,
  kind: ControllerScene["regions"][number]["kind"],
  surfaceId = "chat",
) => ({ id, kind, surfaceId, viewportHeight: 600, canScrollUp: false, canScrollDown: false });
const target = (
  id: string,
  regionId: string,
  kind: ControllerScene["targets"][number]["kind"] = "action",
  registered = true,
) => ({ id, regionId, kind, registered, selected: false });
const conversation = (): ControllerScene => ({
  regions: [
    region("threads", "threads", ""),
    region("chat", "conversation"),
    region("reply", "composer"),
  ],
  targets: [
    target("thread", "threads", "thread"),
    target("fold", "chat"),
    target("field", "reply", "reply"),
    target("microphone", "reply", "action", false),
    target("send", "reply", "footer"),
  ],
  focusedTargetId: null,
  editorFocused: false,
});
function setup() {
  const navigation = createControllerNavigation();
  const effects: ControllerNativeEffect[] = [];
  let scene = conversation();
  const jobs: Promise<ControllerScene | null>[] = [];
  const invoke = vi.fn(() => true);
  const back = vi.fn();
  const command = vi.fn();
  const voice = vi.fn(() => false);
  const host = (id: string, parentId: string | null = null, modal = false) => ({
    id,
    parentId,
    modal,
    invoke,
    back,
    command,
    voice,
    failed: vi.fn(),
    native: (effect: ControllerNativeEffect) => {
      effects.push(effect);
      const job = Promise.resolve(scene);
      jobs.push(job);
      return job;
    },
  });
  const dispose = navigation.present(host("workspace"));
  const send = (action: string, id = "workspace", targetId = "") =>
    navigation.dispatch(id, { action, targetId, scene });
  return {
    navigation,
    effects,
    invoke,
    back,
    command,
    voice,
    host,
    dispose,
    send,
    setScene(value: ControllerScene) {
      scene = value;
    },
    settle: () => Promise.all(jobs),
  };
}

it("reaches the actual microphone in deterministic composer order and separates acquisition from activation", async () => {
  const f = setup();
  f.setScene({
    regions: [region("root", "content", "")],
    targets: [],
    focusedTargetId: null,
    editorFocused: false,
  });
  f.send("scene");
  f.setScene({
    ...conversation(),
    regions: [region("root", "content", ""), ...conversation().regions],
  });
  f.send("scene");
  f.send("enabled");
  expect(f.navigation.snapshot().position?.regionId).toBe("chat");
  f.send("right");
  expect(f.navigation.snapshot().position?.targetId).toBe("field");
  f.send("down");
  expect(f.navigation.snapshot().position?.targetId).toBe("microphone");
  f.send("left");
  expect(f.navigation.snapshot().position?.regionId).toBe("chat");
  f.send("right");
  f.send("down");
  expect(f.navigation.snapshot().position?.targetId).toBe("microphone");
  expect(f.invoke).not.toHaveBeenCalled();
  f.send("activate");
  expect(f.effects.at(-1)?.kind).toBe("activate");
  expect(f.effects.at(-1)?.targetId).toBe("microphone");
  f.send("down");
  f.send("activate");
  expect(f.invoke).toHaveBeenCalledWith("send", "activate");
  const compact = conversation();
  f.setScene({
    ...compact,
    regions: compact.regions.filter((region) => region.kind !== "threads"),
    targets: compact.targets.filter((target) => target.regionId !== "threads"),
  });
  f.send("conversation");
  f.send("left");
  expect(f.back).toHaveBeenCalledOnce();
  await f.settle();
});

it("owns nested modal input by declared ancestry even when child presentation precedes its parent", async () => {
  const f = setup();
  f.send("enabled");
  f.send("right");
  const child = f.navigation.present(f.host("child", "modal", true));
  const modal = f.navigation.present(f.host("modal", "workspace", true));
  expect(f.navigation.isActive("child")).toBe(true);
  f.send("next");
  expect(f.command).not.toHaveBeenCalled();
  f.setScene({
    regions: [region("dialog", "content", "")],
    targets: [target("cancel", "dialog"), target("confirm", "dialog")],
    focusedTargetId: null,
    editorFocused: false,
  });
  f.send("scene", "child");
  f.send("activate", "child");
  expect(f.invoke).not.toHaveBeenCalled();
  f.send("activate", "child");
  expect(f.invoke).toHaveBeenCalledWith("cancel", "activate");
  child();
  expect(f.navigation.isActive("modal")).toBe(true);
  modal();
  expect(f.navigation.snapshot().position?.targetId).toBe("field");
  await f.settle();
});

it("preserves selection through interruptions and repairs removed controls without activating their replacements", async () => {
  const f = setup();
  f.send("enabled");
  f.send("down");
  expect(f.navigation.snapshot().position?.targetId).toBe("fold");
  f.navigation.dispatch("workspace", {
    action: "activate",
    scopeId: "retired-route",
    targetId: "fold",
    scene: conversation(),
  });
  expect(f.invoke).not.toHaveBeenCalled();
  f.send("suspended");
  f.send("activate");
  expect(f.invoke).not.toHaveBeenCalled();
  const scene = conversation();
  f.setScene({ ...scene, focusedTargetId: "thread" });
  f.send("resumed");
  expect(f.effects.at(-1)?.targetId).toBe("fold");
  expect(f.invoke).not.toHaveBeenCalled();
  f.setScene({
    ...scene,
    targets: [
      target("replacement", "chat"),
      ...scene.targets.filter((entry) => entry.id !== "fold"),
    ],
  });
  f.send("scene");
  f.send("activate");
  expect(f.navigation.snapshot().position?.targetId).toBe("replacement");
  expect(f.invoke).not.toHaveBeenCalled();
  f.send("activate");
  expect(f.invoke).toHaveBeenCalledWith("replacement", "activate");
  await f.settle();
});

it("keeps control-list changes separate from scope changes and restores editing before screen Back", async () => {
  const f = setup();
  const initial = conversation();
  f.setScene({ ...initial, focusedTargetId: "field", editorFocused: true });
  f.send("enabled");
  await f.settle();
  expect(f.navigation.snapshot().position?.targetId).toBe("field");
  expect(f.navigation.snapshot().editing).toBe(true);
  f.send("chooser");
  expect(f.command).toHaveBeenLastCalledWith("controllerHelp");
  f.setScene({
    regions: [region("help", "content", "")],
    targets: [target("close", "help")],
    focusedTargetId: null,
    editorFocused: false,
  });
  const dismissHelp = f.navigation.present(f.host("help", "workspace", true));
  f.send("back", "help");
  expect(f.back).toHaveBeenCalledOnce();
  f.setScene({ ...initial, focusedTargetId: "field", editorFocused: true });
  dismissHelp();
  await f.settle();
  expect(f.navigation.snapshot().position?.targetId).toBe("field");
  expect(f.navigation.snapshot().editing).toBe(true);
  f.back.mockClear();
  f.setScene(initial);
  f.send("pageUp");
  expect(f.effects.at(-1)?.kind).toBe("scroll");
  expect(f.effects.at(-1)?.regionId).toBe("chat");
  expect(f.navigation.snapshot().position?.targetId).toBe("field");
  expect(f.navigation.snapshot().editing).toBe(true);
  f.send("suspended");
  f.send("resumed");
  expect(f.effects.at(-1)?.kind).toBe("edit");
  f.send("editorBlurred");
  expect(f.navigation.snapshot().editing).toBe(false);
  f.send("activate");
  f.send("back");
  expect(f.effects.at(-1)?.kind).toBe("blur");
  expect(f.back).not.toHaveBeenCalled();
  const scene = conversation();
  f.setScene({ ...scene, targets: [...scene.targets, target("new", "reply")] });
  f.send("scene");
  f.send("down");
  expect(f.navigation.snapshot().position?.targetId).toBe("microphone");
  f.send("back");
  expect(f.navigation.snapshot().position?.regionId).toBe("chat");
  await f.settle();
});

it("binds dictation to the selected surface and respects an explicit touch-selected editor", async () => {
  const f = setup();
  const scene = conversation();
  f.setScene({
    ...scene,
    regions: [
      ...scene.regions,
      region("side-chat", "conversation", "side"),
      region("side-reply", "composer", "side"),
    ],
    targets: [
      ...scene.targets,
      target("side-field", "side-reply", "reply"),
      target("side-tool", "side-chat"),
    ],
  });
  f.send("enabled");
  f.send("pointer", "workspace", "side-tool");
  f.send("dictate");
  expect(f.invoke).toHaveBeenLastCalledWith("side-field", "dictate");
  expect(f.invoke).not.toHaveBeenCalledWith("field", "dictate");
  f.voice.mockReturnValue(true);
  f.send("back");
  expect(f.back).not.toHaveBeenCalled();
  expect(f.voice).toHaveBeenLastCalledWith("cancel", "side");
  await f.settle();
});

it("waits for new visible actions after scrolling and reaches the reply only at a confirmed end", async () => {
  const f = setup();
  const scene = conversation();
  f.setScene({
    ...scene,
    regions: scene.regions.map((entry) =>
      entry.id === "chat" ? { ...entry, canScrollDown: true } : entry,
    ),
  });
  f.send("enabled");
  f.send("down");
  f.send("down");
  expect(f.effects.at(-1)?.kind).toBe("scroll");
  expect(f.navigation.snapshot().position?.regionId).toBe("chat");
  f.send("down");
  expect(f.effects.filter((entry) => entry.kind === "scroll")).toHaveLength(1);
  await f.settle();
  f.setScene({
    ...scene,
    targets: scene.targets.map((entry) =>
      entry.id === "fold" ? target("next-fold", "chat") : entry,
    ),
  });
  f.send("down");
  expect(f.navigation.snapshot().position?.targetId).toBe("next-fold");
  f.send("down");
  expect(f.navigation.snapshot().position?.targetId).toBe("field");
  await f.settle();
});

it("rejects a late scroll completion from an underlying scope", async () => {
  const f = setup();
  f.send("enabled");
  const updated = {
    ...conversation(),
    targets: [...conversation().targets, target("new-target", "chat")],
  };
  f.setScene(updated);
  f.send("scene");
  await f.settle();
  expect(f.navigation.snapshot().scene.targets.some((target) => target.id === "new-target")).toBe(
    true,
  );
  f.send("right");
  const dispose = f.navigation.present(f.host("modal", "workspace", true));
  f.setScene({
    regions: [region("modal-content", "content")],
    targets: [target("modal-action", "modal-content")],
    focusedTargetId: null,
    editorFocused: false,
  });
  f.send("scene", "modal");
  f.send("down", "modal");
  await f.settle();
  expect(f.navigation.snapshot().scopeId).toBe("modal");
  expect(f.navigation.snapshot().position?.targetId).toBe("modal-action");
  dispose();
  expect(f.navigation.snapshot().scopeId).toBe("workspace");
  expect(f.navigation.snapshot().position?.targetId).toBe("field");
  await f.settle();
});

it("crosses content panes directly while preserving modal controls and an editor focused before presentation", async () => {
  const f = setup();
  f.setScene({
    regions: [region("settings", "content", ""), region("page", "content", "")],
    targets: [
      target("category", "settings"),
      target("another-category", "settings"),
      target("setting", "page"),
    ],
    focusedTargetId: null,
    editorFocused: false,
  });
  f.send("enabled");
  f.send("down");
  f.send("right");
  expect(f.navigation.snapshot().position?.regionId).toBe("page");
  f.send("left");
  expect(f.navigation.snapshot().position?.regionId).toBe("settings");
  const close = f.navigation.present(f.host("prompt", "workspace", true));
  f.setScene({
    regions: [region("prompt", "content", "")],
    targets: [
      target("name", "prompt", "editor"),
      target("cancel", "prompt"),
      target("save", "prompt", "footer"),
    ],
    focusedTargetId: "name",
    editorFocused: true,
  });
  f.send("resumed", "prompt");
  await f.settle();
  expect(f.navigation.snapshot().editing).toBe(true);
  expect(f.navigation.snapshot().position?.targetId).toBe("name");
  f.send("back", "prompt");
  const promptScene = f.navigation.snapshot().scene;
  f.setScene({ ...promptScene, editorFocused: false, focusedTargetId: null });
  f.send("right", "prompt");
  expect(f.navigation.snapshot().position?.targetId).toBe("cancel");
  f.send("right", "prompt");
  expect(f.navigation.snapshot().position?.targetId).toBe("save");
  close();
});
