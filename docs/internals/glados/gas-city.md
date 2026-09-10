# Gas City orchestration concept reference

This is a systematic, source-linked inventory for designing T3 GLaDOS and revisiting that design later. It covers **Gas City**, not the distinct Gas Town repository. Gas City was inspected at **36763a969ea31d524386b4dfee514e76a1a731b4**.

The optional Gastown role pack imported by this Gas City checkout was separately inspected at **33d3a430a67d1782ad364556cb566bdb01d0afe3**. Where mentioned, it is a configuration example for Gas City; it does not establish behavior of the Gas Town application.

**Evidence boundary:** static inspection of selected code, configuration, comments, tests and documentation. No server, agent fleet, browser, integration test or production deployment was run. “Implemented” means a concrete implementation was found, not that all paths were executed or proved correct. This is broad coverage of relevant mechanisms, not a claim to have read every line. Negative findings are bounded searches, not mathematical proof of absence.

**Disposition vocabulary:** **MVP** means preserve the invariant in the first useful T3 implementation, preferably through existing T3 machinery; **Later** means valuable but unnecessary to first release; **Reject literal copy** means retain the lesson while avoiding Gas City's particular model or machinery. These are proposed T3 design judgments, not Gas City requirements. Stable IDs should survive edits; append new IDs instead of renumbering.

## Work and acceptance

### GC-001 — Configurable roles, deterministic infrastructure

An agent is configuration: prompt, provider, scope and lifecycle settings. The engine does not need a hardcoded Mayor, reviewer or game developer. The ordinary Mayor prompt uses work, mail and dispatch commands, while server reconciliation owns process lifecycle. [Orientation][B01], [Mayor prompt][B02].

**Tip/caveat:** a persuasive manager prompt is not a reliable scheduler. Conversely, role-agnostic infrastructure does not mean leaderless work ownership: a specific workflow still has owners and dependencies. **T3 / MVP:** make pitboss an ordinary durable T3 conversation with permitted tools and declared responsibility. Keep scheduling, deduplication and lifecycle transitions deterministic. Permit several peer pitbosses; do not bake a mandatory global boss into contracts.

### GC-002 — Durable task identity outlives an agent session

`beads.Bead` stores ID, title, priority, status, assignee, description, metadata and dependencies. Sessions and workflow executions are separately represented, allowing a task to remain after a worker disappears. [Bead model][B03].

**Tip/caveat:** the universal bead representation makes cross-domain queries convenient but moves much meaning into type strings and metadata. A thread title or current conversation summary is a poor replacement for authoritative work identity. **T3 / MVP:** keep task ID distinct from thread, turn and execution-attempt IDs. Reassignment starts another attempt against the same task. Preserve external tracker references and source revision without making an external comment the only durable record of active execution.

### GC-003 — Control completion and work outcome are different facts

The core work formula distinguishes `gc.outcome=pass`, a workflow-control result, from `gc.work_outcome=shipped|no-op|blocked|abandoned`. It asks for commit, branch and verification details when work ships. [Work formula][B04].

**Tip/caveat:** a successful agent process, dispatch or wrapper step is not proof the requested result exists. A blocked task can finish an execution attempt cleanly. **T3 / MVP:** independently represent dispatch accepted, agent finished, result submitted and quality accepted. Exploration can return an artifact or finding rather than a commit; home-server work can return observed service state. Each task's acceptance contract must describe its own meaningful output.

### GC-004 — Machine-checkable work-record close gate

`workrecord.ValidateOnClose` checks a typed outcome and, for shipped work, commit/branch presence and reachability. CLI and HTTP per-bead close/update paths share this package. **It is warn-only by default**; `GC_WORK_RECORD_ENFORCE` enables blocking. Structural/control beads and bulk teardown are deliberately outside this per-task gate. [Gate implementation][B05].

**Tip/caveat:** this corrects an earlier impression that work records were only prompt instructions. The implementation exists, but “shipped” still does not prove subjective quality or every requested verification. **T3 / MVP:** validate result schema at the authoritative completion boundary. Avoid enforcing a coding-only commit rule on exploration, operations or planning tasks.

### GC-005 — Artifact reachability is topology-aware

The work-record package handles local branches and remote-tracking refs because another worktree can push or merge without moving the local branch the validator happens to inspect. Workspace cleanup similarly distinguishes unreachable commits from merely unpushed commits. [Work-record reachability][B05], [worktree ownership][B06].

**Tip/caveat:** “not on this checkout's branch tip” does not mean “lost,” and squash merges complicate naive ancestry checks. **T3 / MVP:** evidence should identify commit, repository/environment and relevant ref, not a bare SHA divorced from its repository. Cleanup must preserve reachable work; quality acceptance and workspace reclamation should remain separate decisions with separately recorded reasons.

### GC-006 — Dependency readiness is derived state

Beads carry dependency edges; formula steps declare `needs`. Ready-work queries exclude blocked work, so workers need not personally remember sequencing. Graph routing separates structural nodes, controller steps and actual worker steps. [Bead dependencies][B03], [graph routing][B07].

**Tip/caveat:** do not infer semantic success from a blocker merely being closed. Outcome propagation must distinguish pass, failure, cancellation and skipped work. **T3 / MVP:** derive runnable tasks from durable dependencies and acceptance state. A pitboss may propose dependencies, but the server validates references/cycles. Display why a task is blocked rather than leaving it indistinguishable from forgotten work.

### GC-007 — Convoys group work without becoming the worker

`ConvoyCreate`, `ConvoyProgress` and membership operations give a batch a stable ID and progress projection. A convoy is a grouping of tracked work; it is not itself an agent session. Formula graph v2 uses an input convoy even for a single tracked item. [Convoy operations][B08], [invocation contract][B09].

**Tip/caveat:** container membership is not automatically a dependency or an authorization scope. **T3 / Later:** a lightweight initiative/batch grouping is useful across a game feature, tools cleanup or household maintenance list. First preserve the distinction between grouping and execution; add a convoy-like abstraction only when several tasks genuinely need common progress and acceptance reporting.

### GC-008 — Source work and workflow execution have separate anchors

Graph v2 stores invocation variables and input convoy identity; source-workflow handling distinguishes the work being addressed from physical workflow roots and attached attempts. Event types separately describe work association and source anchoring. [Invocation][B09], [sling/source-workflow handling][B10], [event types][B11].

**Tip/caveat:** replacing a failed workflow should not manufacture a second unrelated user request. Nor should closing a workflow root silently close every source task. **T3 / MVP:** maintain task → attempts → artifacts relationships explicitly. An external issue, a local task, its execution thread and the latest attempt are related records, not interchangeable IDs.

