import {
  SelectableMarkdownText as T3SelectableMarkdownText,
  type SelectableMarkdownTextProps,
} from "@t3tools/mobile-markdown-text/renderer/android";

import { highlightCodeSnippet } from "../features/review/shikiReviewHighlighter";

type MobileSelectableMarkdownTextProps = Omit<SelectableMarkdownTextProps, "highlightCode">;

export type {
  MarkdownImageRenderer,
  MarkdownImageRequest,
  NativeMarkdownTextStyle,
  SelectableMarkdownSkill,
} from "@t3tools/mobile-markdown-text/types";

// Android renders the Markdown runs inside one selectable React Native Text
// tree so selection can span paragraphs, lists, and tables.
export function hasNativeSelectableMarkdownText(): boolean {
  return true;
}

export function SelectableMarkdownText(props: MobileSelectableMarkdownTextProps) {
  return <T3SelectableMarkdownText {...props} highlightCode={highlightCodeSnippet} />;
}
