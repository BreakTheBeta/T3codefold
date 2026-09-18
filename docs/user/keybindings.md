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
through those regions and the right panel. In the sidebar, `j`/`k` moves between
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

In the right panel, `j`/`k` moves between items, `Enter` or `o` activates one,
`H`/`L` changes panel tabs, `/` focuses a panel search field, and `f`/`F` labels
the current panel's controls. File trees additionally use native `h`/`l` folder
navigation and `gg`/`G` first/last-item movement. Terminals and browser previews
retain their native input behavior except for observable `Ctrl+w` pane movement.

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
The current composer mode is shown beside the attachment control.

## Composer controls

In **Settings → General → Send shortcut**, choose whether Enter sends, requires
`mod+Enter` for multiline prompts, or always requires `mod+Enter`. `Shift+Enter`
inserts a new line. This applies to the web and desktop composer at desktop widths.

**Follow-up behavior** chooses Queue or Steer while the agent runs. Use
`mod+Enter` to do the opposite for one message. When sending requires `mod+Enter`,
use `mod+Shift+Enter` for the opposite action. In a new thread, `mod+Enter` keeps
starting the thread in the background.

Use `mod+shift+m` to choose a model and `mod+shift+h` to choose a host.
Use `mod+shift+e` for effort, `mod+shift+a` for access mode, `mod+shift+x` for the
workspace, and `mod+shift+g` for the Git branch. The workspace menu includes the
current checkout, a new worktree, and the previous worktree when available.
Use `mod+shift+l` to reuse the previous worktree directly.

In the model picker, press Left in an empty search field or Shift+Tab to reach
the provider list. Use Up/Down to move and Enter to choose. Right returns to
model search. `mod+shift+up` and `mod+shift+down` switch providers directly and clear the
search. These provider shortcuts can also be changed in Settings.

These shortcuts run inside the focused web or desktop client. `mod` uses Command
on macOS and Ctrl on Windows and Linux, including GNOME, KDE Plasma, Niri, and
Hyprland. If a custom desktop shortcut takes the same keys, choose another binding
in Settings.

## Copy pull request references

With a PR open in the right panel or on the Pull Requests page, use `mod+shift+c`
to copy its URL and `mod+shift+k` to copy its number with a `#` prefix.
Both shortcuts can be changed in Settings. Search for “Copy Link or Thread ID”
or “Copy Number”. They copy the selected PR and leave terminal input alone.

## iPad

With a hardware keyboard, use `Cmd+1` through `Cmd+9` to open the first nine
displayed threads. The shortcuts follow the current list filters and order.
`Cmd+K` opens the command palette to search commands, projects, and threads.
Use the arrow keys and Return to choose a result, or `Cmd+1` through `Cmd+9` to
choose directly. Escape or `Cmd+K` closes the palette. Start a search with `>`
to show only actions.

In the composer, Return sends and `Shift+Return` inserts a new line. `Cmd+Return`
also sends. To make Return insert a new line instead, change the Return key
behavior in Settings → Keyboard.

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
