import { expect, it, vi } from "vite-plus/test";
import { createControllerTargets } from "./controllerTargets";
it("rejects resolved request generations and keeps dictation separate from activation", () => {
  const targets = createControllerTargets();
  const approve = vi.fn();
  const dictate = vi.fn();
  const dispose = targets.register("request-1", { activate: approve, dictate });
  expect(targets.dispatch("request-1", "dictate")).toBe(true);
  expect(approve).not.toHaveBeenCalled();
  expect(dictate).toHaveBeenCalledOnce();
  dispose();
  targets.register("request-2", { activate: approve });
  expect(targets.dispatch("request-1", "activate")).toBe(false);
  expect(approve).not.toHaveBeenCalled();
});

it("rejects an event queued by another route or modal scope", () => {
  const targets = createControllerTargets();
  const approve = vi.fn();
  targets.register("approval", { activate: approve }, "thread-a");
  expect(targets.dispatch("approval", "activate", "thread-b")).toBe(false);
  expect(targets.dispatch("approval", "activate", "question-modal")).toBe(false);
  expect(approve).not.toHaveBeenCalled();
  expect(targets.dispatch("approval", "activate", "thread-a")).toBe(true);
  expect(approve).toHaveBeenCalledOnce();
});

it("dictates into the current reply from a non-text action without crossing modal scopes", () => {
  const targets = createControllerTargets();
  const dictate = vi.fn();
  const activate = vi.fn();
  targets.register("reply", { activate, dictate, reply: true }, "thread-a");
  targets.register("tool", { activate }, "thread-a");
  expect(targets.dispatch("tool", "dictate", "thread-a")).toBe(true);
  expect(dictate).toHaveBeenCalledOnce();
  expect(targets.dispatch("", "dictate", "thread-a")).toBe(true);
  expect(dictate).toHaveBeenCalledTimes(2);
  expect(targets.dispatch("stale-field", "dictate", "thread-a")).toBe(false);
  expect(activate).not.toHaveBeenCalled();
  expect(targets.dispatch("", "dictate", "modal")).toBe(false);
  expect(dictate).toHaveBeenCalledTimes(2);
});

it("keeps held navigation armed when virtualized inline actions mount and unmount", () => {
  const targets = createControllerTargets();
  targets.register("reply", { activate: vi.fn(), reply: true }, "thread-a");
  const version = targets.getScopeVersion("thread-a");
  const activate = vi.fn();
  const remove = targets.register("fold", { activate }, "thread-a", false);
  expect(targets.getScopeVersion("thread-a")).toBe(version);
  expect(targets.dispatch("fold", "activate", "thread-a")).toBe(true);
  expect(activate).toHaveBeenCalledOnce();
  remove();
  expect(targets.getScopeVersion("thread-a")).toBe(version);
  expect(targets.dispatch("fold", "activate", "thread-a")).toBe(false);
});
