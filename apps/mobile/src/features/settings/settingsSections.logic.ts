import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "@t3tools/client-runtime/settings-sections";

import type { AppSymbolName } from "../../components/AppSymbol";

/** Mobile icon per shared section. Labels, summaries and order come from SETTINGS_SECTIONS. */
export const SETTINGS_SECTION_ICONS = {
  general: "slider.horizontal.3",
  appearance: "paintbrush",
  agents: "brain",
  glados: "point.3.connected.trianglepath.dotted",
  threads: "text.bubble",
  git: "arrow.triangle.branch",
  tools: "hammer",
  connections: "link",
  about: "info.circle",
} as const satisfies Record<SettingsSectionId, AppSymbolName>;

/**
 * The settings-stack route that shows a section on compact layouts. GLaDOS owns a
 * dedicated screen; every other section renders through the shared section route.
 */
export function resolveSettingsSectionRoute(section: SettingsSectionId):
  | { readonly screen: "SettingsGlados" }
  | {
      readonly screen: "SettingsSection";
      readonly params: { readonly section: SettingsSectionId };
    } {
  return section === "glados"
    ? { screen: "SettingsGlados" }
    : { screen: "SettingsSection", params: { section } };
}

/** Narrows a deep-link param to a known section, or null for stale/unknown links. */
export function parseSettingsSectionId(value: unknown): SettingsSectionId | null {
  return SETTINGS_SECTIONS.find((section) => section.id === value)?.id ?? null;
}

/** The "Editing …" label for the settings environment/project filter. */
export function describeSettingsScope(input: {
  readonly allSelected: boolean;
  readonly availableLabels: readonly string[];
  readonly selectedLabels: readonly string[];
  readonly projectLabel: string | null;
}): string {
  const environments =
    input.availableLabels.length === 0
      ? "No environments"
      : input.allSelected && input.availableLabels.length > 1
        ? "All environments"
        : input.selectedLabels.length === 1
          ? input.selectedLabels[0]!
          : `${input.selectedLabels.length} environments`;
  return input.projectLabel === null ? environments : `${environments} · ${input.projectLabel}`;
}
