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
