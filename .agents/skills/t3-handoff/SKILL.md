---
name: t3-handoff
description: Hand off ongoing work to an ordinary T3 Code thread, on the current or another connected environment. Use when the user wants another thread or host to take responsibility for the current task, or wants to coordinate work through T3 thread messages.
---

# T3 Handoff

Transfer responsibility for the user's task with enough context for the receiving thread to continue independently. Use the T3 orchestrator MCP tools available to Codex or Claude; this is a task handoff, not full conversation-history migration.

## Find the destination

Call `t3_environment_list`, then `t3_project_list` with the chosen `environmentId`. Call `orchestrator_capabilities` with that `environmentId` and `projectId` to choose an available provider and model. Tool names may have a harness-specific MCP prefix. Resolve an existing thread with `t3_thread_list`, following `nextCursor` as needed, and inspect relevant state with `t3_thread_read`. Pass the destination `environmentId` and `projectId` on thread operations; omitted selectors use the calling thread’s environment and project.

Select the requested connected environment, then its project and an existing thread or a destination for a new one. Keep environment, project, and thread identity together throughout discovery, delivery, and follow-up. Use the destination's capabilities to choose a provider and model: `target.providerInstanceId` identifies a provider within an environment, not the host itself. Resolve destination paths and project records there rather than carrying over source-machine identifiers.

## Pass the work

Write a self-contained message adapted to what the receiver needs: the desired outcome, current verified progress, important decisions, remaining work, and how to tell it is done. Carry forward the user's existing authorization and constraints so the receiver can continue within that scope without asking for the same permission again. PR creation or subagents belong in the handoff when they are part of the user's request, not as default requirements.

For code, include the repository, branch, exact commit, and how the destination can obtain that state. Identify uncommitted changes separately: naming a branch does not transfer them. Include the originating environment and thread as the return contact. The receiving thread should check its actual checkout and available artifacts before relying on the supplied state.

An optional message shape:

> Take ownership of [outcome] on [destination environment/project]. We have [verified progress]; the remaining work is [next outcomes and completion evidence]. Continue within [existing authorization and constraints]. Code is at [repository, branch, commit and availability; any uncommitted work]. Report back to [source environment/thread or agreed destination] with the result or a concrete blocker.

Use a short summary and relevant artifact links rather than copying the transcript. A handoff does not itself transfer code or make source-machine paths accessible remotely.

## Start or message the owner

Use `t3_thread_start` with `prompt` and optional `title` for a new ordinary top-level conversation that will own the task. Pass the selected `environmentId` and `projectId`, with a checkout and provider available at that destination. A new thread is not a separate checkout; arrange isolation when the task needs it.

For an existing owner, pass its `environmentId` and `projectId` and use `t3_thread_send` with `threadId` and `message`. Its default `auto` mode may steer active work; choose `queue` for a separate follow-up turn. Use `restart` only when replacing active work is intended.

`delegate_task` creates a child agent that reports to its parent. Use it for a bounded subtask when the current thread retains ownership, not to represent the new main owner in a handoff. The receiving main thread can delegate its own subtasks when appropriate and authorized.

Use a fresh `clientRequestId` for each mutation and reuse it for retries of that same operation. Preserve the returned thread and run IDs so an uncertain response does not lead to duplicate work.

## Confirm the handoff

Check the returned thread identity and delivery result against the intended destination, then use `t3_thread_read` to verify the message and the receiver's acknowledgment or subsequent work. A send receipt confirms acceptance, not task completion. If acknowledgment is not yet visible, report that distinction instead of claiming responsibility has transferred. Keep the same request ID when retrying an uncertain send.

Cross-environment delivery needs a running T3 client connected to both environments. Once accepted, destination work continues independently of that client. If the route disconnects, reconnect it before follow-up or return delivery; distinguish unavailable delivery from stopped work.

When the result is needed, `t3_thread_wait` can wait for the returned `runId`; each fleet wait is bounded to 120 seconds, and timeout leaves the work running. Repeat the wait when the result is still needed. Read the result afterward, following `nextPosition` when `hasMore` is true and accounting for truncated text. Report where the work now lives, what the receiver has confirmed, and anything still blocking the transfer. Once ownership is confirmed, avoid continuing overlapping changes in the source thread unless coordinated with the new owner.

## CLI fallback

When the MCP tools are unavailable, use the same fleet operations through the local running server: `t3 fleet environments`, then `t3 fleet projects --environment <id>` and `t3 fleet capabilities --environment <id> --project <id>`. Add `--base-dir <T3-home>` when selecting a different local server’s state directory. Results are JSON. Environment selectors accept IDs or unique labels; project selectors accept IDs, unique titles, or destination workspace paths. Prefer IDs after discovery.

For a new owner, use `t3 fleet start --environment <id> --project <id> --file <handoff-file> --client-request-id <stable-id>`, with optional `--title`, `--provider` (provider instance ID), and `--model`. For an existing owner, use `t3 fleet send` with the same destination selectors, `--thread <id>`, and `--file <handoff-file>`; `--mode queue` schedules a separate follow-up. Supply exactly one of `--file`, `--prompt`, or `--message`; `--file -` reads stdin.

Discover with `t3 fleet list` (`--cursor`, `--limit`), confirm with `t3 fleet read --thread <id>` (`--after-position`, `--limit`), and follow with `t3 fleet wait --thread <id> --run <id> --timeout-ms <milliseconds>`. Keep the destination selectors on each command and the same request ID on mutation retries.