## Formulas and bounded execution

### GC-009 — Reusable methods compile into durable execution graphs

A formula is a reusable TOML method with variables, steps and dependencies. Compilation produces a recipe; invocation materializes durable work. The running graph can continue independently of the agent that invoked it or the original conversation. [Formula types][B12], [graph invocation][B09].

**Tip/caveat:** changing a recipe file must not silently reinterpret an in-flight execution. Compiler versions and stored invocation information matter for recovery. **T3 / Later:** reusable task recipes can encode diagnosis, implementation and verification. Begin with explicit task stages and a versioned acceptance profile; a general TOML graph compiler is unnecessary for the first pitboss and would add substantial compatibility work.

### GC-010 — Compiler requirements make capability assumptions explicit

Formulas can declare a required compiler version; built-in formulas in this checkout require graph compiler v2. Parsing/validation owns supported shapes, rather than letting arbitrary prompts imply unsupported execution semantics. [Requirements implementation][B13], [core work formula][B04].

**Tip/caveat:** the repository has legacy and graph-v2 representations. Some documented loop syntax is compiled into labels without current runtime re-execution; syntax acceptance alone is not capability proof. **T3 / MVP:** execution requests should declare required capabilities, and an environment must reject unsupported modes clearly. Do not silently degrade a workflow's semantics just because its JSON or configuration parses.

### GC-011 — Fan-out uses recoverable materialization state

`processFanout` distinguishes not-yet-started, spawning and spawned states. It creates children and later resolves their aggregate outcome; spawning means a previous attempt may have created only part of the fragment set. [Fan-out implementation][B14].

**Tip/caveat:** restarting materialization from scratch after a crash risks duplicate workers and duplicated changes. **T3 / MVP:** record dispatch intent and stable child-operation IDs before creating child threads. Recover existing children before making more. The user-facing experience may be simple parallel delegation; its server implementation must account for the failure window between “child created” and “parent recorded child.”

### GC-012 — Drain expands a batch through a durable manifest

Formula drain control maps convoy members to repeated item workflows. Its manifest records members, stable unit keys, child convoys/roots, status and outcome references; state progresses through expansion and completion. A default limit bounds expansion to 100 units. [Drain implementation][B15].

**Tip/caveat:** draining a changing queue is not the same as iterating one frozen batch. The manifest fixes what this expansion means and supports repair. **T3 / Later:** bulk operations should retain an explicit selected task set and per-item receipts. Do not let “fix everything in this project” become unbounded recursive dispatch when another agent keeps adding work.

### GC-013 — Shared context is an explicit workflow choice

Drain state records a context mode; shared-context paths preserve execution residency while isolated units can use separate executions. Graph route bindings also carry an authored continuation group instead of guessing affinity from mutable residue. [Drain][B15], [route binding][B07].

**Tip/caveat:** keeping context can reduce repeated orientation but can couple unrelated work and prevent useful parallelism. A stale continuation marker must not pin a new job accidentally. **T3 / Later:** select same-thread continuation for related bounded follow-ups and independent threads for separable tasks. Store why affinity exists; do not treat worker reuse as universally cheaper or safer.

### GC-014 — Acceptance loops run actual checks

`processRalphCheck` runs an executable check, persists the result, closes the logical step on pass and creates another bounded attempt on failure. Explicit hard failure terminates immediately; reaching `max_attempts` terminates rather than spinning indefinitely. [Check/retry implementation][B16].

**Tip/caveat:** a check is only as meaningful as its assertion. A command that always exits zero can certify nothing. **T3 / MVP:** each automated acceptance step should identify the observable claim, check, result and artifact. Give repairs a clear attempt/time limit; exhausted work returns a blocker and evidence to its owning pitboss, rather than quietly consuming another day's resources.

### GC-015 — Infrastructure failure is different from a failing solution

Ralph checks distinguish a verdict of fail from error/timeout that prevented a verdict. Bounded infrastructure retries avoid immediately spending another work attempt because the test system could not run; persistent infrastructure failure still eventually terminates. [Check infrastructure retry][B16].

**Tip/caveat:** unlimited “transient” classification is another infinite loop. **T3 / MVP:** classify provider unavailability, environment disconnection, missing fixture, test assertion failure and rejected quality separately. Backoff/retry only appropriate classes. A missing browser permission or unavailable target host should produce a coverage/blocker fact, not a fabricated failing implementation or a successful acceptance result.

### GC-016 — Retry control has an explicit terminal policy

Formula retry controls carry attempt counts and a disposition such as hard-fail or soft-fail on exhaustion. Dispatch reconciles enclosing scope outcomes, preventing a terminal child from leaving the containing workflow permanently in progress. [Retry/control implementation][B17], [formula schema][B12].

**Tip/caveat:** soft failure means downstream synthesis may proceed with missing evidence; it does not mean evidence was obtained. **T3 / MVP:** a parent should receive completion, failure, cancellation or missing-result explicitly. Later stages decide whether partial evidence is acceptable. Never represent one failed reviewer as an empty successful review merely to complete a quorum.

### GC-017 — Independent review lanes retain provenance

`mol-review-quorum` fans out two configurable provider/model lanes and requests structured findings, verdicts, evidence, usage and mutation deltas. A synthesis step waits on both lanes. [Review formula][B18].

**Tip/caveat:** the formula explicitly states the Go finalizer is not wired into its synthesis step; synthesis is agent-executed. Read-only prompt instructions plus before/after git status are not sandbox enforcement. **T3 / MVP:** preserve reviewer identity, model, inspected revision and evidence in results. **Later** add multi-reviewer quorum where task risk warrants it; do not require several reviewers for every trivial operation.

### GC-018 — Control steps must not be claimed as user work

`graphroute` recognizes controller-executed kinds and workflow topology nodes separately from agent work. Direct-session routes omit pool routing metadata because an execution already has a concrete destination. [Graph routing][B07].

**Tip/caveat:** allowing the controller and a worker pool to compete for the same step creates duplicate execution or stuck control state. **T3 / MVP:** distinguish server transitions from agent tasks in typed contracts. The server advancing a dependency, creating a child or accepting a receipt is not an LLM assignment; it should not consume an agent turn or appear as an unfinished user task.

## Packaging, project context and workspaces

### GC-019 — Packs combine reusable behavior and operational support

A pack groups agents, formulas, orders, prompt fragments, skills, commands, MCP configuration, doctor checks and assets. The city itself is the root pack. [Pack guide][B19], [pack configuration][B20].

