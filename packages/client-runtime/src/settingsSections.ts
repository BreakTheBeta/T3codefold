/**
 * The settings map shared by every client. Web, desktop and mobile render these sections with
 * the same ids, labels and order; a surface may hide individual rows it cannot support, but
 * never renames, reorders or regroups a section.
 */
export const SETTINGS_SECTIONS = [
  {
    id: "general",
    label: "General",
    summary: "New threads, follow-ups, notifications, keyboard, voice",
  },
  { id: "appearance", label: "Appearance", summary: "Theme, text, fonts, motion" },
  { id: "agents", label: "Agents", summary: "Providers, models, usage" },
  { id: "glados", label: "GLaDOS", summary: "Brief, autonomy, sources, peers" },
  { id: "threads", label: "Threads", summary: "Organization, auto-settle, archive" },
  { id: "git", label: "Git & worktrees", summary: "Pull, merge, writing style, cleanup" },
  { id: "tools", label: "Tools", summary: "Browser, devices, SnapShots, scheduled tasks" },
  {
    id: "connections",
    label: "Connections",
    summary: "This machine, environments, pairing, T3 Connect",
  },
  { id: "about", label: "About", summary: "Version, diagnostics, storage, licenses" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

export function settingsSectionLabel(id: SettingsSectionId): string {
  return SETTINGS_SECTIONS.find((section) => section.id === id)!.label;
}
