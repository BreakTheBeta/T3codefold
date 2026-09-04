import { useMemo } from "react";
import { Linking, Text, type TextStyle } from "react-native";

import { androidSelectableMarkdownRuns } from "./androidSelectableMarkdown";
import type { NativeMarkdownTextRun } from "./nativeMarkdownText";
import type {
  NativeMarkdownTextStyle,
  SelectableMarkdownTextProps,
} from "./SelectableMarkdownText.types";

const DEFAULT_BODY_FONT_SIZE = 15;
const DEFAULT_HEADING_FONT_SIZES = [22, 19, 17, 16, 15, 15] as const;

function headingFontSize(textStyle: NativeMarkdownTextStyle, level: number): number {
  const index = Math.max(0, Math.min(5, level - 1));
  const configured = textStyle.headingFontSizes?.[index];
  if (typeof configured === "number" && Number.isFinite(configured)) return configured;
  return Math.max(
    12,
    Math.round(DEFAULT_HEADING_FONT_SIZES[index] * (textStyle.fontSize / DEFAULT_BODY_FONT_SIZE)),
  );
}

function androidRunStyle(
  run: NativeMarkdownTextRun,
  textStyle: NativeMarkdownTextStyle,
): TextStyle {
  const isFile = run.fileIcon != null;
  const isSkill = run.skillName != null;
  const isHeading = run.role === "heading";
  const isCodeBlock = run.role === "code-block" || run.role === "code-language";
  const headingSize = headingFontSize(textStyle, run.headingLevel ?? 1);

  return {
    color: isFile
      ? textStyle.fileTextColor
      : isSkill
        ? textStyle.skillTextColor
        : run.href
          ? textStyle.linkColor
          : isHeading || run.bold
            ? textStyle.strongColor
            : run.role === "quote-marker"
              ? textStyle.quoteMarkerColor
              : run.role === "divider"
                ? textStyle.dividerColor
                : run.role === "list-marker" || run.role === "code-language"
                  ? textStyle.mutedColor
                  : isCodeBlock
                    ? textStyle.codeColor
                    : run.code
                      ? textStyle.inlineCodeColor
                      : textStyle.color,
    fontFamily:
      run.code || isCodeBlock
        ? "monospace"
        : isHeading
          ? textStyle.headingFontFamily
          : run.bold || isFile || isSkill
            ? textStyle.boldFontFamily
            : textStyle.fontFamily,
    fontSize:
      run.role === "spacer"
        ? (run.spacing ?? 10)
        : isHeading
          ? headingSize
          : run.role === "code-language"
            ? Math.max(10, Math.round(textStyle.fontSize * 0.73))
            : run.code || isCodeBlock
              ? Math.max(12, textStyle.fontSize - 2)
              : textStyle.fontSize,
    lineHeight:
      run.role === "spacer"
        ? (run.spacing ?? 10)
        : run.role === "list-break"
          ? textStyle.lineHeight + (run.spacing ?? 0)
          : isHeading
            ? Math.max(headingSize + 6, textStyle.lineHeight + 2)
            : isCodeBlock
              ? Math.max(16, textStyle.lineHeight - 2)
              : textStyle.lineHeight,
    fontStyle: run.italic ? "italic" : "normal",
    fontWeight: isHeading || run.bold || isFile || isSkill ? "700" : "400",
    textDecorationLine: run.strikethrough
      ? "line-through"
      : run.href && !isFile
        ? "underline"
        : "none",
    backgroundColor: isCodeBlock ? textStyle.codeBlockBackgroundColor : undefined,
  };
}

export type {
  MarkdownCodeHighlighter,
  MarkdownHighlightedToken,
  MarkdownImageRenderer,
  MarkdownImageRequest,
  NativeMarkdownTextStyle,
  SelectableMarkdownSkill,
  SelectableMarkdownTextProps,
} from "./SelectableMarkdownText.types";

export function hasNativeSelectableMarkdownText(): boolean {
  return true;
}

export function SelectableMarkdownText({
  markdown,
  skills,
  textStyle,
  preserveSoftBreaks,
  onLinkPress,
  marginTop = 0,
  marginBottom = 0,
}: SelectableMarkdownTextProps) {
  const runs = useMemo(
    () => androidSelectableMarkdownRuns(markdown, { preserveSoftBreaks, skills }),
    [markdown, preserveSoftBreaks, skills],
  );
  const keyedRuns = useMemo(() => {
    const occurrences = new Map<string, number>();
    return runs.map((run) => {
      const signature = JSON.stringify(run);
      const occurrence = occurrences.get(signature) ?? 0;
      occurrences.set(signature, occurrence + 1);
      return { key: `${signature}:${occurrence}`, run };
    });
  }, [runs]);

  return (
    <Text
      selectable
      style={{
        flexShrink: 1,
        minWidth: 0,
        marginTop,
        marginBottom,
        color: textStyle.color,
        fontFamily: textStyle.fontFamily,
        fontSize: textStyle.fontSize,
        lineHeight: textStyle.lineHeight,
      }}
    >
      {keyedRuns.map(({ key, run }) => (
        <Text
          key={key}
          style={androidRunStyle(run, textStyle)}
          onPress={
            run.href
              ? () => {
                  if (onLinkPress) onLinkPress(run.href!);
                  else void Linking.openURL(run.href!);
                }
              : undefined
          }
        >
          {run.skillName && run.skillLabel ? `◆\u00a0${run.skillLabel}` : run.text}
        </Text>
      ))}
    </Text>
  );
}
