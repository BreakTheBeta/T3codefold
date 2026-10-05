import { getSchemaByResolvedExtensions, Node, resolveExtensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { history } from "@tiptap/pm/history";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vite-plus/test";

import {
  buildDocJson,
  ComposerCodeExtension,
  ComposerTaskItemExtension,
  serializeEditorDoc,
} from "~/composer-rich-text-doc";
import {
  composerVimDisplay,
  type ComposerVimState,
  enterComposerVimInsert,
  handleComposerVimKey,
  initialComposerVimState,
  projectComposerDoc,
} from "./ComposerPromptEditorTiptapVim";

const schema = getSchemaByResolvedExtensions(
  resolveExtensions([
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      listItem: false,
      orderedList: false,
      dropcursor: false,
      gapcursor: false,
      trailingNode: false,
      code: false,
    }),
    ComposerCodeExtension,
    Node.create({
      name: "composer-mention",
      group: "inline",
      inline: true,
      atom: true,
      addAttributes: () => ({ path: { default: "" }, source: { default: "" } }),
    }),
    TaskList,
    ComposerTaskItemExtension,
  ]),
);

/**
 * A composer with `value` as its prompt and the caret at the `|` marker, or at
 * `caret` (a projection offset) when the prompt holds chips or task prefixes.
 */
function composer(valueWithCaret: string, caret = valueWithCaret.indexOf("|")) {
  const value = valueWithCaret.replace("|", "");
  const json = buildDocJson(value, (name) => ({ label: name, description: null }), {
    styling: true,
  });
  const doc = ProseMirrorNode.fromJSON(schema, json);
  let state = EditorState.create({ schema, doc, plugins: [history()] });
  const projection = projectComposerDoc(doc);
  state = state.apply(
    state.tr.setSelection(TextSelection.create(doc, projection.positions[caret]!)),
  );
  const vim = initialComposerVimState();
  const yanks: string[] = [];
  let blurred = false;

  const press = (...keys: string[]) => {
    for (const key of keys) {
      const ctrl = key.startsWith("C-");
      const result = handleComposerVimKey(state, vim, {
        key: ctrl ? key.slice(2) : key,
        ctrlKey: ctrl,
        metaKey: false,
        altKey: false,
      });
      if (result.transaction) state = state.apply(result.transaction);
      if (result.yanked !== null) yanks.push(result.yanked);
      if (result.blur) blurred = true;
    }
  };
  /** Types text the way INSERT mode would: straight into the editor. */
  const type = (text: string) => {
    state = state.apply(state.tr.insertText(text));
  };
  const read = () => {
    const { text, positions } = projectComposerDoc(state.doc);
    const offset = (pos: number) => positions.findIndex((candidate) => candidate >= pos);
    return {
      value: serializeEditorDoc(state.doc).value,
      text,
      cursor: offset(state.selection.head),
      selected: text.slice(offset(state.selection.from), offset(state.selection.to)),
    };
  };
  return {
    press,
    type,
    read,
    vim: vim as ComposerVimState,
    yanks,
    blurred: () => blurred,
  };
}

