import { describe, expect, it } from "vite-plus/test";

import { getTerminalBufferReplayKey } from "./terminalBufferReplay";

describe("terminalBufferReplay", () => {
  it("keys replays by terminal identity and font metrics", () => {
    expect(
      getTerminalBufferReplayKey({
        terminalKey: "env-1:thread-1:default",
        fontSize: 10,
      }),
    ).toBe("env-1:thread-1:default:10");
  });
});
