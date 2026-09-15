export function resolveAgentAwarenessPlatformPresentation(platform: string): {
  readonly supported: boolean;
  readonly subtitle: string | undefined;
} {
  if (platform === "ios") return { supported: true, subtitle: undefined };
  if (platform === "android") {
    return { supported: true, subtitle: "While connected in the background" };
  }
  return { supported: false, subtitle: "Not supported" };
}
