# Working with threads

Use a new thread for a separate task. Choose **New worktree** when its code changes
need a separate branch and working directory.

## Start a thread

On web and desktop, a new thread keeps the current project and carries your model
and mode selections, unless the destination project has its own model default.
Its branch and workspace mode come from your configured defaults. To continue in
an existing worktree, use **New thread in this worktree** from the branch toolbar.

When you change a new thread's project, T3 Code stays in the current environment
if that project exists there. Otherwise it selects an environment that has it.

### Start in the background

In a desktop browser or the desktop app, press `Cmd+Enter` on macOS or `Ctrl+Enter`
on Windows and Linux to start a new thread and immediately open another draft. The
next draft keeps the workspace mode and base branch you selected. With **New
worktree**, each background submission creates its own worktree.

## Pin and reorder threads

Pin a thread from its menu to keep it above your active work. Drag pinned threads
to reorder them on web and desktop, or use **Move up** and **Move down** on mobile.
The order syncs across devices.

On web and desktop, you can also drag files from your computer onto any thread row:
the thread opens and the files are attached in its composer, ready for
your next message. The same per-message file limits apply as when attaching
files directly; see [Attach files](./composer.md#attach-files).

Pinning does not prevent automatic settlement. Settling a thread removes its pin.

To generate a fresh title from the conversation, open a thread's menu and choose
**Regenerate title**. The action is unavailable while title generation is in progress
or when the connected environment needs a server update.

Agents connected through T3 Code can use the same server-owned metadata workflow to
rename a thread, regenerate its title, or link and unlink a pull request. These changes
appear on web, desktop, and mobile without requiring the originating browser to remain
open.

## Settle finished work

Choose **Settle thread** from its menu to move finished work out of the active list
without deleting the conversation. **Un-settle thread** restores it to active work
and prevents automatic settlement until new activity resumes the usual rules.

By default, environments settle inactive threads after three days and settle
threads whose pull request merged. A closed pull request can also settle an idle
thread. Work in progress, pending questions or approvals, and live background work
prevent automatic settlement. An open pull request does not prevent inactivity
settlement, but an old closed or merged pull request does not settle work you
resumed after it closed.

Change these rules in **Settings → General**. They continue to run when your apps
are closed. Changes apply to connected environments that support shared settings;
offline environments and older servers keep their previous values. If connected
environments disagree, **Apply to all** copies your current settings to those named
in the warning. Changing a rule does not reopen already settled threads.

## Link a pull request

On web and desktop, right-click a pull request link in a thread and choose
**Link to thread**. Use **Unlink from thread** on the same link to remove it.
The linked pull request participates in automatic settlement.

## Find and reference work

On web and desktop, open the command palette with `Cmd/Ctrl+K` to search threads
across connected environments. Message search starts after two characters and
includes your messages and final agent responses.

Use **Settings → Keybindings** to find or customize shortcuts for searching files
and copying a thread reference. A copied reference uses the thread's pull request
link when available, otherwise its thread ID. See [keybindings](./keybindings.md)
for custom configuration.

## Inspect agent work

On web and desktop, use **Agents** to follow work delegated to subagents.

Expand a tool call in the conversation to see its full command and output.
Summaries shorten shell wrappers and can still describe the latest call after it
finishes; the call's own result shows its status.

## GLaDOS

Open an existing thread and choose **Activate GLaDOS** to give its environment a persistent coordinator. Set its priorities, quality expectations, worker model, permissions, and concurrency and retry limits. Its dedicated entry stays available above project filtering. Each environment can elect its own GLaDOS.

Add tasks with acceptance criteria and a verification command or recipe. GLaDOS can start eligible work proactively, receive worker questions, and inspect evidence before accepting a result. Pause stops new assignments; existing workers keep running until stopped. Use **Stop for rework**, then reopen the task after its worker stops. **Resume candidate** retains that worker's worktree while using the model selected in the GLaDOS thread. Dismiss the role before archiving, settling, snoozing, or unpinning its thread.

The work panel can read a selected Vikunja project, Jira project, or Linear team. Use a read credential; it stays on the environment. Imports start as candidates: review their criteria and verification recipe before reopening them. A tracker's “Done” status does not accept work in T3, and T3 does not write status changes back to trackers.

For a shared tracker scope, configure both environments under **Connected GLaDOS peers** with their environment IDs, reachable server URLs, and the same dedicated random peer key. Propose a coordinator and approve the proposal on both environments. The pilot supports two participants per shared scope. The first agreement chooses the task home, where workers run and evidence stays. Later proposals can change the coordinator while retaining that home; approve or decline them after resolving existing writers. The coordinator forwards task controls to the home and receives task and evidence updates automatically. Requests remain queued when a peer is offline. To open a remote worker thread, pair this client with its task-home environment. Disconnecting a peer does not release its shared work for automatic takeover.

Mobile provides GLaDOS navigation, task controls, evidence, and coordination approval. Configure tracker and peer connections from web or desktop. Models use the ordinary T3 provider tools. Codex and Claude shell sessions can use `t3 work read` and `t3 work command --file command.json` with the same scoped authority; other providers use MCP where supported. The CLI's `--dry-run` checks the command's format without sending it or validating current server state.
