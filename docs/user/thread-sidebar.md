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

Pin a thread from its menu to keep it above your active work.

On web and desktop, you can also drag files from your computer onto any thread row:
the thread opens and the files are attached in its composer, ready for
your next message. The same per-message file limits apply as when attaching
files directly; see [Attach files](./composer.md#attach-files).

On web and desktop, pinning or unpinning a thread keeps the sidebar at your current
scroll position instead of following the thread to its new place in the list.

Pinning does not prevent automatic settlement. Settling a thread removes its pin.

On web and desktop, drag a thread between sections to change its state. Drag a thread up into
the pinned section to pin it at the spot you drop it; drag a pinned thread down into the active
list to unpin it. Dragging a thread onto the **Settled** header settles it, and dragging a settled
thread into the active list un-settles it. A snoozed thread can be dragged out of the snoozed
shelf, which wakes it, but threads cannot be dragged into the shelf because snoozing needs a wake
time. Dragging a pinned thread out of the pinned section does not ask for unpin confirmation.
Pinned and active boundary labels appear only while dragging, without moving the rows. The
other rows slide aside to show where the thread will land. When you cross into another section,
the dragged thread shows the action the drop performs, with its icon: **Pin**, **Unpin**,
**Settle**, **Un-settle**, or **Wake**. Its status and hover actions hide during the drag. A pinned
thread keeps its pin only while it stays in the pinned section; once it leaves, the badge takes
over. Reordering within the same section shows no badge. When there are no pins, drag to the top
edge to pin a thread. Section labels stay readable for the whole drag, and the section the
thread is over takes the accent color. Section labels also
identify empty sections and a collapsed settled shelf.

Drag within the pinned or active section to change its order. Other rows slide aside to show the
spot where the thread will land. Drops into either section keep the position you choose. On
mobile, open a thread's menu and choose **Arrange threads**. Drag a handle within or between
**Pinned** and **Active** to reorder, pin, or unpin. Drop onto the **Settled** divider to
settle a thread. The dragged card shows the action before you release it. Expand **Snoozed**
or **Settled** to drag a parked thread back into either live section. Each drop saves; **Done** returns to the thread list.
**Move up** and **Move down** are also available in the thread menu. The server
saves the order, so it survives a refresh and appears on your other connected devices.

On web and desktop, the list also animates section changes made with thread actions such as
**Pin**, **Settle**, and **Snooze**. These transitions respect your system's reduced-motion
preference. While dragging, rows follow the insertion gap without replaying a second transition
after the drop.

New threads appear above the active threads you have arranged. Settling clears a thread's active
position, so using **Un-settle** returns it to the top. Pinning and snoozing preserve its active
position until you move it again. Thread activity does not change the order. The settled shelf
continues to use settlement time.

If dragging is unavailable for one environment, update the T3 Code server running in that
environment. Pinned and active reordering require server support. Threads from older servers keep
their default order until the server is updated.

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
Manually settling an idle thread dismisses unanswered async questions without
sending an answer or restarting the agent.

By default, environments settle inactive threads after three days and settle
threads whose pull request merged. A closed pull request can also settle an idle
thread. Work in progress, pending questions or approvals, and live background work
prevent automatic settlement. An open pull request does not prevent inactivity
settlement, but an old closed or merged pull request does not settle work you
resumed after it closed.

Change these rules in **Settings → General**. They continue to run when your apps
are closed. On web and desktop, choose an environment at the top to change only
its rules, or **All environments** to update connected environments together.
Mixed values show where the selected environments disagree. Mobile applies these
rules to connected environments that support shared settings. Offline environments
and older servers keep their previous values. Changing a rule does not reopen
already settled threads.

## Link a pull request

The server finds the PR for each unsettled thread's saved branch, even when your
apps are closed. Settled threads keep their saved links. Update the server if
automatic branch links do not appear.

On web and desktop, right-click a pull request link in a thread and choose
**Link to thread** to select a different PR. Use **Unlink from thread** on the
same link to return to the branch PR, if one exists.
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

Choose **GLaDOS → Set up** in the sidebar to create a persistent conversation and working folder on that environment. No active repository thread is needed. Set priorities, quality expectations, models and limits; you can leave project scope empty and authorize work later. Opening GLaDOS reuses its home. An existing elected conversation, history and tasks stay in place. Each connected environment owns its own home.

New web/desktop homes start with a limit of three concurrent workers; adjust the limit to match the host’s capacity. Existing limits are preserved. Choose local projects and permitted peers in the brief. Peer selection limits outgoing agent coordination; it does not revoke shared agreements or stop workers. Pick one or two worker configurations from this environment’s model dropdown, including the thinking levels each provider supports. Tell GLaDOS when to use each configuration under **How GLaDOS should choose**. It chooses per task, rather than switching models automatically after a failed attempt. Omitting a choice uses the default worker. Remote work uses its task home’s configuration. Mobile displays the saved configurations and scope; edit them on web or desktop.

To enable full auto deliberately, open **Brief**, select **Full auto for GLaDOS and new workers**, and save. With nonempty project scope and work unpaused, this starts a coordinator turn. You can change either permission separately. The summary shows effective GLaDOS permissions and the setting for new workers; existing worker runs retain their assigned permissions. Full auto includes routine delegation and lets GLaDOS prepare and save verification checks for new work within the saved brief. On mobile, use **Use full auto** in GLaDOS work. Product decisions, shared leadership changes, and changes to proof requirements after an attempt still need you. You can choose manual recipe review under **Verification setup** in the web or desktop brief.

Routine worker questions and operational blockers stay with GLaDOS; they remain visible under **Working**. **Needs you** highlights decisions and prepared setup that require your review. When GLaDOS needs your judgment, open the task’s decision and choose an option or give your own direction. Only that task and its dependencies wait; independent work continues. You can leave a decision for later. Acknowledging a message does not approve it. After your answer, GLaDOS or the project lead reconciles the retained work within the existing brief and limits.

On mobile, open **GLaDOS work** and search or filter by project and use **All**, **Needs you**, **Working**, or **Delivered** to find outcomes across the environment’s projects. Narrow windows show one outcome at a time; wide windows keep the list beside its details. Folding preserves the selected outcome and an unsent answer while the screen remains open. New mobile outcomes use project files by default; choose an isolated code workspace when the project needs Git isolation.

For sustained project work, ask GLaDOS to create or reuse a project lead. The lead keeps project context, coordinates workers within the shared limit, reviews their combined result, and reports back through GLaDOS. Small tasks can still go directly to a worker. Open GLaDOS work to inspect the lead and its retained context. **Return to GLaDOS** makes the lead dormant without stopping existing workers; **Reactivate** restores its management role. Project leads are local to their environment and do not change shared peer leadership.

With automatic verification enabled, GLaDOS inspects the project and saves its checks before assigning new work. If manual review is selected, or proof requirements would change after an attempt, GLaDOS prepares a proposal. Open the task’s **Review proposed settings**, inspect readiness, checks and permitted effects, then **Save and select profile**. Only saving approves configuration; saying “continue” in chat does not. Saving retains pending decisions and never substitutes a missing tool or device with a passing result.

Describe the outcome you want in the GLaDOS conversation. It prepares the tasks, success criteria and verification plan, then keeps the work view updated as it works. **Talk to GLaDOS** returns to your draft. Manual task entry remains available under **Connections and administration** on web/desktop or **Brief & team** on mobile. On web and desktop, manual tasks use project files by default; choose an isolated Git worktree for code changes. Search and filter the work view to find outcomes across projects, and open an outcome to inspect its decisions, dependencies and evidence. Open Work for a focused view with outcomes beside their details. Drag the list divider to adjust its width, or focus it and use the arrow keys; your width is remembered. Narrow windows show the list or the selected outcome, with **Back** returning to the list. **Back to chat** returns to your existing draft. GLaDOS can start eligible work proactively, receive worker questions, and inspect evidence before accepting a result. Pause stops new assignments; existing workers keep running until stopped. Use **Stop for rework**, then reopen the task after its worker stops. Reassigning a stopped task with a named worktree automatically retains its latest candidate. **Resume candidate** lets you explicitly choose retained work while using the model selected in the GLaDOS thread. Dismiss the role before archiving, settling, snoozing, or unpinning its thread.

The work panel can read a selected Vikunja project, Jira project, or Linear team. Use a read credential; it stays on the environment. Imports start as candidates: review their criteria and verification recipe before reopening them. A tracker's “Done” status does not accept work in T3, and T3 does not write status changes back to trackers.

For a shared tracker scope, configure both environments under **Connected GLaDOS peers** with their environment IDs, reachable server URLs, and the same dedicated random peer key. Propose a coordinator and approve the proposal on both environments. The pilot supports two participants per shared scope. The first agreement chooses the task home, where workers run and evidence stays. Later proposals can change the coordinator while retaining that home; approve or decline them after resolving existing writers. The coordinator forwards task controls to the home and receives task and evidence updates automatically. Requests remain queued when a peer is offline. To open a remote worker thread, pair this client with its task-home environment. Disconnecting a peer does not release its shared work for automatic takeover.

Mobile provides GLaDOS navigation, task controls, evidence, and coordination approval. Configure tracker and peer connections from web or desktop. Models use the ordinary T3 provider tools. Codex and Claude shell sessions can use `t3 work read` and `t3 work command --file command.json` with the same scoped authority; other providers use MCP where supported. The CLI's `--dry-run` checks the command's format without sending it or validating current server state.

### Captured verification

Select a task in the GLaDOS work board and choose **New evidence profile**. Approve the checks for that kind of work, then select the profile under **Evidence profile for this task**. A project can have different profiles for code, research, audio and operations. Existing project recipes remain defaults. With automatic verification enabled, GLaDOS and project leads can configure checks for unattempted work in their scope. Only you can change proof requirements after an attempt. Existing briefs retain manual review until you enable automatic setup.

Choose the subject appropriate to the outcome:

- **Code commit:** workers report `commit:<full SHA>`. Checks run in a disposable checkout.
- **File / audio / research packet:** approve a relative input path. Workers report `sha256:<SHA-256 digest of that file's bytes>`. Checks receive a temporary copy of that file, with no Git requirement. A research packet should contain dated sources, findings and unknowns; a render should carry or reference its reproducibility information. Input changes during verification invalidate the check.
- **Host / service observation:** approve a target and commands on this environment, permitted effects and an evidence lifetime. Workers report `observation:<target>`. Checks run in the project workspace. A required configuration file can be hashed with the observation. Expired results cannot be accepted as fresh proof.

Readiness should check required tools, hardware and services. Missing capabilities, wrong environments, timeouts and missing artifacts are inconclusive. Commands have normal host permissions: selecting “Observe only” expresses what you approve the commands to do, rather than installing a security sandbox. Configure cleanup for any processes the commands start. Checks do not automatically move to another host.

After workers stop and report a candidate, ask the lead to run captured verification and inspect its receipt. A passing recipe is separate from the lead's qualitative review; an observation review must follow the captured result. Downloaded artifacts survive cleanup. Files are limited to 100 MiB each, with at most five retained outputs. An interrupted check is not automatically repeated after restart.

Use **Reported evidence — user review** explicitly for work without an approved captured check. It does not produce a server-attested pass. Mobile can review and save prepared recipes, select profiles, request verification and inspect evidence. Use web or desktop to edit individual recipe fields. Acceptance records a completed result, not ongoing service health or permission to deploy.