**Tip/caveat:** a pack is executable operational configuration, not merely harmless prose. Composing everything into one import is convenient but makes version and provenance important. **T3 / Later:** reusable project/role bundles can package quality profiles and tool requirements. Reuse existing T3/Codex skill and configuration mechanisms before inventing another plugin system; avoid forcing a home-server task and a game task into one all-powerful default bundle.

### GC-020 — Pin the transitive behavior dependency closure

`packs.lock` records exact resolved commits and versions for remote packs. Source parsing distinguishes clone URL, subpath and ref; a local registry handle is not the durable source another machine should depend on. [Lockfile][B21], [remote-source parser][B22].

**Tip/caveat:** a branch name can move after a task is assigned. Reproduction needs the executed version, not only a friendly package name. **T3 / MVP:** record the policy/recipe revision used by an attempt. **Later** add dependency locks when reusable bundles arrive. External tracker changes should trigger explicit reconciliation rather than changing the active attempt's instructions invisibly.

### GC-021 — Import bindings and overrides require provenance

Pack imports are namespaced; city versus rig imports instantiate different scopes. Configuration has explicit patches and override structures instead of requiring users to copy imported files. [Pack guide][B19], [pack/config implementation][B20].

**Tip/caveat:** short names can collide, and a generated effective configuration can obscure where behavior came from. **T3 / MVP:** show the owner/source of an instruction when it affects delegation or acceptance. Preserve environment-local overrides while keeping shared profiles versioned. **Reject literal copy:** Gas City's naming grammar and patch language are not required; a smaller explicit precedence order is preferable for T3.

### GC-022 — Rig scope is project scope, not automatically a remote host

A rig records a project path, namespace, overrides, formula variables and capacity/suspension configuration. An ordinary city can host several rigs. Current storage-class routing supports layouts more complex than the overview's single-store explanation. [Rig configuration][B23], [bead cross-store references][B03].

**Tip/caveat:** project namespace separation is not filesystem sandboxing and is not proof of cross-machine federation. **T3 / MVP:** always carry both environment ID and project ID/path. A local game checkout, work repository and home-server connection have different destinations and authorization. Never infer the machine from a project label or assume every project lives below the pitboss's own working directory.

### GC-023 — Worktree provisioning has one transactional owner

`worktree.Ensure/Verify` checks requested repository, root path, attached branch and explicit base semantics. Failed creation rolls back what it created; dry-run is observationally pure. [Worktree owner][B06].

**Tip/caveat:** “directory exists” is not proof it is the correct checkout. A failed verification must not authorize clobbering existing state. **T3 / MVP:** use T3's workspace/worktree machinery and record ownership before worker launch. Attach attempt-specific workspace information to the task receipt. **Reject literal copy:** do not replace working T3 Git plumbing with another provisioner just to imitate Gas City's command surface.

### GC-024 — Cleanup needs ownership and attempt fencing

Worktree cleanup distinguishes ownership mismatch, stale provisioning attempt, dirty state, unreachable commits and optional unmerged work. A stale handle belonging to the right owner differs from a path belonging to someone else. [Cleanup error vocabulary and provenance][B06].

**Tip/caveat:** matching a path prefix is not proof of ownership, and “worker finished” is insufficient reason to delete its workspace. **T3 / MVP:** cleanup only resources an identified attempt created and whose retention conditions pass. Preserve artifacts and branches before reclamation. Recovery must reread a newer ownership record rather than letting an old cleanup request remove a replacement worker's files.

### GC-025 — Setup uses progress-aware time budgets

Session configuration separates a normal setup timeout from an optional maximum duration. With activity-aware setup enabled, output can keep a slow but progressing setup alive while an absolute ceiling still bounds total time. [Session setup configuration][B23].

**Tip/caveat:** a noisy hung process can defeat a silence-only timeout; an absolute-only timeout can kill a healthy large checkout. **T3 / Later:** distinguish provisioning progress, provider startup and useful task progress. Apply bounded setup deadlines where remote environments or native builds make launch variable. Do not convert infrastructure preparation into another open-ended LLM repair loop.

### GC-026 — Workspace services have independent local/publication state

`workspacesvc` owns generic workspace service instances with HTTP handling, tick/close lifecycle and status. It distinguishes local service state from publication state, exposes mount/visibility/URL information and supports workflow-backed service contracts. [Service runtime types][B24].

**Tip/caveat:** a running local server is not necessarily reachable by the remote user; publication can fail independently. **T3 / Later:** development previews and home-service checks should report both process health and externally observed reachability. Reuse T3's existing remote/relay mechanisms. Do not let a pitboss say “available” solely because a subprocess started or localhost answered.

## Supervision, pools and ownership

### GC-027 — One machine supervisor can manage multiple cities

The supervisor registry stores cities and globally named rigs, with optional default-city associations. Pending asynchronous city requests retain request IDs until terminal infrastructure results. [Supervisor registry][B25].

**Tip/caveat:** machine-wide registry management is not a consensus system across independent hosts. A registry default must not redirect a command invisibly. **T3 / MVP:** each environment should supervise its own work while peers address it explicitly. Keep operation correlation through asynchronous startup. **Reject literal copy:** a single global Mayor or host registry should not become mandatory for the user's desired peer pitboss federation.

### GC-028 — Awake/asleep reconciliation replaces constant model polling

The session reconciler computes desired wake state from persisted sessions and configuration, then manages runtime transitions. User holds, quarantine and pins affect decisions. Work survives sleeping or restarted sessions. [Session reconciler][B26].

**Tip/caveat:** being asleep can be correct; continuously running a coordinator only to ask “anything new?” wastes resources. **T3 / MVP:** use server events to wake the relevant pitboss when a result, blocker, approval or scheduled obligation changes. The owner can remain a durable thread while its provider process is inactive. An interrupted model turn should not be the sole scheduler for future work.

### GC-029 — Demand-based pools separate role from instances

Pool templates define minimum/maximum active sessions and derive demand from routed work. The role can have zero live workers while retaining queued tasks. [Pool planning][B27], [agent configuration][B23].

**Tip/caveat:** routed but unclaimed work has no assignee; counting only assigned tasks reports zero demand and strands work. **T3 / Later:** allow several interchangeable workers for a capability, but retain explicit task ownership once claimed. A minimal pitboss can dispatch individual threads first. Do not conflate a role profile, worker slot, durable thread and currently running provider session.

### GC-030 — Fair startup budgets prevent accidental starvation

