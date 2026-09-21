const FENCE_PATTERN = /^\s{0,3}(`{3,}|~{3,})/u;
const IMG_TAG_PATTERN = /<img\b[^>]*>/giu;

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "iu").exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

/**
 * GitHub writes a screenshot dropped into a description or comment as an `<img>` tag, which the
 * phone's markdown renderers skip. Rewriting each tag as a markdown image lets it render (and open
 * full screen) like any other. Fenced code is left alone so a snippet showing a tag stays a snippet.
 */
export function markdownImagesFromHtml(markdown: string): string {
  if (!/<img\b/iu.test(markdown)) return markdown;
  let openFence: string | null = null;
  return markdown
    .split("\n")
    .map((line) => {
      const fence = FENCE_PATTERN.exec(line)?.[1];
      if (fence !== undefined) {
        if (openFence === null) openFence = fence[0]!;
        else if (fence[0] === openFence) openFence = null;
        return line;
      }
      if (openFence !== null) return line;
      return line.replace(IMG_TAG_PATTERN, (tag) => {
        const src = attribute(tag, "src");
        if (!src) return tag;
        const alt = (attribute(tag, "alt") ?? "").replace(/[[\]]/gu, "");
        // Encoded rather than wrapped in <>, which not every markdown parser here accepts.
        const url = src.replace(/ /gu, "%20").replace(/\(/gu, "%28").replace(/\)/gu, "%29");
        return `![${alt}](${url})`;
      });
    })
    .join("\n");
}

/** `//host/path` is how some bodies write a same-scheme URL; a phone has no page scheme to borrow. */
export function resolveMarkdownImageUrl(href: string): string | null {
  const url = href.startsWith("//") ? `https:${href}` : href;
  return /^https?:\/\//iu.test(url) ? url : null;
}
