import { SETTINGS_SECTIONS } from "@t3tools/client-runtime/settings-sections";
import { describe, expect, it } from "vite-plus/test";

import {
  describeSettingsScope,
  parseSettingsSectionId,
  resolveSettingsSectionRoute,
} from "./settingsSections.logic";

describe("resolveSettingsSectionRoute", () => {
  it("sends GLaDOS to its own screen and every other section to the shared route", () => {
    expect(resolveSettingsSectionRoute("glados")).toEqual({ screen: "SettingsGlados" });
    for (const section of SETTINGS_SECTIONS.filter((entry) => entry.id !== "glados")) {
      expect(resolveSettingsSectionRoute(section.id)).toEqual({
        screen: "SettingsSection",
        params: { section: section.id },
      });
    }
  });
});

describe("parseSettingsSectionId", () => {
  it("accepts shared ids and rejects stale deep links", () => {
    expect(parseSettingsSectionId("git")).toBe("git");
    expect(parseSettingsSectionId("source-control")).toBeNull();
    expect(parseSettingsSectionId(undefined)).toBeNull();
  });
});

describe("describeSettingsScope", () => {
  const base = { projectLabel: null } as const;

  it("names the only environment instead of saying all", () => {
    expect(
      describeSettingsScope({
        ...base,
        allSelected: true,
        availableLabels: ["studio-mac"],
        selectedLabels: ["studio-mac"],
      }),
    ).toBe("studio-mac");
  });

  it("summarizes multi-environment selections and appends the project", () => {
    expect(
      describeSettingsScope({
        ...base,
        allSelected: true,
        availableLabels: ["a", "b"],
        selectedLabels: ["a", "b"],
      }),
    ).toBe("All environments");
    expect(
      describeSettingsScope({
        allSelected: false,
        availableLabels: ["a", "b", "c"],
        selectedLabels: ["a", "c"],
        projectLabel: "t3code",
      }),
    ).toBe("2 environments · t3code");
  });

  it("says when nothing is connected", () => {
    expect(
      describeSettingsScope({
        ...base,
        allSelected: true,
        availableLabels: [],
        selectedLabels: [],
      }),
    ).toBe("No environments");
  });
});