`CreateBudget` distributes a shared creation limit among pool templates, rotates the seed to avoid stable-order starvation, reserves limited floor capacity and refunds failed creations. Claims are synchronized. [Fair-share create budget][B27].

**Tip/caveat:** a global cap alone can let the first project consume every slot; refunds must occur exactly once. **T3 / MVP:** bound aggregate concurrency across work, exploration and tools, and make priority allocation visible. **Later** add explicit fair-share reservations if one portfolio area starves another. A fixed cheap-worker pool is not useful if high-priority work cannot obtain any capacity.

### GC-031 — Capacity has several different dimensions

Configuration contains workspace-, rig- and agent-level active-session caps, per-tick wake limits and order dispatch limits. These control different sources of load. [Configuration][B23].

**Tip/caveat:** concurrency is not a dollar budget; a single long-running expensive agent can exceed expectations under a one-session cap. A startup burst can overload an environment even when steady-state concurrency is acceptable. **T3 / MVP:** distinguish maximum active attempts, launch rate, repair attempts and time budget. Report the specific limit blocking a task. Defer sophisticated quota accounting, but do not label these mechanisms interchangeable.

### GC-032 — Stable worker identity differs from a reusable slot name

The hook claim identity chooses a configured alias when present, otherwise stable session bead ID before runtime/agent-name fallbacks. Source comments document reused pool-slot names making dead work appear owned by a later occupant. [Identity selection][B28].

**Tip/caveat:** a stable conversation alias may intentionally survive a session, while ownership of one attempt must not. **T3 / MVP:** carry environment, durable thread, run/attempt and provider incarnation separately. Use cosmetic names for display and explicit IDs for routing. A returned worker result must identify the attempt it answers; the latest occupant of a named role cannot silently inherit authority over old work.

### GC-033 — Claims are atomic ownership transitions

The ordinary bd path calls native `bd update --claim`, classifies a lost race separately from error and rechecks canonical ownership. SQLite claims transactionally and treats a same-owner reclaim as a no-op. A separate `ClaimExact` primitive adds revision/generation preconditions; no production caller was found in the bounded search. [bd claim][B29], [SQLite claim][B30], [exact primitive][B31].

**Tip/caveat:** do not advertise the stronger unused primitive as the generic claim path. **T3 / MVP:** atomic task claim plus attempt fencing is essential when peers or retries compete. A task-list read followed by an unconditional assignment is not sufficient.

### GC-034 — Claim validity includes the live invocation window

Hook claim code refuses non-turn provider callbacks and stale/dormant session incarnations. Events describe a claim window expiring before mutation and compensating release when a won claim cannot be delivered through the requesting tool pipe. [Hook claim][B32], [compensation events][B11].

**Tip/caveat:** a callback is not necessarily a model turn; winning ownership after the consumer vanished creates work nobody will execute. Some session-fence store faults deliberately fail open. **T3 / MVP:** accepting a dispatch, claiming an attempt and successfully delivering its instructions are separate steps. Release or recover ownership when delivery fails; do not leave an invisible in-progress task.

### GC-035 — Heartbeat must extend the actual lease

`gc bd heartbeat` delegates to native bd heartbeat, which extends the claim lease and reports lost ownership. Source comments describe the previous bug: writing an unused heartbeat timestamp looked successful while the actual lease expired. [Heartbeat wrapper][B33].

**Tip/caveat:** this is evidence of the bd-backed contract, not proof every store has identical lease semantics. A healthy process can still be making no useful progress. **T3 / MVP:** distinguish provider liveness, valid task ownership and work progress. Renew only the lease the server checks, and reject stale result/renewal requests using the attempt token.

### GC-036 — Drain is an explicit lifecycle acknowledgement

Workers use `gc hook --claim --drain-ack --json`: work returns a bead ID; no eligible work can acknowledge session drain. Store errors are deliberately not converted into no-work/drain results. [Claim protocol prompt][B34], [claim loop][B28].

**Tip/caveat:** “empty query,” “failed query,” “waiting on dependency” and “finished responsibility” require different behavior. **T3 / MVP:** return typed states rather than a vaguely empty task list. A pitboss should not declare a portfolio complete because one environment is temporarily unreachable. Worker shutdown should follow recorded state, preserving queued work and unresolved obligations.

## Routing and agent communication

### GC-037 — Sling composes validation, routing and optional wake

Sling preflights suspended targets, disabled pools, dependency cycles, existing assignment and formula attachment. Re-slinging an already routed item can be an idempotent no-op while an explicitly requested nudge still occurs. [Sling core][B10].

**Tip/caveat:** route deduplication and notification deduplication are different. A worker may have missed its wake even though routing succeeded. **T3 / MVP:** make task dispatch return the existing attempt when the same operation is retried; permit a separate wake/recovery request. Keep durable assignment authoritative rather than stuffing the only copy of the task into a chat message.

### GC-038 — Workflow replacement needs rollback and launch correlation

Source-workflow sling handling searches existing roots, coordinates source-workflow launch and can restore prior state after a replacement failure. It treats partial visibility and concurrent launch as explicit concerns. [Source-workflow launch handling][B10].

**Tip/caveat:** “restart this task” can otherwise launch a second writer while the first still runs. **T3 / MVP:** define restart, retry, supersede and cancel separately. Use caller operation IDs and the current attempt revision when replacing work. A new instruction from the user should either amend the current attempt explicitly or start a fenced replacement, not race silently with old instructions.

### GC-039 — Mail payload is persisted before notification

Built-in Send creates a message bead; CLI send emits its event and then tries notification. Nudge failure does not undo the mail or make successful storage fail. **Send has no caller idempotency key**, so retries can create duplicate messages and fresh threads. Mail is stored as an ephemeral wisp. [Mail storage][B35], [CLI send ordering][B36].

**Tip/caveat:** persisted does not mean retained forever. **T3 / MVP:** persist a task/result envelope before notifying a peer, with a caller operation key and stable correlation. Reuse T3 thread transport where possible; a second generic mailbox is optional, but its durability semantics must be explicit.

### GC-040 — Notifications are hints to retrieve authoritative state

Mail notifications say “You have mail from …”; live delivery waits for an idle boundary, otherwise a deferred nudge may request managed wake. Hook mail checks expose summaries and direct the agent to fetch full messages. [Notification delivery][B37], [mail check][B36].

