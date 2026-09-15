import { parseMarkdownWithOptions, type MarkdownNode } from "react-native-nitro-markdown/headless";

import {
  nativeMarkdownDocumentRuns,
  nativeMarkdownWithPreservedSoftBreaks,
  type NativeMarkdownTextRun,
} from "./nativeMarkdownText";
import type { SelectableMarkdownSkill } from "./SelectableMarkdownText.types";

function containsImage(node: MarkdownNode): boolean {
  return node.type === "image" || (node.children ?? []).some(containsImage);
}

export function androidSelectableMarkdownContent(
  markdown: string,
  options: {
    readonly preserveSoftBreaks?: boolean;
    readonly skills?: ReadonlyArray<SelectableMarkdownSkill>;
  } = {},
): {
  readonly hasImage: boolean;
  readonly runs: ReadonlyArray<NativeMarkdownTextRun>;
} {
  const parsed = parseMarkdownWithOptions(markdown, {
    gfm: true,
    html: true,
    math: false,
  });
  const document = options.preserveSoftBreaks
    ? nativeMarkdownWithPreservedSoftBreaks(parsed)
    : parsed;
  return {
    hasImage: containsImage(document),
    runs: nativeMarkdownDocumentRuns(document, options.skills),
  };
}
