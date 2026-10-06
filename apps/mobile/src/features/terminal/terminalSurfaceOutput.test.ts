import {
  applyTerminalAttachStreamEvent,
  DEFAULT_MAX_TERMINAL_BUFFER_BYTES,
  nextTerminalAttachSeedState,
  terminalOutputText,
  type TerminalBufferState,
} from "@t3tools/client-runtime/state/terminal";
import { describe, expect, it } from "vite-plus/test";

import {
  nextTerminalSurfaceOutput,
  terminalSurfaceNeedsResend,
  type TerminalSurfaceOutput,
  type TerminalSurfaceOutputAck,
  type TerminalSurfaceStream,
} from "./terminalSurfaceOutput";

function snapshot(history: string): TerminalBufferState {
  return applyTerminalAttachStreamEvent(nextTerminalAttachSeedState(), {
    type: "snapshot",
    snapshot: {
      threadId: "thread-1",
      terminalId: "term-1",
      cwd: "/repo",
      worktreePath: null,
      status: "running",
      pid: 123,
      history,
      exitCode: null,
      exitSignal: null,
      label: "Terminal",
      updatedAt: "2026-10-06T00:00:00.000Z",
    },
  });
}

function append(state: TerminalBufferState, data: string): TerminalBufferState {
  return applyTerminalAttachStreamEvent(state, {
    type: "output",
    threadId: "thread-1",
    terminalId: "term-1",
    data,
  });
}

/** Mirrors the native views: what the terminal was fed, and how often it was reset. */
class FakeNativeSurface {
  fed = "";
  resets = 0;
  private resetId = 0;
  private end = 0;

  apply(write: TerminalSurfaceOutput): TerminalSurfaceOutputAck | null {
    if (write.resetId !== this.resetId) {
      if (write.start !== 0) return this.ack();
      this.fed = write.data;
      this.resets += 1;
      this.resetId = write.resetId;
      this.end = write.data.length;
      return this.ack();
    }
    if (write.start > this.end) return this.ack();
    const from = this.end - write.start;
    if (from >= write.data.length) return null;
    this.fed += write.data.slice(from);
    this.end = write.start + write.data.length;
    return this.ack();
  }

  recreate(): TerminalSurfaceOutputAck {
    this.fed = "";
    this.resetId = 0;
    this.end = 0;
    return this.ack();
  }

  private ack(): TerminalSurfaceOutputAck {
    return { resetId: this.resetId, end: this.end };
  }
}

/** Mirrors the React hook: one write per render, acknowledgements arrive later. */
class Feeder {
  stream: TerminalSurfaceStream | null = null;
  ack: TerminalSurfaceOutputAck | null = null;
  write: TerminalSurfaceOutput | null = null;

  render(state: TerminalBufferState, replayKey = "term:12"): TerminalSurfaceOutput {
    const next = nextTerminalSurfaceOutput({
      output: state.output,
      replayKey,
      stream: this.stream,
      ack: this.ack,
    });
    this.stream = next.stream;
    this.write = next.write;
    return next.write;
  }
}

describe("nextTerminalSurfaceOutput", () => {
  it("replays history once, then appends only new output", () => {
    const feeder = new Feeder();
    const native = new FakeNativeSurface();
    let state = snapshot("$ ls\r\n");

    feeder.ack = native.apply(feeder.render(state));
    state = append(state, "a.txt\r\n");
    const write = feeder.render(state);
    expect(write).toEqual({ resetId: 1, start: 6, data: "a.txt\r\n" });
    feeder.ack = native.apply(write);

    expect(native.fed).toBe("$ ls\r\na.txt\r\n");
    expect(native.resets).toBe(1);
  });

  it("keeps appending after the client buffer cap trims history", () => {
    const feeder = new Feeder();
    const native = new FakeNativeSurface();
    let state = snapshot("");
    feeder.ack = native.apply(feeder.render(state));

    const inputs: string[] = [];
    for (let index = 0; index < 96; index += 1) {
      const data = `${index}\r\n${"x".repeat(8190)}`;
      inputs.push(data);
      state = append(state, data);
      const ack = native.apply(feeder.render(state));
      if (ack !== null) feeder.ack = ack;
    }

    expect(state.output.retainedBytes).toBe(DEFAULT_MAX_TERMINAL_BUFFER_BYTES);
    expect(native.resets).toBe(1);
    expect(native.fed).toBe(inputs.join(""));
  });

  it("covers writes Fabric skipped by resending from the acknowledged offset", () => {
    const feeder = new Feeder();
    const native = new FakeNativeSurface();
    let state = snapshot("start ");
    feeder.ack = native.apply(feeder.render(state));

    state = append(state, "one ");
    feeder.render(state); // committed but never mounted
    state = append(state, "two ");
    const write = feeder.render(state);
    expect(write).toEqual({ resetId: 1, start: 6, data: "one two " });
    feeder.ack = native.apply(write);
    // Re-rendering with an unchanged write is a no-op for the view.
    expect(native.apply(write)).toBeNull();

    expect(native.fed).toBe("start one two ");
    expect(native.resets).toBe(1);
  });

  it("does not repeat output when acknowledgements lag behind writes", () => {
    const feeder = new Feeder();
    const native = new FakeNativeSurface();
    let state = snapshot("a");
    feeder.ack = native.apply(feeder.render(state));

    state = append(state, "b");
    native.apply(feeder.render(state)); // ack still in flight
    state = append(state, "c");
    feeder.ack = native.apply(feeder.render(state));

    expect(native.fed).toBe("abc");
    expect(native.resets).toBe(1);
  });

  it("replays the full buffer when the replay key changes", () => {
    const feeder = new Feeder();
    const native = new FakeNativeSurface();
    const state = snapshot("history");
    feeder.ack = native.apply(feeder.render(state, "term:12"));

    const write = feeder.render(state, "term:14");
    expect(write).toEqual({ resetId: 2, start: 0, data: "history" });
    feeder.ack = native.apply(write);
    expect(native.resets).toBe(2);
    expect(native.fed).toBe("history");
  });

  it("replays the retained buffer after the session is cleared", () => {
    const feeder = new Feeder();
    const native = new FakeNativeSurface();
    let state = snapshot("old output");
    feeder.ack = native.apply(feeder.render(state));

    state = applyTerminalAttachStreamEvent(state, {
      type: "cleared",
      threadId: "thread-1",
      terminalId: "term-1",
    });
    state = append(state, "$ ");
    feeder.ack = native.apply(feeder.render(state));

    expect(native.resets).toBe(2);
    expect(native.fed).toBe(terminalOutputText(state.output));
  });

  it("resends the whole stream after the view recreates its terminal", () => {
    const feeder = new Feeder();
    const native = new FakeNativeSurface();
    let state = snapshot("prompt ");
    feeder.ack = native.apply(feeder.render(state));
    state = append(state, "typed");
    feeder.ack = native.apply(feeder.render(state));

    const lost = native.recreate();
    expect(terminalSurfaceNeedsResend(feeder.write!, lost)).toBe(true);
    feeder.ack = lost;
    const write = feeder.render(state);
    expect(write).toEqual({ resetId: 1, start: 0, data: "prompt typed" });
    expect(terminalSurfaceNeedsResend(write, lost)).toBe(false);
    native.apply(write);

    expect(native.fed).toBe("prompt typed");
  });
});
