import { describe, expect, it } from "vite-plus/test";
import {
  buildVimHintLabels,
  nextDirectionalVimRegion,
  nextVimListIndex,
  type VimFocusRect,
} from "./TimelineVimMode";
import { createVimScrollController } from "./vimScroll";

describe("Vim smooth scrolling", () => {
  it("ignores repeat events instead of building a destination backlog", () => {
    const frames = testFrames();
    const scroller = createVimScrollController({
      scheduler: frames.scheduler,
      prefersReducedMotion: () => false,
    });
    const surface = testScrollSurface();

    scroller.press(surface, 64, { code: "KeyJ", continuous: true, repeat: false });
    frames.step(16);
    frames.step(16);
    scroller.press(surface, 64, { code: "KeyJ", continuous: true, repeat: true });
    scroller.release("KeyJ");
    frames.flush();

    expect(surface.scrollTop).toBe(64);
  });

  it("stops on release without a catch-up boost after continuous scrolling", () => {
    const frames = testFrames();
    const scroller = createVimScrollController({
      scheduler: frames.scheduler,
      prefersReducedMotion: () => false,
    });
    const surface = testScrollSurface();

    scroller.press(surface, 64, { code: "KeyJ", continuous: true, repeat: false });
    for (let index = 0; index < 14; index += 1) frames.step(16);
    const releasedAt = surface.scrollTop;
    expect(releasedAt).toBeGreaterThan(64);

    scroller.release("KeyJ");
    frames.flush();
    expect(surface.scrollTop).toBe(releasedAt);
  });

  it("completes one bounded motion for a quick tap", () => {
    const frames = testFrames();
    const scroller = createVimScrollController({
      scheduler: frames.scheduler,
      prefersReducedMotion: () => false,
    });
    const surface = testScrollSurface(480);

    scroller.press(surface, -64, { code: "KeyK", continuous: true, repeat: false });
    scroller.release("KeyK");
    frames.flush();

    expect(surface.scrollTop).toBe(416);
  });
});

function testScrollSurface(scrollTop = 0) {
  return { clientHeight: 500, scrollHeight: 2_000, scrollTop };
}

function testFrames() {
  let id = 0;
  let now = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const scheduler = {
    request(callback: FrameRequestCallback) {
      callbacks.set(++id, callback);
      return id;
    },
    cancel(frameId: number) {
      callbacks.delete(frameId);
    },
  };
  const step = (elapsed: number) => {
    now += elapsed;
    const queued = [...callbacks.values()];
    callbacks.clear();
    for (const callback of queued) callback(now);
  };
  const flush = () => {
    for (let count = 0; callbacks.size > 0 && count < 100; count += 1) step(16);
    if (callbacks.size > 0) throw new Error("Vim scroll animation did not settle");
  };
  return { flush, scheduler, step };
}

describe("Vim hint labels", () => {
  it("uses one key for small target sets", () => {
    expect(buildVimHintLabels(4)).toEqual(["a", "s", "d", "f"]);
  });

  it("uses fixed-width prefixes when the page has many targets", () => {
    const labels = buildVimHintLabels(40);
    expect(labels).toHaveLength(40);
    expect(labels[0]).toBe("aa");
    expect(labels[25]).toBe("am");
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("expands labels when more than two-key combinations are needed", () => {
    const labels = buildVimHintLabels(700);
    expect(labels).toHaveLength(700);
    expect(labels[0]).toBe("aaa");
    expect(labels.at(-1)).toHaveLength(3);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("Vim list navigation", () => {
  it("enters from either edge, applies counts, and stops at list boundaries", () => {
    expect(nextVimListIndex(5, -1, 1, 1)).toBe(0);
    expect(nextVimListIndex(5, -1, -1, 1)).toBe(4);
    expect(nextVimListIndex(5, 1, 1, 2)).toBe(3);
    expect(nextVimListIndex(5, 1, -1, 20)).toBe(0);
    expect(nextVimListIndex(0, -1, 1, 1)).toBe(-1);
  });
});

describe("Vim directional focus", () => {
  const sidebar = { id: "sidebar" as const, rect: rect(0, 0, 240, 800) };
  const conversation = { id: "conversation" as const, rect: rect(240, 0, 760, 620) };
  const composer = { id: "composer" as const, rect: rect(280, 640, 700, 140) };
  const regions = [sidebar, conversation, composer];

  it("moves between the conversation and composer by their relative position", () => {
    expect(nextDirectionalVimRegion(regions, "conversation", "j")).toBe("composer");
    expect(nextDirectionalVimRegion(regions, "composer", "k")).toBe("conversation");
    expect(nextDirectionalVimRegion(regions, "conversation", "k")).toBeNull();
  });

  it("moves left and right only to regions on the same visual row", () => {
    expect(nextDirectionalVimRegion(regions, "conversation", "h")).toBe("sidebar");
    expect(nextDirectionalVimRegion(regions, "sidebar", "l", rect(20, 120, 180, 32))).toBe(
      "conversation",
    );
    expect(nextDirectionalVimRegion(regions, "sidebar", "j", rect(20, 120, 180, 32))).toBeNull();
  });

  it("uses the focused sidebar row to choose the region directly beside it", () => {
    expect(nextDirectionalVimRegion(regions, "sidebar", "l", rect(20, 700, 180, 32))).toBe(
      "composer",
    );
  });
});

function rect(left: number, top: number, width: number, height: number): VimFocusRect {
  return { left, right: left + width, top, bottom: top + height };
}
