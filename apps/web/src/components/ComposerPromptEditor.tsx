import { ComposerPromptEditorTiptap } from "./ComposerPromptEditorTiptap";
import { ComposerPromptEditorLexical } from "./ComposerPromptEditorLexical";
import type { ComposerPromptEditorProps as TiptapProps } from "./ComposerPromptEditorTiptap";
import type { ComposerPromptEditorProps as LexicalProps } from "./ComposerPromptEditorLexical";
export type {
  ComposerCitationCommentRequest,
  ComposerPromptEditorHandle,
} from "./ComposerPromptEditorTiptap";
export type ComposerPromptEditorProps = TiptapProps &
  Pick<LexicalProps, "vimModeEnabled" | "onVimModeDisplayChange">;
export function ComposerPromptEditor(props: ComposerPromptEditorProps) {
  return props.vimModeEnabled ? (
    <ComposerPromptEditorLexical {...props} />
  ) : (
    <ComposerPromptEditorTiptap {...props} />
  );
}
export type { ComposerVimModeDisplay } from "./ComposerPromptEditorLexical";
