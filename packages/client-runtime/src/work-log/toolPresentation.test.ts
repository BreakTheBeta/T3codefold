import { describe, expect, it } from "@effect/vitest";

import { extractToolActivityPresentation } from "./toolPresentation.ts";

describe("extractToolActivityPresentation", () => {
  it("reads provider-neutral presentation fields", () => {
    expect(
      extractToolActivityPresentation({
        toolSurface: "browser",
        toolIcon: {
          _tag: "website",
          pageUrl: "https://example.com/docs",
          faviconUrl: "https://example.com/favicon.png",
          faviconUrlDark: "https://example.com/favicon-dark.png",
        },
        toolSource: {
          key: "integration:example",
          name: "Example",
          kind: "integration",
          icon: {
            _tag: "themed-logo",
            logoUrl: "https://example.com/logo-light.png",
            logoUrlDark: "https://example.com/logo-dark.png",
          },
        },
      }),
    ).toEqual({
      toolSurface: "browser",
      toolIcon: {
        _tag: "website",
        pageUrl: "https://example.com/docs",
        faviconUrl: "https://example.com/favicon.png",
        faviconUrlDark: "https://example.com/favicon-dark.png",
      },
      toolSource: {
        key: "integration:example",
        name: "Example",
        kind: "integration",
        icon: {
          _tag: "themed-logo",
          logoUrl: "https://example.com/logo-light.png",
          logoUrlDark: "https://example.com/logo-dark.png",
        },
      },
    });
  });

  it("reads provider-neutral native app icons", () => {
    expect(
      extractToolActivityPresentation({
        toolSurface: "computer",
        toolIcon: {
          _tag: "native-app",
          app: { _tag: "app-id", appId: "com.example.Editor" },
        },
        toolSource: {
          key: "native-app:com.example.editor",
          name: "Editor",
          kind: "computer",
        },
      }),
    ).toEqual({
      toolSurface: "computer",
      toolIcon: {
        _tag: "native-app",
        app: { _tag: "app-id", appId: "com.example.Editor" },
      },
      toolSource: {
        key: "native-app:com.example.editor",
        name: "Editor",
        kind: "computer",
      },
    });
  });

  it("does not infer presentation from provider-specific payload data", () => {
    expect(
      extractToolActivityPresentation({
        data: {
          item: {
            arguments: { code: 'await sky.click({ app: "Finder" })' },
            result: {
              _meta: {
                "codex/toolSurface": {
                  kind: "computerUse",
                  app: { kind: "displayName", displayName: "Finder" },
                },
              },
            },
          },
        },
      }),
    ).toEqual({});
  });
});

describe("typed preview tool results", () => {
  it("retains a website icon from the successful MCP envelope", () => {
    expect(
      extractToolActivityPresentation({
        type: "dynamic_tool",
        toolName: "mcp__t3-code__preview_open",
        status: "completed",
        output: { structuredContent: { url: "https://example.com/demo" } },
      }).toolIcon,
    ).toEqual({ _tag: "website", pageUrl: "https://example.com/demo" });
  });
  it("extracts the page from a JSON text MCP result", () => {
    expect(
      extractToolActivityPresentation({
        type: "dynamic_tool",
        toolName: "mcp__t3-code__preview_open",
        status: "completed",
        output: JSON.stringify({
          content: [{ type: "text", text: JSON.stringify({ url: "https://example.com/demo" }) }],
        }),
      }).toolIcon,
    ).toEqual({ _tag: "website", pageUrl: "https://example.com/demo" });
  });
  it("does not turn failed results or unsafe URLs into website icons", () => {
    for (const payload of [
      { status: "failed", output: { url: "https://example.com" } },
      {
        status: "completed",
        output: { isError: true, structuredContent: { url: "https://example.com" } },
      },
      { status: "completed", output: { url: "file:///private" } },
    ])
      expect(
        extractToolActivityPresentation({
          type: "dynamic_tool",
          toolName: "mcp__t3-code__preview_open",
          ...payload,
        }).toolIcon,
      ).toBeUndefined();
  });
});
