import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_RESOLVED_KEYBINDINGS,
  keybindingsForVoiceClient,
  withDefaultVoiceKeybindings,
} from "./keybindings.ts";

describe("voice keybinding compatibility", () => {
  it("omits new voice command literals for clients that have not opted in", () => {
    const old = keybindingsForVoiceClient(DEFAULT_RESOLVED_KEYBINDINGS, false);
    expect(old.some((binding) => binding.command.startsWith("voice."))).toBe(false);
    expect(old).toEqual(
      DEFAULT_RESOLVED_KEYBINDINGS.filter((binding) => !binding.command.startsWith("voice.")),
    );
    expect(keybindingsForVoiceClient(DEFAULT_RESOLVED_KEYBINDINGS, true)).toEqual(
      DEFAULT_RESOLVED_KEYBINDINGS,
    );
  });
  it("adds local voice defaults for older hosts while preserving host shortcut precedence", () => {
    const old = keybindingsForVoiceClient(DEFAULT_RESOLVED_KEYBINDINGS, false);
    const updated = withDefaultVoiceKeybindings(old);
    expect(updated.filter((binding) => binding.command.startsWith("voice."))).toHaveLength(3);
    expect(updated.slice(-old.length)).toEqual(old);
    expect(withDefaultVoiceKeybindings(DEFAULT_RESOLVED_KEYBINDINGS)).toEqual(
      DEFAULT_RESOLVED_KEYBINDINGS,
    );
  });
});