**Tip/caveat:** a truncated notification must not be the sole task specification. Notifications can arrive late, twice or after replacement. **T3 / MVP:** wake payloads should carry task/attempt IDs and a reason; the receiver resolves current authoritative instructions and verifies ownership. Avoid repeatedly injecting full transcripts or project-wide context into every status notification.

### GC-041 — Deferred notification queues have leases and terminal states

The nudge queue persists pending, in-flight and dead items with IDs, deadlines, attempts, session IDs and continuation epochs. Its authoritative file is atomically rewritten under a lock; bead shadows support inspection. Same-ID enqueue deduplicates, and matching source/reference can supersede prior items. [Queue state][B38], [enqueue/ack implementation][B37].

**Tip/caveat:** already in-flight superseded delivery may still happen once; ordinary mail sends do not automatically get end-to-end deduplication. **T3 / MVP:** an outbox/retry queue must tolerate replays. **Reject literal copy:** reuse T3's durable event/outbox machinery rather than maintaining an additional JSON authority beside SQLite.

### GC-042 — Transport acknowledgement is not semantic acceptance

Nudge completion names boundaries such as `accepted_for_injection`/`hook-transport-accepted` and `injected`/`provider-nudge-return`. Mail Read records a read flag, not comprehension, claim or successful work. [Nudge acknowledgements][B37], [mail interface][B39].

**Tip/caveat:** an agent can crash after transport success and before acting. **T3 / MVP:** separately record server accepted, notification delivered, worker claimed, result submitted and quality accepted. A peer's natural-language “got it” should not be the only claim record. Result acknowledgement likewise means stored/received until a verifier or owning pitboss accepts the requested outcome.

### GC-043 — Mail routing separates display identity and reply identity

Sender resolution stores a stable session ID and display name. Reply prefers the recorded sender session ID, preserves thread identity and records reply-to. Inbox lookup handles current, closed and historical aliases; cached topology can lag. [Mail identity/reply implementation][B35].

**Tip/caveat:** aliases can be ambiguous, and a long-lived role can outlive one provider session. **T3 / MVP:** use durable environment/thread identity for peer address and attempt identity for one assignment. Keep sender/recipient display names as metadata. A reply to an old result must resolve its original task context, not whichever agent currently happens to have the same nickname.

### GC-044 — Durable waits replace conversational polling

`session.WaitInfo` persists dependency IDs, all/any mode, state, expiry, registered continuation epoch, delivery attempt and nudge ID. Terminal states include closed, canceled, expired and failed. [Wait domain][B40].

**Tip/caveat:** a wake belongs to the continuation that registered it; blindly replaying it into a new session can resume obsolete work. **T3 / MVP:** subscribe the owning task/pitboss to completion or explicit external conditions in server state. Support cancel/unsubscribe and explain why a wait ended. Add probes or complex all/any graphs later, while preserving identity and expiry now.

## Orders, prompts and handoff

### GC-045 — Scheduled work is triggered without a continuously thinking agent

Orders evaluate cooldown, cron, condition-command and event triggers; manual operation is also supported. Condition subprocesses have explicit deadlines and cancellation propagation. [Order triggers][B41].

**Tip/caveat:** cooldown and wall-clock schedule have different semantics; clock changes and time zones matter. **T3 / MVP:** reuse existing scheduled-task machinery for periodic obligations, but create a durable task/attempt and acceptance requirement when a schedule fires. “Scheduled dispatch succeeded” must not be displayed as “backup verified” or “home server maintained.”

### GC-046 — Event-triggered automation needs durable cursors

Order event checks examine events after a cursor, and order dispatch has tracking/retention machinery. The trigger is an input to execution, not the completed result. [Trigger cursor implementation][B41], [order dispatch][B42].

**Tip/caveat:** advancing a cursor before durable dispatch can drop work; never advancing it can repeatedly create work. Notification delivery is not the transactional result boundary. **T3 / MVP:** retain event/operation correlation and idempotent dispatch. **Later** add arbitrary user-authored event rules; first support a small set of concrete wakes such as child completion, due task and requested approval.

### GC-047 — Prime constructs role/session context through a central path

`gc prime` resolves the configured agent and prompt template, composes fragments and session context, and supports provider hook formats, strict behavior and JSON inspection. Missing template and unmanaged-session handling are explicit. [Prime command][B43].

**Tip/caveat:** configuration existing on disk does not prove it reached the model. Different providers and launch paths can deliver context differently. **T3 / MVP:** build a bounded context envelope at provider-turn startup from task, policy and environment facts. Record the version/source of what was injected, and test all supported launch paths instead of assuming a chat message equals system context.

### GC-048 — Prompt delivery itself has a measurable budget

Prime's strict path reports a prompt-delivery budget decision based on prompt, agent/provider and session transport. JSON inspection avoids consuming handoff state simply to preview content. [Prime budget/preview code][B43].

**Tip/caveat:** a large, correct prompt can fail at transport or exceed practical context. Inspection should not mutate the thing it examines. **T3 / MVP:** bound routinely injected policy and summaries, retain links to detailed source, and make context assembly observable. **Later** add sophisticated token estimation; first avoid duplicating the entire conversation or every project document on each wake.

### GC-049 — Handoff persists context before a provider restart

The manager prompt exposes handoff as self-mail plus restart, and auto-handoff injection retains durable mail for recovery. Auto-handoff cleanup marks read and closes with a special retention reason instead of permanently deleting immediately after stdout accepts content. [Mayor handoff][B02], [handoff retention][B35].

**Tip/caveat:** successful injection does not prove consumption. A summary also cannot replace the task ledger or reconstruct omitted artifacts. **T3 / MVP:** checkpoint current task state, decisions, next action and blockers durably before resetting context. Keep the owner thread and work records continuous even if a fresh provider session does the next turn.

### GC-050 — Context-pressure guidance is thresholded, not constant

`context_inject.go` reads recent provider usage and emits nothing below an advisory threshold. Defaults advise a clean handoff near 60% and request it near 80%; model-window detection and explicit override determine the estimate. Parse/read failure is silent. [Context pressure injection][B44].

**Tip/caveat:** the source deliberately avoids an always-visible countdown that can induce premature wrap-up. The estimator is provider-transcript-specific. **T3 / Later:** use available context pressure to suggest a safe checkpoint, without making agents panic-stop. Preserve durable work first; do not require this heuristic for correctness or treat token estimates as exact measurements.

## Provider choice and authority

### GC-051 — Provider harness and runtime transport are separate axes

Runtime interfaces own lifecycle, attach and optional capabilities; model-provider configuration describes harness command/options. Different backends can report unsupported interaction or relaunch distinctly. Gas City's examples include tmux, subprocess, ACP and T3 bridge paths. [Runtime contract][B45], [provider configuration][B46].

