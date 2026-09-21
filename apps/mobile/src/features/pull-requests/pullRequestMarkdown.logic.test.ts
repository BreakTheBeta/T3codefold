import { describe, expect, it } from "vite-plus/test";

import { markdownImagesFromHtml, resolveMarkdownImageUrl } from "./pullRequestMarkdown.logic";

describe("markdownImagesFromHtml", () => {
  it("rewrites the img tags GitHub writes for dropped screenshots", () => {
    expect(
      markdownImagesFromHtml(
        'Before:\n<img width="600" alt="Home [old]" src="https://github.com/user-attachments/assets/abc-123" />',
      ),
    ).toBe("Before:\n![Home old](https://github.com/user-attachments/assets/abc-123)");
  });

  it("handles several tags on a line and tags without alt text", () => {
    expect(
      markdownImagesFromHtml("<img src='https://a.test/1.png'><img src=https://a.test/2.png>"),
    ).toBe("![](https://a.test/1.png)![](https://a.test/2.png)");
  });

  it("encodes characters that would end the link", () => {
    expect(markdownImagesFromHtml('<img src="https://a.test/my shot (1).png">')).toBe(
      "![](https://a.test/my%20shot%20%281%29.png)",
    );
  });

  it("leaves fenced code and tags without a source alone", () => {
    const body = ["```html", '<img src="https://a.test/x.png">', "```", '<img alt="none">'].join(
      "\n",
    );
    expect(markdownImagesFromHtml(body)).toBe(body);
  });
});

describe("resolveMarkdownImageUrl", () => {
  it("gives protocol-relative URLs a scheme and refuses non-web sources", () => {
    expect(resolveMarkdownImageUrl("//cdn.test/a.png")).toBe("https://cdn.test/a.png");
    expect(resolveMarkdownImageUrl("https://cdn.test/a.png")).toBe("https://cdn.test/a.png");
    expect(resolveMarkdownImageUrl("docs/a.png")).toBeNull();
    expect(resolveMarkdownImageUrl("data:image/png;base64,AAAA")).toBeNull();
  });
});
