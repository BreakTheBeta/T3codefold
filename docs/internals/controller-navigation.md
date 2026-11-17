# Controller navigation contract

Controller support is a reachability property of the client, not a count of mapped buttons.
A visible control is not necessarily reachable, and a correct focus model does not prove that
Android, Electron, a virtualized list, or a particular controller delivers the expected input.
This contract defines the required behavior; it is not a declaration that every client passes it.

## State and ownership

Treat navigation state as `(surface, scope stack, region, target, input mode)`:

- **Surface** identifies the active chat column or native screen. Main and side-chat drafts
  are different surfaces even when they share a route.
- **Scope stack** holds overlays above their invoking scope. Only the top scope owns input.
- **Region** is threads, conversation, reply, or a feature pane such as Settings or the inspector.
- **Target** is an enabled semantic action or text field within that region. The region itself
  remains a valid destination when its target list is empty.
- **Input mode** is navigation, editing, dictation, or suspended. Dictation retains its text
  destination independently of whichever visual control currently has focus.

An empty thread, loading thread, collapsed fold, expanded fold, scroll boundary, open keyboard,
missing reply, disabled action, and recycled row are conditions of these states. They must not
require an unrelated button mapping or an implicit jump to a different surface.

## Transition rules

| State                    | Directional input                                                                                    | Activate                                                             | Back / Cancel                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Threads                  | Traverse threads; enter the selected conversation through the client's region command                | Select thread and enter its conversation                             | Unwind the owning screen                                                  |
| Conversation             | Traverse inline actions and scroll within this conversation; region commands reach threads and reply | Acquire a visible action first, then activate it on a separate press | Return to threads, or unwind the owning screen if threads are unavailable |
| Reply, navigation mode   | Return to conversation or traverse composer controls                                                 | Enter text editing; submit requires an explicit submit action        | Return to conversation                                                    |
| Text editing             | Text movement or adjustment belongs to the editor                                                    | Preserve editor semantics                                            | Leave editing and restore navigation                                      |
| Dictation                | Preserve the owning text destination                                                                 | Never submit as a side effect of starting/stopping voice             | Cancel recording without discarding another draft                         |
| Inspector / Settings     | Traverse local controls and scroll local content                                                     | Perform the focused semantic action                                  | Unmaximize, close, or leave one level, restoring the invoking region      |
| Menu / question / dialog | Stay inside the top scope; custom widgets own their local arrow behavior                             | Perform only the focused, enabled action                             | Close one scope and restore its invoking target or region                 |
| Suspended / disconnected | No navigation repeats or stale activations                                                           | No stale activation on resume                                        | Resume requires neutral input before a held action can fire               |

Physical mappings may differ between clients; these semantic transitions must remain reachable.
Android currently uses Right from conversation/inline content to reply, Left back to conversation,
and Left again to the visible thread list. Desktop exposes explicit conversation/reply commands
and pane traversal. Do not infer identical behavior from identical button labels.

## Invariants

1. **Scope isolation:** navigation, scrolling, dictation, submit, and discard affect only their
   owning surface and top scope. An underlying pane cannot absorb input from a modal.
2. **Progress:** a vertical conversation step either reaches another inline action, advances
   the viewport, reaches the reply at the end, or stays at a genuine content boundary.
   A gap without buttons is scrollable content, not the end of the conversation.
3. **Escape:** every non-root state has a controller path back. Fullscreen, keyboard, terminal,
   dialogs, and recording cannot require touch to recover navigation.
4. **Acquisition is not activation:** repairing missing focus or entering a region cannot also
   approve, send, delete, discard, or activate the first available control.
5. **Stable lifecycle:** recycling a row cannot strand focus or reset held scrolling. If a
   target disappears, recover within its region. A real scope replacement stops old repeats
   and waits for neutral input. These are different events.
6. **Capability guards:** disabled, hidden, stale, and cross-scope targets cannot execute.
   If a reply is unavailable, stay in a usable region; never redirect text to another draft.
7. **Reversibility:** Back removes one owned layer and restores a valid destination, with a
   region fallback if the invoking target has disappeared.
8. **Bounded reachability:** when available in the active workspace, the reply and thread list
   are reachable without traversing the entire history. Conversely, reaching the reply by
   vertical traversal must not skip the unread remainder of the conversation.

## Executable evidence

Test these requirements through the production adapters, not through a second implementation
of an ideal state graph. The Android focus tests call the router used by both D-pad and analog
navigation against real Android View/ScrollView hierarchies. Vary viewport width, sidebar
availability, content length, starting scroll position, and inline-action density. Assert both
scope safety after each step and eventual arrival at reply/start within a content-derived bound.
Keep concrete failure traces for bugs the combinations expose.

Input edge tests separately cover held/released keys, neutral input, scope replacement, and
editor ownership. Registry tests cover stale IDs and dictation destinations. Desktop browser
adapter tests cover real DOM focus, clipping, dialogs, pane transitions, and custom widgets.
None of these layers substitutes for the others.

A claim that a workflow is controller-complete requires one uninterrupted run through the real
client using controller input: enter the state, perform its action, reverse it, and recover after
its target disappears or becomes unavailable. Record client/version, controller, inputs, and
observed destinations. Include compact and split layouts, long virtualized history, empty/loading
content, editor/keyboard, recording/permission interruption, modal nesting, and disconnect/resume.
Launching the app or touching the reply field does not establish controller acceptance. Missing
hardware evidence remains unverified; passing source or model tests cannot promote it to pass.
