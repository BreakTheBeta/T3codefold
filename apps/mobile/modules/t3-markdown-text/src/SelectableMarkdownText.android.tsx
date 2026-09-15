import { useMemo } from "react";
import { View } from "react-native";

import { androidSelectableMarkdownContent } from "./androidSelectableMarkdown";
import {
  MarkdownFileContextMenuContext,
  NativeMarkdownSelectableText,
  type MarkdownFileContextMenuHandlers,
} from "./NativeMarkdownSelectableText";
import {
  SelectableMarkdownText as RichSelectableMarkdownText,
  hasNativeSelectableMarkdownText,
} from "./RichSelectableMarkdownText";
import type { SelectableMarkdownTextProps } from "./SelectableMarkdownText.types";

export type {
  MarkdownCodeHighlighter,
  MarkdownHighlightedToken,
  MarkdownImageRenderer,
  MarkdownImageRequest,
  NativeMarkdownTextStyle,
  SelectableMarkdownSkill,
  SelectableMarkdownTextProps,
} from "./SelectableMarkdownText.types";

export { hasNativeSelectableMarkdownText };

export function SelectableMarkdownText(props: SelectableMarkdownTextProps) {
  const content = useMemo(
    () =>
      androidSelectableMarkdownContent(props.markdown, {
        preserveSoftBreaks: props.preserveSoftBreaks,
        skills: props.skills,
      }),
    [props.markdown, props.preserveSoftBreaks, props.skills],
  );
  const fileContextMenuHandlers = useMemo<MarkdownFileContextMenuHandlers | null>(
    () =>
      props.fileContextMenu && props.onFileContextMenuAction
        ? {
            fileContextMenu: props.fileContextMenu,
            onFileContextMenuAction: props.onFileContextMenuAction,
          }
        : null,
    [props.fileContextMenu, props.onFileContextMenuAction],
  );

  if (content.hasImage) {
    return <RichSelectableMarkdownText {...props} />;
  }

  return (
    <MarkdownFileContextMenuContext.Provider value={fileContextMenuHandlers}>
      <View
        style={{
          flexShrink: 1,
          minWidth: 0,
          marginTop: props.marginTop ?? 0,
          marginBottom: props.marginBottom ?? 0,
        }}
      >
        <NativeMarkdownSelectableText
          runs={content.runs}
          textStyle={props.textStyle}
          onLinkPress={props.onLinkPress}
        />
      </View>
    </MarkdownFileContextMenuContext.Provider>
  );
}