describe("composer Vim mode", () => {
  it("starts in NORMAL mode and swallows printable keys", () => {
    const editor = composer("hello| world");
    editor.press("z", "Enter", "Backspace");
    expect(editor.read().value).toBe("hello world");
    expect(composerVimDisplay(editor.vim)).toEqual({ mode: "NORMAL", pending: "" });
  });

  it("leaves modified keys to the app", () => {
    const state = EditorState.create({ schema });
    const vim = initialComposerVimState();
    expect(
      handleComposerVimKey(state, vim, { key: "n", ctrlKey: true, metaKey: false, altKey: false })
        .consumed,
    ).toBe(false);
    expect(
      handleComposerVimKey(state, vim, {
        key: "Enter",
        ctrlKey: false,
        metaKey: true,
        altKey: false,
      }).consumed,
    ).toBe(false);
  });

  it("moves with counts, words, lines and document edges", () => {
    const editor = composer("|one two three\nfour five");
    editor.press("2", "w");
    expect(editor.read().cursor).toBe(8);
    editor.press("j");
    expect(editor.read().cursor).toBe(22);
    editor.press("$");
    expect(editor.read().cursor).toBe(23);
    editor.press("g", "g");
    expect(editor.read().cursor).toBe(0);
    editor.press("G");
    expect(editor.read().cursor).toBe(23);
  });

  it("finds characters and repeats the find", () => {
    const editor = composer("|a-b-c-d");
    editor.press("f", "-");
    expect(editor.read().cursor).toBe(1);
    editor.press(";");
    expect(editor.read().cursor).toBe(3);
    editor.press(",");
    expect(editor.read().cursor).toBe(1);
    editor.press("t", "d");
    expect(editor.read().cursor).toBe(5);
  });

  it("enters INSERT with i, a, I, A and returns with Escape", () => {
    const editor = composer("  hel|lo");
    editor.press("a");
    expect(editor.vim.mode).toBe("INSERT");
    expect(editor.read().cursor).toBe(6);
    editor.type("X");
    expect(editor.read().value).toBe("  hellXo");
    editor.press("Escape");
    expect(editor.vim.mode).toBe("NORMAL");
    editor.press("I");
    expect(editor.read().cursor).toBe(2);
    editor.press("C-[", "A");
    expect(editor.read().cursor).toBe(8);
  });

  it("deletes, changes and yanks with operators and motions", () => {
    const editor = composer("|one two three");
    editor.press("d", "w");
    expect(editor.read().value).toBe("two three");
    editor.press("c", "i", "w");
    expect(editor.vim.mode).toBe("INSERT");
    editor.type("2");
    expect(editor.read().value).toBe("2 three");
    editor.press("Escape", "0", "y", "e");
    expect(editor.yanks).toEqual(["2"]);
    editor.press("x");
    expect(editor.read().value).toBe(" three");
  });

  it("deletes whole lines and puts them back", () => {
    const editor = composer("first\nsec|ond\nthird");
    editor.press("d", "d");
    expect(editor.read().value).toBe("first\nthird");
    editor.press("P");
    expect(editor.read().value).toBe("first\nsecond\nthird");
  });

  it("selects in VISUAL and VISUAL LINE modes and acts on the selection", () => {
    const editor = composer("|alpha beta\ngamma");
    editor.press("v", "e");
    expect(editor.read().selected).toBe("alpha");
    editor.press("o", "Escape");
    expect(editor.vim.mode).toBe("NORMAL");
    editor.press("V", "j");
    expect(editor.read().selected).toBe("alpha beta\ngamma");
    editor.press("y");
    expect(editor.yanks).toEqual(["alpha beta\ngamma"]);
    editor.press("w", "v", "e", "d");
    expect(editor.read().value).toBe("alpha \ngamma");
  });

  it("opens lines above and below", () => {
    const editor = composer("one|\ntwo");
    editor.press("o");
    editor.type("new");
    expect(editor.read().value).toBe("one\nnew\ntwo");
    editor.press("Escape", "j", "O");
    editor.type("above");
    expect(editor.read().value).toBe("one\nnew\nabove\ntwo");
  });

  it("keeps task items when opening a line", () => {
    const editor = composer("- [x] done", 4);
    editor.press("o");
    editor.type("next");
    expect(editor.read().value).toBe("- [x] done\n- [ ] next");
  });

  it("maps motions and deletions through inline chips", () => {
    const editor = composer("ask @README.md now", 6);
    expect(editor.read().text).toBe("ask ￼ now");
    editor.press("b");
    expect(editor.read().cursor).toBe(4);
    editor.press("x");
    expect(editor.read().value).toBe("ask  now");
  });

  it("undoes and redoes", () => {
    const editor = composer("|one two");
    editor.press("d", "w");
    expect(editor.read().value).toBe("two");
    editor.press("u");
    expect(editor.read().value).toBe("one two");
    editor.press("C-r");
    expect(editor.read().value).toBe("two");
  });

  it("blurs on Escape in NORMAL mode and clears pending input first", () => {
    const editor = composer("one|");
    editor.press("2", "d");
    expect(composerVimDisplay(editor.vim).pending).toBe("2d");
    editor.press("Escape");
    expect(editor.blurred()).toBe(false);
    expect(composerVimDisplay(editor.vim).pending).toBe("");
    editor.press("Escape");
    expect(editor.blurred()).toBe(true);
  });

  it("enters INSERT mode when the timeline asks", () => {
    const editor = composer("one|");
    enterComposerVimInsert(editor.vim);
    editor.press("x");
    expect(editor.vim.mode).toBe("INSERT");
  });
});