**Tip/caveat:** one provider's hook, pending-input or warm-relaunch behavior cannot be assumed for all. **T3 / MVP:** use existing provider adapters and expose explicit capabilities to the pitboss. A task requiring screenshots, a particular permission mode or model must be dispatched only to a compatible environment/provider, or return a specific unsupported result.

### GC-052 — Model/effort routing is configurable, not a default price hierarchy

Provider-option defaults merge schema → provider → agent; launch can apply validated work `opt_model`/`opt_effort`, with explicit session overrides winning per key. [Option merge][B47], [launch overrides][B48].

**Tip/caveat:** `[agent_defaults].model` is parsed but explicitly not automatically applied at runtime. Inspected Gastown role defaults do not prescribe expensive coordinators and cheap workers. **T3 / MVP:** start with explicit role profiles and task overrides; record selected provider/model/effort. Escalating a failed cheap-worker task is a policy we would design, not a behavior established by Gas City's default configuration.

### GC-053 — Configuration fingerprints distinguish launch from provisioning

Prepared session start computes core/live and provisioning/launch fingerprints before one-shot task overrides. A changed launch setting can restart the agent in a warm environment where supported, while a provisioning change needs more work. [Launch preparation][B48], [runtime errors/capabilities][B45].

**Tip/caveat:** treating task-specific model choice as permanent config drift can create needless restart loops. **T3 / Later:** distinguish environment preparation from provider session configuration and current-task input. Reuse an existing environment when safe, but do not let cached credentials, stale working directories or previous task overrides leak into a new attempt unnoticed.

### GC-054 — Credentials can be requested for a specific audience and scope

The credential-provider protocol uses direct argv execution, bounded helper time/output and requests with audience, scopes, organization and refresh intent. Returned credentials include expiry and scope metadata; errors avoid exposing secrets. [Credential provider][B49].

**Tip/caveat:** credential availability is not authorization for every task a coordinator can imagine. **T3 / MVP:** carry approved environment/tool authority with task dispatch, using existing credentials locally. **Later** add delegated scoped credentials if cross-host automation requires them. Do not send tokens through chat, task summaries or peer mailbox payloads; send references to environment-owned capabilities.

### GC-055 — Remote mutation grants bind permission to one request

`clientgrant.GrantSource` mints single-use grants tied to city, method, path, canonical query and body digest; it intentionally does not cache grants. A retry requires a fresh authorization token. [Request-bound grant implementation][B50].

**Tip/caveat:** request authorization and request idempotency are separate: a newly authorized retry must still not duplicate an operation. **T3 / Later:** fine-grained grants may help high-impact remote operations. **MVP invariant:** each destination environment validates caller capability and task scope. Avoid imposing cryptographic per-request grant machinery on ordinary already-authorized local development without a demonstrated need.

## Recovery and human control

### GC-056 — Startup recovery repairs explicit partial states

The convergence reconciler examines interrupted durable states, adopts existing wisps, repairs missing links or finishes terminal transitions instead of blindly restarting every workflow. It records per-item recovery/error results and continues scanning. [Convergence recovery][B51].

**Tip/caveat:** a single damaged task should not hide healthy recoverable work, but partial recovery must remain visible. **T3 / MVP:** on restart reconcile dispatch intents, active attempts, child threads and pending receipts. A server reboot should restore responsibility without needing the user to reconstruct the plan, while ambiguous side effects should remain explicitly unresolved until checked.

### GC-057 — Unknown liveness is not proof of death

Runtime errors distinguish nonexistent session, initialization, total runtime unavailability and partial observations. The contract tells destructive reconciliation to defer when liveness cannot be observed. [Runtime observation contract][B45].

**Tip/caveat:** network or runtime failure returning an empty list must not cause mass orphan cleanup or duplicate restarts. **T3 / MVP:** represent connected, disconnected, unknown and confirmed terminal separately. Keep last-known-good state with freshness. A leaderless peer system especially needs this distinction: silence is not permission for another peer to take over a task without fencing the prior attempt.

### GC-058 — Restart limits and quarantine prevent self-inflicted storms

Configuration includes restart windows, maximum restarts, named-session circuit-breaker overrides and maximum wake starts per tick. Session state carries circuit information and quarantine can block wake decisions. [Daemon limits][B23], [circuit state][B52], [reconciler][B26].

**Tip/caveat:** “keep it running” without a budget can churn credentials, load and model spend. **T3 / MVP:** bound automatic retries/restarts and surface a stable blocked reason after exhaustion. A user resume can explicitly clear the condition. Do not reset the retry counter just because a replacement thread received a new ID.

### GC-059 — Suspension is a reversible persisted preference

City and rig runtime suspension overrides are tri-state: absent follows authored startup default, true explicitly suspends, false explicitly resumes even across restart. The state is per-clone rather than committed shared policy. Agent override schema is reserved but not wired in this package. [Suspension state][B53].

**Tip/caveat:** distinguish startup defaults from the user's current pause choice, and do not assume every scope has the same implementation. **T3 / MVP:** pause/resume at task or portfolio scope must survive reconnect and explain which work it affects. Paused should not look failed, completed or merely disconnected.

### GC-060 — A failing substrate needs an independent distress channel

`emergency` writes bounded structured records to a Dolt-independent spool with severity, actor, referenced bead, source process/host and metadata. It also has notification-deduplication support. [Emergency spool][B54].

**Tip/caveat:** storing “database broken” only in the broken database loses the one fact the operator needs. This is an operational fallback, not a second task authority. **T3 / MVP:** expose durable-enough startup/storage failures through logs and connection status even when ordinary receipts cannot be written. **Later** add a separate incident spool if actual reliability needs justify it.

## Observation, storage and external surfaces

### GC-061 — Events are observational, not the sole task authority

Gas City's events package reports lifecycle activity, while agent messages/tool calls come from provider session logs. Event recording is described as best-effort; event consumers can also drive orders, so observation and recovery require careful boundaries. [Event implementation][B11].

**Tip/caveat:** this differs materially from T3's event-sourced authoritative orchestration. **Reject literal copy:** do not replace T3's durable events with a best-effort bus. **MVP:** reuse existing commands/events/projectors and treat peer notifications as projections of authoritative state. A missing observational event must not erase task ownership or prevent the owner from discovering a stored result.

### GC-062 — Projections must handle compensating transitions

