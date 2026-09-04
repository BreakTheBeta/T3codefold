import { parseMarkdownWithOptions } from "react-native-nitro-markdown/headless";

import {
  nativeMarkdownDocumentRuns,
  nativeMarkdownWithPreservedSoftBreaks,
  type NativeMarkdownTextRun,
} from "./nativeMarkdownText";
import type { SelectableMarkdownSkill } from "./SelectableMarkdownText.types";

export function androidSelectableMarkdownRuns(
  markdown: string,
  options: {
    readonly preserveSoftBreaks?: boolean;
    readonly skills?: ReadonlyArray<SelectableMarkdownSkill>;
  } = {},
): ReadonlyArray<NativeMarkdownTextRun> {
  const parsed = parseMarkdownWithOptions(markdown, {
    gfm: true,
    html: true,
    math: false,
  });
  const document = options.preserveSoftBreaks
    ? nativeMarkdownWithPreservedSoftBreaks(parsed)
    : parsed;
  return nativeMarkdownDocumentRuns(document, options.skills);
}
