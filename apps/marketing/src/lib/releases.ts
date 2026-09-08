const REPO = "BreakTheBeta/T3codefold";

export const RELEASES_URL = `https://github.com/${REPO}/releases`;
export const NIGHTLY_RELEASES_URL = `${RELEASES_URL}?q=nightly&expanded=true`;

const API_URL = `https://api.github.com/repos/${REPO}/releases`;

export type ReleaseChannel = "stable" | "nightly";

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface Release {
  tag_name: string;
  html_url: string;
  published_at: string;
  assets: ReleaseAsset[];
}

function cacheKey(channel: ReleaseChannel) {
  return `fold-desktop-${channel}-release`;
}

async function fetchDesktopRelease(channel: ReleaseChannel): Promise<Release> {
  const feed = channel === "stable" ? "latest" : "nightly";
  const response = await fetch(`${API_URL}/tags/fold-desktop-${feed}`);
  if (response.ok) return response.json();
  if (response.status !== 404) throw new Error(`Fold release lookup failed (${response.status})`);
  // Older Fold previews predate the dedicated desktop feeds. APK and server
  // releases cannot supply desktop installers, even when GitHub marks them latest.
  const fallback = await fetch(`${API_URL}?per_page=100`);
  if (!fallback.ok) throw new Error(`Fold release lookup failed (${fallback.status})`);
  const list: Release[] = await fallback.json();
  const release = Array.isArray(list)
    ? list.find(
        (item) =>
          item.tag_name.startsWith("fold-preview-v") &&
          item.tag_name.includes("-nightly.") === (channel === "nightly") &&
          item.assets.some((asset) => /\.(exe|dmg|AppImage)$/.test(asset.name)),
      )
    : undefined;
  if (!release) throw new Error(`No Fold desktop ${channel} release is available`);
  return release;
}

export async function fetchLatestRelease(channel: ReleaseChannel = "stable"): Promise<Release> {
  const key = cacheKey(channel);
  const cached = sessionStorage.getItem(key);
  if (cached) return JSON.parse(cached);

  const data = await fetchDesktopRelease(channel);

  if (data?.assets) {
    sessionStorage.setItem(key, JSON.stringify(data));
  }

  return data;
}
