/** Fold distributions are GitHub release assets; the npm `t3` package is upstream. */
export const FOLD_REPOSITORY = "BreakTheBeta/T3codefold";
export const FOLD_RELEASES_URL = `https://github.com/${FOLD_REPOSITORY}/releases`;

export function foldServerPackageSpec(version: string): string {
  if (version === "latest" || version === "nightly") {
    return `${FOLD_RELEASES_URL}/download/fold-server-${version}/t3.tgz`;
  }
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
      version,
    )
  ) {
    throw new Error("A Fold server release requires an exact version, latest, or nightly.");
  }
  return `${FOLD_RELEASES_URL}/download/fold-server-v${encodeURIComponent(version)}/t3-${encodeURIComponent(version)}.tgz`;
}

export function foldServerCommand(version: string): string {
  return `npx --yes --prefer-online --package=${foldServerPackageSpec(version)} t3`;
}

/** Older update RPCs can install upstream npm packages; they require a manual Fold install. */
export function supportsFoldUpdates(capabilities: { readonly updateRepository?: string }): boolean {
  return capabilities.updateRepository === FOLD_REPOSITORY;
}

/** Migrate saved upstream defaults while retaining explicitly configured custom packages. */
export function normalizeFoldPackageSpec(spec?: string): string {
  const value = spec?.trim();
  if (!value || value === "t3") return foldServerPackageSpec("latest");
  const upstream = /^t3@([^\s;]+)$/.exec(value);
  return upstream ? foldServerPackageSpec(upstream[1]!) : value;
}

export function foldDesktopFeed(channel: "latest" | "nightly") {
  return {
    provider: "generic" as const,
    url: `${FOLD_RELEASES_URL}/download/fold-desktop-${channel}`,
    channel,
  };
}
