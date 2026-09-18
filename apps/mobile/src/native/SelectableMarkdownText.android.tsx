import {
  SelectableMarkdownText as T3SelectableMarkdownText,
  type SelectableMarkdownTextProps,
} from "@t3tools/mobile-markdown-text/renderer/android";
import { useMemo } from "react";

import { highlightCodeSnippet } from "../features/review/shikiReviewHighlighter";
import { themeColorWithAlpha } from "../lib/mobileTheme";
import { useUniwindTheme } from "../lib/useUniwindTheme";

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
  const theme = useUniwindTheme();
  const selectionColor = themeColorWithAlpha(theme["--color-primary"], 0.32);
  const selectionHandleColor = theme["--color-primary"];
  const textStyle = useMemo(
    () => ({ selectionColor, selectionHandleColor, ...props.textStyle }),
    [props.textStyle, selectionColor, selectionHandleColor],
  );
  return (
    <T3SelectableMarkdownText
      {...props}
      textStyle={textStyle}
      highlightCode={highlightCodeSnippet}
    />
  );
}
