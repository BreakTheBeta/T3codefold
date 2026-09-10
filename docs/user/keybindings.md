# Keybindings

Customize shortcuts in **Settings → Keybindings** on web and desktop. That page
also lists the command IDs and defaults available in your version.

## Vim keyboard mode

Enable **Settings → General → Vim keyboard mode** for Vim-style conversation
navigation and modal composer editing on web and desktop. The terminal, browser
preview, dialogs, and menus keep their native keyboard behavior.

New to the feature? Follow the [Vim keyboard mode learning guide](./vim-keyboard-mode.md)
for the sidebar → response → composer workflow and a progressive practice plan.

In a conversation, use smooth `j`/`k` scrolling, `Ctrl+d`/`Ctrl+u` for half pages,
`gg`/`G` for the start or end, and `{`/`}` for the previous or next message.
Use `Ctrl+w` followed by `h`, `j`, `k`, or `l` to move focus left, down, up, or
right between the thread sidebar, conversation, and composer. `Ctrl+w w` cycles
through those three regions. In the sidebar, `j`/`k` moves between projects and
threads, `h`/`l` collapses or expands projects, `/` focuses the thread filter,
`Enter` or `o` opens the focused item, and `s`/`u` settles or un-settles the
focused thread. While filtering, `Ctrl+n`/`Ctrl+p` moves through results using
the search field's native selection.
Use `m` plus a letter to set a thread-local mark, backtick plus that letter to
jump to it, and two backticks to jump back. `f` labels visible controls for
activation; `F` labels them for focus. `i` focuses the composer in Insert mode,
`gi` focuses it in Normal mode, and `z` passes keys through until `Esc`.
In open dropdowns, completion menus, and filtered pickers, `Ctrl+n` and `Ctrl+p`
move to the next or previous choice.

Press `v` to place a conversation caret, move it with Vim motions, or press `f`
for labels that jump to visible text. Press `v` again for character selection or
`V` for line selection. Selections can cross rendered turns and messages; `y`
copies the whole selection and `c` cites each selected assistant-message segment
in the composer. Press `?` for the in-app reference.

Use `:` for T3 Code's command palette. The Zed-style leader bindings `Space f`,
`Space /`, `Space b`, and `Space s` open files, search conversation content,
browse commands and threads, and focus the sidebar.

The composer supports Normal, Insert, Visual, and Visual Line modes, counts,
common character/word/line/document motions, `f`/`t` searches, `d`/`c`/`y`
operators, `iw`/`aw` text objects, paste, undo, and redo. `Esc` moves from Insert
to Normal; pressing it again returns keyboard ownership to the conversation.
Existing `Cmd`/`Ctrl` shortcuts continue to work in every mode.

## Edit the configuration file

Keybindings live on the environment's machine, in
`~/.t3/userdata/keybindings.json` by default. You can edit this file directly.
It is a JSON array of rules:

```json
[
  { "key": "mod+g", "command": "terminal.toggle" },
  { "key": "mod+shift+g", "command": "terminal.new", "when": "terminalFocus" }
]
```

T3 Code creates the file with its defaults and adds new defaults on later startups.
New defaults do not replace commands you customized. If a new default overlaps one
of your shortcuts, [rule order](#precedence) decides which runs.
Invalid rules are ignored; if the file cannot be parsed, T3 Code uses defaults.

## Rule shape

Each rule requires a `key` shortcut and a `command` ID. An optional `when`
expression restricts when it runs.

Project scripts use `script.{id}.run`, such as `script.test.run`.

## Key syntax

Join modifiers and a key with `+`, such as `mod+shift+d` or `ctrl+l`.
`mod` means Command on macOS and Control elsewhere. Other modifiers are
`cmd` / `meta`, `ctrl` / `control`, `alt` / `option`, and `shift`.

## When conditions

Available context keys are `terminalFocus`, `terminalOpen`, `previewFocus`,
`previewOpen`, and `modelPickerOpen`. Unknown keys evaluate to `false`.

Combine keys with `!` for not, `&&` for and, `||` for or, and parentheses:

```json
{ "key": "mod+j", "command": "terminal.toggle", "when": "terminalOpen && !terminalFocus" }
```

## Precedence

The last rule whose key and condition both match wins, even if it belongs to a
different command. Put a more specific rule after a general one when they share
a shortcut.

## Commands with special behavior

`thread.stop` interrupts the running turn in the focused thread. It has no default
shortcut; assign one in **Settings → Keybindings**.

`chat.new` may ask you to choose a project when there is more than one.
`chat.newLocal` skips that chooser. Both use your
[new-thread defaults](./thread-sidebar.md#start-a-thread).

## Reserved shortcuts

In the desktop app, `mod+w` closes the focused terminal or the active right-panel
tab. When nothing remains to close, it closes the window. In a browser, `mod+w`
closes the browser tab; rebind `rightPanel.close` and `terminal.close` to an available
shortcut such as `alt+w`.

Many defaults include `!terminalFocus` so they do not intercept terminal input.
Keep that condition when remapping them if you want the same behavior.

## Desktop quit shortcut

Use `Cmd+Q` on macOS or `Ctrl+Q` on Windows and Linux. In the default **Hold** mode,
hold for 1.2 seconds or press twice within 500 milliseconds. Holding requires
keyboard repeat; if repeat is disabled, use two presses or the application menu.

Change **Settings → General → Confirmations → Quit shortcut** to **Direct** for a
single press or **Double press** for two presses only. Choosing **Quit** from the
application menu always quits immediately.
