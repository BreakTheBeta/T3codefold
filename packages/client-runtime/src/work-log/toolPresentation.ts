import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import type {
  ToolActivityIcon,
  ToolActivityNativeAppReference,
  ToolActivitySource,
  ToolActivitySurface,
} from "@t3tools/contracts";

export interface ExtractedToolActivityPresentation {
  readonly toolSurface?: ToolActivitySurface;
  readonly toolIcon?: ToolActivityIcon;
  readonly toolSource?: ToolActivitySource;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function trimmedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : undefined;
}

function imageUrl(value: unknown): string | undefined {
  const raw = trimmedString(value, 4096);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "data:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function pageUrl(value: unknown): string | undefined {
  const raw = trimmedString(value, 4096);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function nativeAppReference(value: unknown): ToolActivityNativeAppReference | undefined {
  const app = asRecord(value);
  const appId = trimmedString(app?.appId, 512);
  if (app?._tag === "app-id" && appId && /^[A-Za-z0-9._-]+$/u.test(appId)) {
    return { _tag: "app-id", appId };
  }
  const displayName = trimmedString(app?.displayName, 160);
  if (app?._tag === "display-name" && displayName) {
    return { _tag: "display-name", displayName };
  }
  return undefined;
}

function activityIcon(value: unknown): ToolActivityIcon | undefined {
  const icon = asRecord(value);
  if (icon?._tag === "website") {
    const resolvedPageUrl = pageUrl(icon.pageUrl);
    const faviconUrl = imageUrl(icon.faviconUrl);
    const faviconUrlDark = imageUrl(icon.faviconUrlDark);
    if (resolvedPageUrl) {
      return {
        _tag: "website",
        pageUrl: resolvedPageUrl,
        ...(faviconUrl ? { faviconUrl } : {}),
        ...(faviconUrlDark ? { faviconUrlDark } : {}),
      };
    }
  }
  if (icon?._tag === "native-app") {
    const app = nativeAppReference(icon.app);
    if (app) return { _tag: "native-app", app };
  }
  if (icon?._tag === "themed-logo") {
    const logoUrl = imageUrl(icon.logoUrl);
    const logoUrlDark = imageUrl(icon.logoUrlDark);
    if (logoUrl) {
      return {
        _tag: "themed-logo",
        logoUrl,
        ...(logoUrlDark ? { logoUrlDark } : {}),
      };
    }
  }
  return undefined;
}

function activitySource(value: unknown): ToolActivitySource | undefined {
  const source = asRecord(value);
  const key = trimmedString(source?.key, 512);
  const name = trimmedString(source?.name, 160);
  const kind = source?.kind;
  if (!key || !name || (kind !== "browser" && kind !== "computer" && kind !== "integration")) {
    return undefined;
  }
  const icon = activityIcon(source?.icon);
  return { key, name, kind, ...(icon ? { icon } : {}) };
}

const decodePreviewResult = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown));

/** V2 retains dynamic-tool output; recover the preview page without legacy activity projection. */
function previewToolIcon(
  payload: Record<string, unknown> | undefined,
): ToolActivityIcon | undefined {
  const name = payload?.toolName;
  if (typeof name !== "string" || !/^(?:mcp__)?(?:t3-code|t3_code|t3code)_{1,2}preview_/.test(name))
    return undefined;
  if (
    payload?.status === "failed" ||
    payload?.status === "declined" ||
    payload?.status === "cancelled"
  )
    return undefined;
  let output: unknown = payload?.output;
  for (let depth = 0; depth < 4; depth++) {
    if (typeof output === "string") {
      if (output.length > 2 * 1024 * 1024) return undefined;
      const decoded = decodePreviewResult(output);
      if (Option.isNone(decoded)) return undefined;
      output = decoded.value;
    }
    const result = asRecord(output);
    if (!result || result.isError === true || result.is_error === true) return undefined;
    const pageUrl = trimmedString(
      asRecord(result.toolIcon)?.pageUrl ??
        (/preview_(?:open|navigate|status|snapshot)$/.test(name) ? result.url : undefined),
      4096,
    );
    if (pageUrl) return activityIcon({ _tag: "website", pageUrl });
    const content = Array.isArray(result.content) ? result.content : [];
    output =
      result.structuredContent ??
      content.map(asRecord).find((block) => block?.type === "text")?.text;
  }
  return undefined;
}

export function extractToolActivityPresentation(
  payloadValue: unknown,
): ExtractedToolActivityPresentation {
  const payload = asRecord(payloadValue);
  const toolSurface =
    payload?.toolSurface === "browser" || payload?.toolSurface === "computer"
      ? payload.toolSurface
      : undefined;
  const toolIcon = activityIcon(payload?.toolIcon) ?? previewToolIcon(payload);
  const toolSource = activitySource(payload?.toolSource);
  return {
    ...(toolSurface ? { toolSurface } : {}),
    ...(toolIcon ? { toolIcon } : {}),
    ...(toolSource ? { toolSource } : {}),
  };
}