A claim may emit execution-step-started and then release ownership when the tool consumer is gone. Event comments explicitly call this a compensating pair, not an execution that ran and completed. `runproj` folds lifecycle data into run views. [Compensation semantics][B11], [run projector][B55].

**Tip/caveat:** a naive monotonic status UI leaves the task in progress forever or counts nonexistent work as executed. **T3 / MVP:** define attempt transitions and compensation explicitly. Derive user-visible status from durable current facts and receipts; distinguish allocated, delivered and actually started if those events are different in the provider path.

### GC-063 — Export correlation without exporting every prompt

`eventfeed.MuxSource` multiplexes city event providers, periodically refreshes the source set and resumes from acknowledged per-city cursors. Its projection forwards a closed set of identity/topology fields and deliberately excludes free-form payload/message content. [Event export adapter][B56].

**Tip/caveat:** a new city's feed begins at its head rather than backfilling all history in this path. **T3 / MVP:** cross-environment summaries should carry relevant task state and links, not stream every token centrally. **Later** add aggregate event feeds with explicit cursor/backfill behavior. This helps performance and keeps unrelated work/home context out of every peer.

### GC-064 — Usage is measured separately from price and limits

Usage facts record run/session/step correlation, token counts or runtime wall time, an idempotency key and estimated cost. Unknown pricing is marked unpriced rather than treated as free. Sink recording is best-effort with surfaced errors. [Usage contract][B57].

**Tip/caveat:** no global enforced dollar/token spending cap was found in inspected configuration and targeted searches. A list-price estimate is not a subscription charge. **T3 / MVP:** retain measurable usage and time with attempts, clearly label estimates. **Later** enforce aggregate budgets once accounting is dependable; first use concurrency, time and repair limits honestly.

### GC-065 — Retention differs by data class

Beads distinguish durable, ephemeral wisp and durable-no-history storage. Mail read state supports retention sweeps, while auto-handoff retention preserves addressability after injection until purge. Storage health measures disk size and retained-row counts with an explicit “rows measured” flag. [Bead tiers][B03], [mail retention][B35], [store health][B58].

**Tip/caveat:** an empty measurement is not zero usage; notifications and accepted work evidence need different retention. **T3 / MVP:** retain task outcomes, decisions and evidence references independently of transient progress chatter. **Later** prune repetitive logs and old notifications without destroying the provenance needed to explain why a task was accepted.

### GC-066 — Remote control exists, but local/remote parity is incomplete

Remote sling forwards parameters to a destination control plane that resolves its own configuration/store. At this SHA it explicitly refuses inline text, one-argument local inference, `--dry-run`, `--nudge` and `--on`, including a documented container-expansion mismatch. [Remote sling][B59].

**Tip/caveat:** an HTTP endpoint existing does not establish full federation or feature parity. **T3 / MVP:** destination-authoritative project/workspace resolution and explicit capability negotiation are essential. Preserve the existing T3 multi-environment path; document unsupported operations. Do not route through a foreground-only client if work must continue when the user's browser or mobile app disconnects.

### GC-067 — External conversations can bind to durable agent responsibility

The `extmsg` package defines provider-neutral conversation identities, scoped callers, inbound dedup keys and conversation-to-session or conversation-to-agent bindings. Agent bindings defer concrete session selection to delivery time; session bindings can re-resolve across respawn. [External messaging domain][B60].

**Tip/caveat:** this is Phase 1 infrastructure, not proof every external chat provider or peer topology is integrated. Its own session-name continuity differs from claim identity. **T3 / Later:** bridge chosen chat surfaces to an existing pitboss responsibility. **MVP invariant:** keep conversation routing distinct from authority over a specific task attempt; reconnecting the conversation must not silently reassign old work.

### GC-068 — Reliability should be tested at boundaries, not inferred from names

The checkout contains focused tests for claim races, idempotent sling, partial store reads, interrupted graph spawning, nudge acknowledgement, prompt delivery budgets and runtime lifecycle. Compiler-v2 tests serialize global feature-flag mutation. [Claim tests][B61], [sling tests][B62], [formula test support][B63].

**Tip/caveat:** this inventory did not run them; test-file presence is not a passing result or proof of complete integration. **T3 / MVP:** test persisted retry, duplicate message, crash-after-dispatch, lost connection, stale attempt result, rejected acceptance and cancelled wait. Prefer the smallest meaningful deterministic tests over broad mock callback wiring or restarting whole environments for every assertion.

## Coverage and disagreement ledger

The [source inventory and inspection manifest](gas-city-source-inventory.md) maps all 63 pinned references to their concept IDs, identifies reference-only/contract-only material and lists package areas not independently audited. Every linked path was verified against the pinned Git tree.

| Area                                    | Inspection level                                                      | What supports the entries                                                                                | What remains unverified                                                                       |
| --------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Work, sling, mail, nudge, claims, waits | Selected implementations read in detail                               | Bead model; mail storage/API; send ordering; queue state; hook claim; native bd wrapper; wait projection | External bd implementation, every storage provider, end-to-end delivery under process failure |
| Formula execution                       | Selected control implementations and shipped formula read             | Ralph, retry, fanout, drain, graph routing/invocation, review-quorum and work-record validation          | Every formula construct/version, live graph scheduler, all arbitrary user formulas            |
| Supervisor and pools                    | Interfaces, planning code, configuration and reconciler sections read | Registry, wake/sleep model, fair-share budget, startup options, runtime error vocabulary                 | Full controller performance, every recovery branch, cross-machine coordination                |
| Context and providers                   | Selected production launch/prime paths read                           | Prime composition/budget, handoff behavior, context-pressure reader, option merge and launch override    | Exact prompt observed by each provider, runtime model switching, every hook format            |
| Packages/projects/services              | Configuration and key owners read; guide used for navigation          | Pack/lock/source definitions, worktree owner, service types, rig config                                  | Complete import lifecycle, every support asset, deployed service publication                  |
| Storage/observability                   | Domain contracts and selected projections read                        | Retention code, store health, event types, run projection, export adapter, usage facts                   | Long-running storage growth, exporter delivery guarantees, billing accuracy                   |
| Credentials/remote/extmsg               | Contract and selected implementation read                             | Credential runner, request-bound grants, remote sling refusals, external conversation types              | Production identity-provider integration, all external transports, complete permission audit  |
| Tests                                   | Targeted files/structure inspected; not executed                      | Existing tests identify boundary cases and some implementation assumptions                               | Passing status, coverage percentage, stress/soak behavior                                     |
| Optional Gastown pack                   | Exact imported SHA read in earlier investigation                      | Role TOMLs, Mayor delegation prompt and planning/review recipe                                           | Distinct Gas Town repository behavior; not used as evidence for this catalog                  |

Important disagreements and scope corrections:

1. **Universal store narrative versus current topology.** The orientation describes rigs sharing one store and isolation by prefix. Current class-binding/cross-store code explicitly supports separate storage owners and weak cross-store parent references. Treat the narrative as simplified orientation, not a database topology guarantee (GC-002, GC-022).
2. **Events are described both as observation and inputs to orders.** The orientation's “not consumed by primitives” framing is immediately qualified by event-triggered orders. Actual trigger code reads cursors. T3 should preserve its own authoritative event sourcing, not infer stronger delivery from Gas City's event prose (GC-046, GC-061).
3. **Work records are more than a prompt, but enforcement is opt-in.** The close gate is implemented across per-bead CLI/HTTP entry points, warn-only by default, with structural/bulk exclusions (GC-004).
4. **Mail archive comments disagree.** Interface prose mentions eager deletion; actual Archive closes; direct-ID mail operations reject closed user-archived messages unless the special system-retention reason is present. Do not promise arbitrary post-archive mail retrieval based on the nearby comment. Underlying row retention and mailbox visibility differ (GC-039, GC-065).
5. **Review quorum is not a wired Go-enforced acceptance finalizer.** The shipped formula explicitly discloses agent-executed synthesis and an unwired finalizer (GC-017).
6. **Configuration presence is not runtime capability.** `agent_defaults.model` is not automatically applied, some legacy/until-loop labels are not actively re-executed, and agent entries in runtime suspension state are reserved rather than wired here (GC-010, GC-052, GC-059).
7. **Exact claim primitive is not the observed generic claim path.** A stronger generation/revision helper exists, but the hook path inspected uses backend claim operations; no production call to `ClaimExact` was found (GC-033).
8. **Remote command parity is explicitly incomplete.** Specific remote sling modes fail clearly rather than silently mimicking incompatible local semantics (GC-066).
9. **Cheap-worker cascade is a policy opportunity, not a verified default.** The optional role pack delegates to preserve coordination context without explicit expensive/cheap role models. Usage estimates likewise do not establish budget enforcement (GC-052, GC-064).

## How to use this reference during iteration

For each proposed pitboss behavior, choose the invariant before the implementation. A first delegation path should be explainable through GC-002/003/008 (work identity and result), GC-032–038 (ownership and dispatch), GC-039–044 (delivery and wake) and GC-056–062 (recovery and truthful status). Context comes from GC-047–050; environment and authority from GC-022–026 and GC-051–055. Only then consider richer workflow/pack/pool machinery.

The highest-value boundary scenario is: **a peer receives a task, dispatches a worker, loses its connection before recording success, restarts, receives a duplicate instruction and later receives the old worker's result.** The design should preserve one authoritative task, identify every attempt, avoid two writers, recover stored artifacts and distinguish submitted from accepted. No role prompt, mailbox convention, notification receipt or friendly status label alone solves that scenario.

The catalog is deliberately broader than the MVP. “Later” concepts remain useful reference material; “Reject literal copy” means avoid transplanting machinery whose constraint T3 already solves differently. Revisit dispositions with evidence from actual user work across tools, game development, exploration and home operations rather than treating a comprehensive catalog as an implementation backlog.

## Pinned source index

All source links below pin the inspected Gas City commit; link labels in entries identify the relevant function or concept. Large files are intentionally linked without a guessed line anchor.

[B01]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/docs/getting-started/how-gas-city-works.md
[B02]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/cmd/gc/prompts/mayor.md
[B03]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/beads/beads.go
[B04]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/bootstrap/packs/core/formulas/mol-do-work.toml
[B05]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/workrecord/gate.go
[B06]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/worktree/worktree.go
[B07]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/graphroute/graphroute.go
[B08]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/convoy/convoy.go
[B09]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/graphv2/invocation.go
[B10]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/sling/sling_core.go
[B11]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/events/events.go
[B12]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/formula/types.go
[B13]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/formula/requirements.go
[B14]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/dispatch/fanout.go
[B15]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/dispatch/drain.go
[B16]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/dispatch/ralph.go
[B17]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/dispatch/control.go
[B18]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/bootstrap/packs/core/formulas/mol-review-quorum.toml
[B19]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/docs/guides/understanding-packs.md
[B20]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/config/pack.go
[B21]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/packman/lockfile.go
[B22]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/remotesource/remotesource.go
[B23]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/config/config.go
[B24]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/workspacesvc/types.go
[B25]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/supervisor/registry.go
[B26]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/cmd/gc/session_reconciler.go
[B27]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/poolplan/create_budget.go
[B28]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/cmd/gc/cmd_hook.go
[B29]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/beads/bdstore.go
[B30]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/beads/sqlite_store_claim.go
[B31]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/molecule/claim_exact.go
[B32]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/cmd/gc/cmd_hook_claim.go
[B33]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/cmd/gc/cmd_bd.go
[B34]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/bootstrap/packs/core/template-fragments/claim-protocol.template.md
[B35]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/mail/beadmail/beadmail.go
[B36]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/cmd/gc/cmd_mail.go
[B37]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/cmd/gc/cmd_nudge.go
[B38]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/nudgequeue/state.go
[B39]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/mail/mail.go
[B40]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/session/waits.go
[B41]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/orders/triggers.go
[B42]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/cmd/gc/order_dispatch.go
[B43]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/cmd/gc/cmd_prime.go
[B44]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/cmd/gc/context_inject.go
[B45]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/runtime/runtime.go
[B46]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/config/provider.go
[B47]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/config/options.go
[B48]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/cmd/gc/session_lifecycle_parallel.go
[B49]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/credentialprovider/credentialprovider.go
[B50]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/clientgrant/clientgrant.go
[B51]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/convergence/reconcile.go
[B52]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/session/circuit_state.go
[B53]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/suspensionstate/suspensionstate.go
[B54]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/emergency/emergency.go
[B55]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/runproj/projector.go
[B56]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/eventfeed/muxsource.go
[B57]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/usage/usage.go
[B58]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/storehealth/storehealth.go
[B59]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/cmd/gc/sling_remote.go
[B60]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/extmsg/types.go
[B61]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/cmd/gc/cmd_hook_claim_test.go
[B62]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/sling/sling_core_test.go
[B63]: https://github.com/gastownhall/gascity/blob/36763a969ea31d524386b4dfee514e76a1a731b4/internal/formulatest/v2.go
