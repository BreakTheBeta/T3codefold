# pstack concept reference for the T3 GLaDOS

Research snapshot: 2026-09-10. Official source: `cursor/plugins`, commit `7366ac128bdf95f45e6734f412b49a4031800169`. This catalog is a reusable concept reference, not installed instructions and not a claim that any prototype has been run. It precedes MVP selection. See [current scope](scope.md).

The user supplied the complete text of _The Complete Guide to pstack_ Parts 1 and 2. Article-specific claims below refer to that supplied text. Their productivity figures, production-quality claims, and model-superiority claims are not independently established. Official source now contains substantial additional orchestration and automation material, so earlier notes describing pstack mostly as methods and verification are incomplete for this snapshot.

**Coverage boundary.** Every tracked path under the official `pstack/` subtree was inventoried. Every top-level skill and playbook was inspected through its description and workflow headings; all principles and the core verification, orchestration, delivery, reflection, automation, and helper paths discussed in detail received additional body/code inspection. The manifest distinguishes inventory coverage from this deeper inspection. This is not a line-by-line audit of every reference, test, image, or guide paragraph. No plugin installation, source helper execution, cloud delegation, live application verification, or external write was performed. External skill files were read as data, not adopted as instructions. The fictional Atlas example has no runnable control CLI.

**How to use this reference.** Stable `PS-###` IDs identify reusable concepts. Mechanism describes the source; T3 application is our proposed adaptation. Dispositions mean **MVP** (use in the first design, sometimes only as a constraint), **Later** (a candidate after the basic loop), or **Selective** (use only when the task warrants it). A disposition is not authorization or a promise to implement all of it. Explicit rejection notes prevent importing mismatched assumptions. The application remains provider-agnostic and leaderless between environments; pstack’s program hierarchy does not replace that requirement.

## Core concept catalog

### PS-001 — A persistent method router

**Mechanism.** A sticky mode matches a task to a playbook, loads referenced skills at the relevant step, and carries the working method across turns. The current catalog distinguishes one task, an ambitious bespoke run, and a standing program. Its todo instructions keep explicit skipped steps rather than silently dropping inconvenient work.

**T3 application.** Give each T3 assignment a method identifier and version. Inject the relevant short recipe, not the entire catalog, on start and resume. The elected role persists in T3 independently of this method.

**Tips and limits.** These are prompt instructions in a particular harness. They do not enforce task state or confer authority to open PRs, message others, or merge.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/SKILL.md).

### PS-002 — Role-based model routing

**Mechanism.** Setup detects available models and writes per-role choices into an always-applied rule. Panel roles can have several models; omitted roles retain defaults; inherit-parent/auto omit explicit selection. The mode separates judgment and hard implementation from fast mechanical code.

**T3 application.** Configure pitboss, worker, reviewer, and verification roles by capability and budget. Resolve them through T3 provider capabilities at dispatch; record the actual model selected and any fallback.

**Tips and limits.** Published model names are snapshot-specific. A cheap model is suitable because the assignment and check are tractable, not because every implementation task is easy.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/setup-pstack/SKILL.md).

### PS-003 — Restate intent before solving

**Mechanism.** The small bro skill simplifies an overcomplicated explanation. In the supplied Part 2 article, the related indirect-prompt technique asks an agent to restate a noisy report before fixing it, separating the desired outcome from an assumed solution.

**T3 application.** The pitboss forms a plain-language outcome, observations, hypotheses, and unknowns before delegating. Routine restatement can proceed under approved priorities; consequential product ambiguity comes back to the user.

**Tips and limits.** A convincing paraphrase is not a reproduction or evidence of understanding. Bro itself is only a restatement instruction, not a task-intake implementation.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/bro/SKILL.md).

### PS-004 — Ground runtime mechanics

**Mechanism.** How separates source exploration from explanation, with explorer and explainer reference prompts. For larger systems, scoped explorers trace runtime behavior and return evidence for a coherent explanation. Smaller questions should not pay for a whole tree.

**T3 application.** Build assignment context from concrete entry points, ownership, state transitions, and failure paths. Cheap explorers can gather bounded facts while the pitboss integrates them into a worker brief.

**Tips and limits.** Source reading establishes mechanisms; it does not establish production frequency, historical rationale, or that a proposed fix works.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/how/SKILL.md).

### PS-005 — Recover motivation from several evidence categories

**Mechanism.** Why anchors the question in source and history, discovers available tools, then investigates source control, tickets, long-form documents, team chat, infrastructure telemetry, errors, and analytics. Source-specific references explain queries and an epistemics guide governs synthesis. Missing sources and null results remain visible.

**T3 application.** Use an explicit source scope per company/project. Pull relevant Jira or Linear context alongside code without mixing ownership or treating one tracker as the global truth. Preserve citations and confidence in the brief.

**Tips and limits.** This is evidence retrieval, not a synchronized task database. Do not assume unavailable integrations were searched or infer rationale merely from the newest commit.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/why/SKILL.md).

### PS-006 — Recall relevant history and verify current state

**Mechanism.** Recall scopes the workspace, topic, and time window, mines matching transcript regions, consults the shared record, and checks PRs/branches/tickets against live state. It returns a small capsule, status-tagged threads, recurring problems, and a next move.

**T3 application.** T3 can use durable threads and assignment records instead of Cursor transcript paths. Rebuild pitboss context on restart or provider change and hand a replacement worker relevant previous failures.

**Tips and limits.** History is evidence of what was said or attempted. Current state still needs reconciliation. Cross-project mining requires the appropriate scope.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/recall/SKILL.md).

### PS-007 — Teach as an understanding check

**Mechanism.** Teach composes how and why into a short explanation suited to the person’s purpose. It can use progressively built diagrams and concrete examples to explain mechanics and tradeoffs rather than enumerate functions.

**T3 application.** Let the user ask the pitboss why it prioritized a task, chose a worker, rejected evidence, or proposed leadership. The response should point to inspectable facts and decisions.

**Tips and limits.** The teaching step can expose assumptions, but fluent explanation does not validate them. Do not force a teaching ceremony before every small assignment.

**Disposition:** Selective. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/teach/SKILL.md).

### PS-008 — Use a small current-state context packet

**Mechanism.** Bulk documents and artifacts stay outside the main conversation; scoped readers return summaries and pointers. Frequently needed instructions can stay inline, while task-specific references load only when relevant.

**T3 application.** Inject identity, local environment, approved peer relationships, priorities, limits, task changes, unread messages, and selected verification recipes. Give workers a narrower packet. Include packet version and source freshness.

**Tips and limits.** The context-window principle is guidance, not a context builder. T3 must implement scoped retrieval, durable cursors, and packet assembly.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-guard-the-context-window/SKILL.md).

### PS-009 — Preserve standing orders across starts and resumes

**Mechanism.** The orchestrate workflow stores numbered standing orders covering model policy, verification, forbidden paths, escalation, and topology. Cloud starts and every resume receive them verbatim; local starts may use a file pointer. A fresh consolidated brief is preferred to chains of amendments.

**T3 application.** Make user-approved constraints structured server state and include the applicable subset in every injected packet. A replacement worker receives the current constraints plus inherited work, not only the latest corrective message.

**Tips and limits.** Standing orders cannot override permissions. Repetition prevents forgetting but does not prevent a weak worker from requesting an unauthorized operation.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md).

### PS-010 — Verification infrastructure before large-scale delegation

**Mechanism.** The generator first discovers how the real product launches, can be controlled, observed, and isolated. It produces launch, doctor, drive, evidence, cleanup, and helper instructions grounded in the repo.

**T3 application.** Start the pilot with an existing T3 verification skill and one proven journey. Add only missing repeatable setup/check capabilities before dispatching many cheap workers.

**Tips and limits.** Generating Markdown is insufficient: the source explicitly calls an unexecuted generated skill a draft. No generator or app was executed for this catalog.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/create-verification-skill/SKILL.md).

### PS-011 — Build a reusable control lever

**Mechanism.** A codemod, CLI, script, generator, or shared recipe makes work repeatable and reviewable. The recommended path is to learn one unit manually, encode it, rerun it, and compare results. A deterministic batch tool can replace many agents doing mechanical work.

**T3 application.** Use one typed T3 operation layer with MCP and CLI adapters. Verification recipes can call existing controls; machine-readable results reduce the reasoning demanded of cheap workers.

**Tips and limits.** Prefer the smallest useful tool. Do not create a new automation framework for a few already-supported commands, and do not count a described helper as an implemented one.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-build-the-lever/SKILL.md).

### PS-012 — Make the environment qualify itself

**Mechanism.** Doctor checks whether the instance is alive, current, correctly owned, authenticated, and suitable to drive. Launch instructions name a readiness signal rather than a guess about elapsed time.

**T3 application.** Receipts should identify environment, checkout/revision, build, fixture, and tool version. Reject evidence gathered from the wrong server or stale build. Recheck health after surprising behavior.

**Tips and limits.** A listening port alone is not readiness; a healthy server can still have a wedged UI. Reset the actual relevant state.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/create-verification-skill/SKILL.md).

### PS-013 — Verify the actual user path and side effects

**Mechanism.** Drive actions through stable semantic handles and normal product plumbing, then inspect both the visible result and side effects such as persisted records, files, or messages. Mocks belong at existing external-system boundaries.

**T3 application.** For a pitboss task, verify assignment creation, worker activity, evidence arrival, and recovery through their real contracts. For client changes, use the affected real entry points when authorized.

**Tips and limits.** Calling an internal handler bypasses the path being claimed. A screenshot does not establish persistence, delivery, or performance.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/create-verification-skill/SKILL.md).

### PS-014 — Feature maps as compact operational memory

**Mechanism.** The current generator seeds a feature index and roughly three to five important feature pages. Each explains user-facing behavior, entry points, harness driving, and gotchas. It is searchable context for an unfamiliar agent.

**T3 application.** Keep compact journey references beside T3 verification tooling. Map each assignment to relevant entries and load those only. Useful examples include reconnect, cancellation, follow-ups, and remote dispatch.

**Tips and limits.** The article’s broad catalog ambition differs from the current small starter map. Do not create a second product wiki or mechanically enumerate fields in internal docs.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/create-verification-skill/SKILL.md).

### PS-015 — Cross-feature journeys and honest coverage gaps

**Mechanism.** The map ties navigation and actions to observable end states. The separately inspected fictional Atlas example extends this to multi-surface journeys: concurrent threads, focus-dependent keys, pending creation, persistence, and gated features.

**T3 application.** Record which clients, providers, entry points, and connection modes a receipt covers, and which remain untested. A connected environment being unavailable must remain a gap.

**Tips and limits.** The Atlas repository deliberately omits its CLI. Native drag, remote execution, and scheduled completion cannot be inferred from approximate substitutes.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/create-verification-skill/references/feature-map-example/README.md).

### PS-016 — Keep evidence after cleanup

**Mechanism.** Verification teardown owns only the processes and scratch state started by the run. Evidence survives cleanup, and the generator requires checking that it still exists afterward. Failed attempts also clean up their residue.

**T3 application.** Publish evidence into durable T3-owned storage or stable artifact references before releasing an attempt’s workspace. Takeover preserves patch, logs, and measurements.

**Tips and limits.** A local file path on an ephemeral worker is not durable evidence. Retention and transfer need explicit implementation, especially across environments.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/create-verification-skill/SKILL.md).

### PS-017 — Distinguish verifier drift, harness gaps, and product regressions

**Mechanism.** Maintenance confines edits to verification tooling. Parallel source readers return feature summaries and recipes; one coordinated live pass exercises the features. It reports clean, changed, or blocked, separating incorrect docs, missing controls, and broken product behavior.

**T3 application.** Allow the pitboss to create bounded verifier-maintenance tasks. A worker cannot silently change its acceptance recipe to make its product patch pass. Record an intentional criterion change separately.

**Tips and limits.** Current maintenance requires live coverage and a re-run after harness repair. The article advocates daily upkeep; current generation suggests cadence only when asked.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/maintain-verification-skill/SKILL.md).

### PS-018 — Scale self-verification to the task

**Mechanism.** For a cheap single-command check, the worker runs it and the coordinator spot-checks receipts. Separate verifiers are reserved for expensive, judgment-heavy, or high-impact cases, preferably from another model family.

**T3 application.** Cheap coding workers also run concrete verification. The pitboss routes ambiguity and repeated failures to stronger judgment without making every small task pay for an independent agent.

**Tips and limits.** This current rule is more economical than the separate-verifier-everywhere reading of the articles. Independence helps but cannot replace a valid observation.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md).

### PS-019 — Use explicit verification outcomes

**Mechanism.** The ledger vocabulary distinguishes live UI verification, unit-test verification, type-check-only, blocked, and failed. Behavioral tasks cannot pass on typechecking alone; blocked verification is not success.

**T3 application.** Use structured pass/fail/inconclusive/not-run outcomes tied to acceptance criteria and evidence. The pitboss can assess whether the available proof is sufficient for that task.

**Tips and limits.** The source’s verdict labels are software-centric. Exploration, game feel, and home-server maintenance need different evidence recipes rather than pretending everything is a unit test.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md).

### PS-020 — Baseline and counterexample before claiming improvement

**Mechanism.** Hillclimb fixes a workload, metric, direction, stop condition, regression gate, and repeatable measurement. It first checks that the harness separates realistic workloads, then freezes it and compares one hypothesis at a time with enough samples to beat noise.

**T3 application.** For performance work, assign a baseline and frozen probe before a cheap worker changes code. Record rejected attempts as well as wins, and compare equivalent machines/configuration.

**Tips and limits.** The target cannot be relaxed to manufacture success. A faster result that breaks behavior fails. Sample count alone does not cure contention or an unrepresentative workload.

**Disposition:** Selective. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/hillclimb.md).

### PS-021 — A standing coordinator that delegates execution

**Mechanism.** The orchestration playbook assigns the coordinator framing, briefs, queue processing, status, and decisions. Code changes and conflicted integration go to workers; simple authorized mechanical landing can remain bookkeeping. Sub-coordinators exist only when a program exceeds one coordinator’s practical capacity.

**T3 application.** The elected T3 GLaDOS stays responsive in its conversation. When it must take over hard coding, create an execution attempt using a stronger agent with the inherited artifacts.

**Tips and limits.** Pstack’s tree is explicitly hierarchical inside a program. It is not evidence for leaderless federation. T3 peers and approved shared leadership are our distinct design.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md).

### PS-022 — A complete but proportionate assignment brief

**Mechanism.** The brief contains goal, writable and forbidden scope, necessary context, acceptance criteria, exact verification, timebox, prohibited operations, result format, and standing orders. Tiny units collapse the template while retaining the contract. Missing essential context is a reason to rescope before spawning.

**T3 application.** T3 should construct and validate this packet server-side. Cheap workers should not have to guess their repo, task owner, output location, or what successful completion means.

**Tips and limits.** A huge boilerplate brief can cost more than a small task. Validate meaningful requirements and capability prerequisites, not an arbitrary paragraph count.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md).

### PS-023 — A dependency is also a context handoff

**Mechanism.** Ready work is recomputed as results arrive, and upstream reports are relayed into downstream briefs because workers cannot see sibling sessions. The workflow warns that ordering alone leaves downstream agents guessing.

**T3 application.** Store dependencies by task ID and include relevant accepted output or a retrievable artifact with downstream dispatch. An upstream changed result can invalidate dependent assumptions.

**Tips and limits.** Do not inline every raw report indiscriminately. Preserve source pointers and scope; confidential company context must not spill into a personal or unrelated company worker.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md).

### PS-024 — Pilot the complete path before fan-out

**Mechanism.** A first unit tests brief, worker, verification, output publication, and delivery before multiplying the process. Near-identical cheap units use a lightweight first-unit pilot; novel units justify a separate verifier and closer audit.

**T3 application.** MVP acceptance should require one whole task and one recovery scenario, not merely successful tool dispatch. Fix a broken contract before increasing worker concurrency.

**Tips and limits.** A passing simple unit does not certify every task class. Add a pilot when the environment, output type, or verification surface changes materially.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md).

### PS-025 — Rolling concurrency with capacity limits

**Mechanism.** Workers run in a rolling window replenished at queue drains. Blocking batches repeatedly wait for their slowest member. The suggested child count is an operational heuristic, not a universal limit. Fewer broader workers can reduce orientation overhead.

**T3 application.** T3 scheduler tracks active attempts, environment capacity, and project budgets. Admit new work only when it can be owned and verified; account for expensive local builds separately from model concurrency.

**Tips and limits.** Many cheap agents can saturate disks, RAM, verification, or the pitboss’s review capacity. The useful metric is accepted outcomes per cost and time.

**Disposition:** Later. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md).

### PS-026 — Completion notifications should enqueue work

**Mechanism.** A completion notification becomes a small pointer in an inbox. The coordinator finishes a critical section before draining; deep review becomes a separate task. Drain points include track rollups, frontier wakes, and human reports.

**T3 application.** Persist result events before waking the pitboss. Coalesce relevant changes into a management turn, preserve an unread cursor, and avoid interrupt storms from many workers.

**Tips and limits.** Do not mistake notification for acceptance or mark durable messages consumed before processing is safely recorded. The source CLI drain is weaker than the desired T3 protocol.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md).

### PS-027 — Structured store with derived status

**Mechanism.** The current implementation maintains unit rows, a verification ledger, inbox pointer files, gates, standing orders, a computed frontier, and a rendered status page. Status counts are derived from stored records instead of an agent narrating remembered events.

**T3 application.** Map these concepts to T3’s existing event-sourced server and read model. The UI and context packet read the same authoritative task records.

**Tips and limits.** This is a real local file-store implementation, but not a distributed scheduler, replicated database, or substitute for T3’s persistence model.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/scripts/orch/store.ts).

### PS-028 — The orch CLI is bookkeeping, not the agent runtime

**Mechanism.** The CLI exposes unit, ledger, inbox, gate, frontier, standing, status, and init operations with compact or JSON output. The playbook explicitly leaves spawning, waking, waiting, and resuming to the harness Task tools.

**T3 application.** Expose one typed T3 coordination API through MCP and a CLI so providers can use the same state transitions. Keep lifecycle work in T3 reactors rather than agent-written shell loops.

**Tips and limits.** The CLI’s existence does not prove unattended orchestration survives losing the controlling chat. T3 must own durable dispatch and wakeup mechanisms.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/scripts/orch/orch.ts).

### PS-029 — Local atomic writes and lock recovery

**Mechanism.** Store mutations acquire a PID-based lock and use temporary-file rename for individual file replacement. A dead holder can be recovered; explicit force can steal a lock. These mechanisms prevent ordinary local concurrent writes from interleaving.

**T3 application.** Use T3 transactional persistence for task mutations and receipts. Test crash boundaries, replay, and deduplication. Treat environment identity separately from a local PID.

**Tips and limits.** PID liveness and filesystem rename are single-host mechanisms. They do not provide distributed ownership fencing, multi-file transactions, or federation consensus.

**Disposition:** Selective. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/scripts/orch/store.ts).

### PS-030 — Queue consumption needs stronger durability than a drain

**Mechanism.** Inbox push writes a timestamped pointer with a unique filename. Drain reads pointers, renames the inbox directory, recreates it, deletes the drained directory, and returns rows to the caller. There is no durable acknowledgment after the caller updates task state.

**T3 application.** T3 should use durable delivery identities and transactional processing or explicit acknowledgment. Replayed completion events must be harmless if a manager crashes after reading them.

**Tips and limits.** Do not transplant destructive drain semantics into the pitboss inbox. A crash after removing pointers but before recording their effects can lose unprocessed information.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/scripts/orch/store.ts).

### PS-031 — Bind acceptance to the actual revision

**Mechanism.** Ledger entries are keyed by PR number and head SHA, with verdict, evidence pointer, verifier text, and timestamp. A new SHA has no matching row until another record is written. Re-recording the same key replaces its prior row.

**T3 application.** T3 evidence needs task attempt, artifact/revision identity, criterion version, environment, and provenance. Preserve history so a later verdict does not erase the reasoning behind an earlier one.

**Tips and limits.** The store does not authenticate verifier identity or enforce the playbook’s claimed verifier precedence; it is last-write replacement. A row or evidence string alone does not establish proof.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/scripts/orch/store.ts).

### PS-032 — Explicit human gates without stopping unrelated work

**Mechanism.** Gates record the question, options, suggested default, and eventual answer. The coordinator batches product/permission decisions and works around blocked units instead of repeatedly asking the same question.

**T3 application.** Leadership consolidation, scope expansion, and subjective quality judgments become durable proposals. Continue already-authorized independent work while awaiting approval.

**Tips and limits.** A stored default is not permission. For this user, shared-leader changes require explicit approval; silence cannot authorize them.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md).

### PS-033 — Account for every spawned worker

**Mechanism.** Each spawned child must arrive, be respawned, or have its scope explicitly absorbed. Missing workers receive synthetic failure records with last evidence and possible next steps. A status summary cannot silently omit them.

**T3 application.** Track every attempt and its terminal or unknown state. Replacement work links to the original attempt so the pitboss can explain wasted spend, salvaged artifacts, and coverage.

**Tips and limits.** Disconnected and stopped are different states. No result does not establish that an old worker is no longer writing.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md).

### PS-034 — Classify retries and reduce scope

**Mechanism.** The playbook distinguishes resource limits, network loss, tool failures, and unknown failures. It suggests smaller scope for resource exhaustion, same-work retry for network loss, another model for tool failure, and bounded retries before replan.

**T3 application.** T3 records failure category, attempt budget, and escalation. The boss can coach, split, upgrade the worker, or take over without changing the acceptance bar.

**Tips and limits.** These retry mappings are heuristics. A tool failure may be infrastructure rather than intelligence; diagnose before spending on a stronger model.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md).

### PS-035 — Late workers require reconciliation before salvage

**Mechanism.** A worker returning after replacement is compared with the current frontier and verification ledger. Unique findings can be salvaged through new scoped work rather than blindly integrating a stale branch.

**T3 application.** Give every attempt a generation and explicit owner. Late results remain evidence but cannot overwrite a current assignment or reclaim ownership. Preserve useful patches for review.

**Tips and limits.** Prompting an old worker to stop is insufficient fencing. T3 needs an actual ownership and workspace handoff protocol, especially when environments disconnect.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md).

### PS-036 — Recover from durable artifacts after a session restart

**Mechanism.** The recovery recipe rereads standing orders and units, recomputes current integration state, discovers cloud work by PR/branch, reconstructs coordinators from briefs, and drains results. Local agents may be gone while cloud work continues.

**T3 application.** Re-electing a provider session should not recreate the pitboss’s identity or tasks. Reconcile actual attempts and artifacts first, then build a fresh context packet.

**Tips and limits.** Pstack’s recipe is agent-followed recovery. It is not automatic reconciliation between multiple peer environment servers.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md).

### PS-037 — Pause and pickup are separate workflows

**Mechanism.** Pause stops at a safe atomic boundary and externalizes a resume note and work state. Session pickup reconstructs branches, completed work, decisions, and the next step, then routes remaining work to its appropriate method.

**T3 application.** Support pause, resume, replace, and dismiss without deleting conversation history. Preserve the patch and receipt state during worker takeover.

**Tips and limits.** Follow T3’s authorization and commit conventions rather than copying automatic WIP commits or child cancellation literally. A restart cannot assume remote children died.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/pause-safely.md).

### PS-038 — Program-wide stop when the recipe is broken

**Mechanism.** If broken acceptance, bad upstream output, or dead infrastructure would generate repeated bad work, stop new spawning, preserve ongoing results, repair the cause, then resume. Infrastructure retries are bounded too.

**T3 application.** Pause a project or task class when its verification/tooling prerequisite is invalid. Keep the pitboss responsive and continue eligible work in other scopes.

**Tips and limits.** A stop-new-dispatch policy and an immediate zero-writes hold are different controls. Specify which one the user requested and what is enforceable remotely.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md).

### PS-039 — An auditable decision trail

**Mechanism.** The skill records timestamp, phase, decision, reason, evidence pointer, and result. It asks reviewers to audit the trail against actual transcripts and inspect important decisions with another model. The shell helper escapes tab/newline cells and spreadsheet formula prefixes.

**T3 application.** Store concise decisions and links as durable T3 events; derive summaries. This records why a pitboss changed direction or escalated a cheap worker, without storing private hidden reasoning.

**Tips and limits.** The helper formats and appends rows; it does not prove their truth or implement authenticated multi-writer logging. T3 should keep discussion artifacts outside committed scratch plans.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/show-me-your-work/SKILL.md).

### PS-040 — Choose the work-delivery topology explicitly

**Mechanism.** Current pstack distinguishes independent PR owners who build through authorized merge, a single operator-landed linear stack, and a standing program with a coordinator and stacker. Different workflows assign topology and merge responsibility differently.

**T3 application.** A T3 task records delivery target and authority: local artifact, reviewed change, PR-ready, or authorized merge. Do not infer merge permission from a task being accepted.

**Tips and limits.** T3 currently forbids unsolicited PRs. Neither the article nor the external playbook overrides that. Choose one simple pilot delivery path.

**Disposition:** Selective. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/autopilot-full.md).

### PS-041 — A computed integration frontier

**Mechanism.** The frontier records ordered PRs, branches, head SHAs, a generation, and the lowest unmerged PR. Its source implementation parses Graphite metadata and errors on unknown or mismatched states. One stacker owns stack mutations.

**T3 application.** Later integration support should compute dependency-ready deliverables from actual forge state. Readers see a versioned snapshot; one owner changes a given stack’s topology.

**Tips and limits.** Graphite metadata is specific to this workflow and local clone. T3’s leaderless environments do not imply multiple writers to one shared stack.

**Disposition:** Later. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md).

### PS-042 — Verify the contiguous deliverable chain

**Mechanism.** Shipping independently verifies changes, then lands only the passing run starting at the lowest unmerged PR. It prepares and merges one bottom PR, rereads actual forge state, and recomputes after each merge. Green CI alone is insufficient.

**T3 application.** Use acceptance and delivery as distinct states. A verified upper dependency cannot be shipped ahead of an unmet lower dependency merely because its own agent is done.

**Tips and limits.** This is a later integration workflow. The MVP need not implement a merge queue to demonstrate pitboss task management.

**Disposition:** Later. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/shipping.md).

### PS-043 — Patch identity can qualify evidence reuse

**Mechanism.** Shipping records head, base, and stable patch ID. After rebase, unchanged patch content can preserve a code verdict while current mergeability and CI rerun. Changed patches require renewed verification.

**T3 application.** Keep evidence scope precise and consider partial reuse only when its assumptions are explicit. Start with strict revision matching; optimize verification reuse after observing real cost.

**Tips and limits.** The orchestrate playbook says new SHA requires re-verification, while shipping/autopilot allow a patch-ID exception. Equal diffs do not prove equal integrated runtime behavior.

**Disposition:** Later. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/shipping.md).

### PS-044 — PR watching as typed events and policy

**Mechanism.** The bundled watcher separates GitHub reads, typed snapshots, policy classification, rendering, and CLI behavior. It recognizes conflicts, review threads, checks, merge gates, and queued-stack behavior, with different watch modes and backoff. Tests and fake dependencies are present.

**T3 application.** Adapt event-driven wakeups and small typed status summaries to T3. An agent should wake for meaningful change rather than continually poll a long transcript.

**Tips and limits.** The watcher is executable helper code, but its tests were not run here. A watcher saying ready is not proof a merge happened or user behavior was verified.

**Disposition:** Later. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/scripts/watch-pr/policy.ts).

### PS-045 — Triage review findings skeptically

**Mechanism.** Pstack asks the owner to classify automated findings as fixes, dismissals, or questions, verify claims against actual source, and give a concrete dismissal reason. It distinguishes maintaining a PR from automatic authority to ship it.

**T3 application.** The pitboss can route real findings into bounded rework and retain rejected findings with rationale. Stronger models assess ambiguous claims while cheap workers handle demonstrated fixes.

**Tips and limits.** Consensus can repeat a mistaken assumption. Do not churn code merely to satisfy every bot comment or suppress an actual failure without evidence.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/references/bugbot-triage.md).

### PS-046 — Structured plans checked by a script

**Mechanism.** Plans decompose work into units with dependencies, files, user-visible outcomes, build steps, unit/live/performance evidence, review gates, and delivery. The bundled check-plan script verifies prescribed headings, checkboxes, phrases, and lane structure.

**T3 application.** T3 task validation should require a meaningful outcome, scope, dependency readiness, and evidence recipe. Generate a reviewable MVP plan from concrete tasks rather than checking prose punctuation.

**Tips and limits.** The current script hardcodes ten Grok live lanes and particular wording. It validates structure, not correctness or actual execution. Do not import it as a general T3 gate.

**Disposition:** Selective. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/multi-phase-plan.md).

### PS-047 — Continuous delivery avoids a pile of unfinished integration

**Mechanism.** The program starts integrating with the first verified unit, keeps lower dependencies healthy, watches for post-merge problems, and allocates time to delivery before the wall-clock budget expires. The suggested seventy-percent cutoff is a heuristic.

**T3 application.** Budget execution, verification, and integration separately. A proactive pitboss should finish accepted outcomes instead of using all capacity to start more branches.

**Tips and limits.** Proactive activity is not permission to merge. In the pilot, delivery may mean presenting a verified local change rather than publishing it.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md).

### PS-048 — Falsifiable autonomous loops

**Mechanism.** Autonomous run defines a checkable exit condition, chooses event wakeups with heartbeat fallback, makes evidence-backed changes, verifies each step, and records outcomes. A stalled approach should pivot without redefining success.

**T3 application.** T3 owns scheduled/event wakeups and retry/time/spend caps. Agents choose their next bounded experiment; the server stops dispatch when policy is exhausted.

**Tips and limits.** Pstack’s keep-going posture is not a reason for unbounded spending. Plateau can justify escalation or an honest incomplete outcome under the user’s limits.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/autonomous-run.md).

### PS-049 — Design through usage sketches and empirical prototypes

**Mechanism.** Architect grounds current ownership, sketches caller experience and types, compares candidates through arena, implements the selected sketch, and revisits it when repeated workarounds contradict the design. Human agreement is an optional phase in the current skill.

**T3 application.** Use this for uncertain protocol boundaries or interaction design. Test a lost reply, restart, duplicate completion, or late worker using a small prototype before broad implementation.

**Tips and limits.** Do not run an arena for every function boundary in T3. One successful demo does not establish all concurrency invariants, and the user’s leadership approval remains mandatory.

**Disposition:** Selective. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/architect/SKILL.md).

### PS-050 — Arena uses independent candidates and selective synthesis

**Mechanism.** Arena frames an artifact and private rubric, assigns isolated outputs, runs candidate models, cross-judges, selects a coherent base, grafts justified strengths from alternatives, and verifies the final synthesis.

**T3 application.** Use competing designs for a genuinely open seam. The pitboss can commission cheap exploratory candidates while a stronger model judges tradeoffs and implementation evidence.

**Tips and limits.** Grafting every suggestion makes an incoherent design. Candidate independence and measured criteria matter more than the number of model families.

**Disposition:** Selective. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/arena/SKILL.md).

### PS-051 — Swarm distinguishes partition, race, and comparison

**Mechanism.** Swarm declares a done predicate, number of workers, partition or race shape, winner rule, and isolated outputs before running. It aggregates results instead of forwarding unreviewed worker messages.

**T3 application.** Choose coverage partitions for independent clients or scenarios. A race is appropriate only when the acceptance check can establish a winner and cancellation/accounting remain clear.

**Tips and limits.** Parallel measurements can interfere. Record resource conditions and failed/missing lanes; many runs are not automatically independent samples.

**Disposition:** Later. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/swarm/SKILL.md).

### PS-052 — Adversarial review ends in lead judgment

**Mechanism.** Reviewers receive the same intent, diff, and rubric, using model diversity rather than invented personas. The lead deduplicates findings, identifies disagreements, and categorizes actions, considerations, context, and dismissals.

**T3 application.** The pitboss remains accountable for an acceptance judgment. Cheap review can identify candidate defects; consequential findings get source or runtime proof before rework.

**Tips and limits.** The source calls agreement high signal, but agreement is not empirical verification. Reviews do not automatically authorize editing or merging.

**Disposition:** Selective. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/interrogate/SKILL.md).

### PS-053 — Prove the load-bearing safety fact

**Mechanism.** Blast-radius looks beyond direct callers to data formats, lifecycle timing, library versions, other languages, and downstream contracts. It asks for the one or two facts a change’s safety depends on and a runnable check where practical.

**T3 application.** For task ownership and takeover, prove that stale attempts cannot mutate current work. For client changes, test the affected wire or persistence behavior rather than only the visible component.

**Tips and limits.** Risk lists without a plausible mechanism produce noise. Label unproven assumptions explicitly rather than presenting a long review as proof.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/blast-radius/SKILL.md).

### PS-054 — Name the domain shape before branching

**Mechanism.** The principle calls for state machines, typed models, tables, reducers, registries, or suitable collections when they express real domain distinctions. Foundational thinking puts shared types and verification before dependent features.

**T3 application.** Model task, assignment attempt, message delivery, evidence, and leadership proposal separately. Use existing T3 deciders and projectors rather than adding orchestration conditionals throughout provider adapters.

**Tips and limits.** Do not convert every small conditional into machinery. Data structures should make the dominant operations simpler and illegal transitions visible.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-model-the-domain/SKILL.md).

### PS-055 — Keep validation at real boundaries

**Mechanism.** Parse network, config, CLI, and external API inputs into domain values once; keep pure business logic separate from framework wiring. Type discipline represents meaningful distinctions and only asks callers to handle relevant possibilities.

**T3 application.** MCP, CLI, tracker adapters, and peer messages validate through shared contracts. A pure context renderer accepts structured state and emits a provider-neutral packet.

**Tips and limits.** Boundary trust assumes validated inputs and current authorization. Permission and ownership checks on commands are domain rules, not redundant defensive checks to remove.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-boundary-discipline/SKILL.md).

### PS-056 — Convergent commands under retry

**Mechanism.** The principle asks what happens when an operation runs twice or crashes partway, with reconciliation for existing state, stale locks, sessions, and scheduling. Startup should adopt useful state rather than blindly duplicate it.

**T3 application.** Use stable command identities and durable receipts for dispatch, message delivery, task acceptance, and tracker writes. Recovery reconciles observed effects before retrying.

**Tips and limits.** Idempotence requires semantic design, not merely a UUID field. External APIs without idempotent writes may need read-back and an uncertain state.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-make-operations-idempotent/SKILL.md).

### PS-057 — Separate independent state before serializing shared state

**Mechanism.** Independent writers should get separate branches, paths, keys, or objects. A genuinely shared resource then has one owner rather than layers of coordination compensating for avoidable sharing.

**T3 application.** Give coding attempts isolated workspaces. Keep one owner per assignment and one topology writer per stack while environment pitbosses remain peers.

**Tips and limits.** Leaderless management is compatible with local ownership. It does not mean every environment writes every record or that partitioned writers can merge arbitrary changes safely.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-separate-before-serializing-shared-state/SKILL.md).

### PS-058 — Delete complexity and converge on the intended design

**Mechanism.** Laziness, subtract-before-add, reader-load, and outcome-oriented execution favor smaller changes, fewer hidden state dependencies, and completing a migration instead of preserving throwaway compatibility forever.

**T3 application.** Keep the pilot small: elected role, task ownership, messages, evidence, and recovery. Reuse T3 storage and adapters. Evaluate extra coordination layers by the concrete failure they solve.

**Tips and limits.** Backward compatibility across released clients and remote environments is real. The migrate-callers principle itself limits immediate deletion to APIs without external dependents.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-laziness-protocol/SKILL.md).

### PS-059 — Repeated failure can invalidate the premise

**Mechanism.** After several fixes sharing one premise fail the same gate, write the premise explicitly, take a per-actor census, and inspect whether a role assignment explains persistent imbalance. First-principles redesign instead incorporates a newly discovered constraint into the whole design.

**T3 application.** When cheap workers repeatedly fail, inspect brief quality, environment capability, verifier correctness, and task shape before simply escalating model cost. Record the changed hypothesis.

**Tips and limits.** Do not assume every repeated failure warrants a rewrite or that all skew is harmful. The census is an empirical discriminator.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-attack-the-premise/SKILL.md).

### PS-060 — Small behavioral checks and selective TDD

**Mechanism.** The TDD skill asks for the narrowest useful failing check when explicitly requested or when a cheap local target exists. It confirms the intended failure before the fix and reruns relevant nearby checks. Behavior-testing rejects assertions that only mirror implementation.

**T3 application.** Backend task/receipt changes need focused tests for duplicate commands, stale ownership, restart, and acceptance. Cheap workers receive exact test targets and expected behavior.

**Tips and limits.** The skill explicitly avoids inventing an expensive framework just to obey TDD. For UI behavior, tests and a real-client pass establish different claims.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/tdd/SKILL.md).

### PS-061 — Behavior-preserving refactors and visual parity

**Mechanism.** Refactoring pins existing behavior before moving structure, then checks equivalence in small steps. Visual parity adds fixed baselines, separate owners, and image comparison without modifying the baseline to make the migration pass.

**T3 application.** Use characterization checks for orchestration refactors and appropriate before/after evidence for client presentation. Garden only when the change reduces real maintenance burden.

**Tips and limits.** Pixel-zero is a specific migration requirement, not a universal quality standard. Browser rendering variability and intentional changes need an agreed criterion.

**Disposition:** Selective. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/refactoring.md).

### PS-062 — Forensics produces a diagnosis before a fix

**Mechanism.** Trace forensics converts captured profiles/heaps into queryable form, identifies hot paths or retainers, maps symbols to source, and uses paired captures when available. Runtime forensics collects the signal live and probes the suspected mechanism.

**T3 application.** Assign cheap workers bounded artifact reduction; the pitboss reasons from their cited findings. Use this for T3 performance and home-server incidents without asking the worker to improvise a broad repair.

**Tips and limits.** An unmapped hot frame or unpaired trace may support a hypothesis only. Observation tooling itself may perturb the system, and live mutation requires its own authority.

**Disposition:** Selective. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/trace-forensics.md).

### PS-063 — Bespoke workflows for unusual work

**Mechanism.** When no narrow playbook fits, frame a falsifiable outcome, quantified scope, risk-scaled rigor, independent units, an early verifier, and a decision trail. Each step runs an experiment and returns verified, not verified, or inconclusive.

**T3 application.** The pitboss can assemble a recipe for game exploration or a multi-repo tool change using catalog concepts. Persist the recipe and acceptance before assigning workers.

**Tips and limits.** A bespoke method is still bounded by permissions and budgets. Do not automatically adopt the source’s preference for committing trails in a repository that forbids scratch artifacts.

**Disposition:** Selective. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/figure-it-out/SKILL.md).

### PS-064 — Learn preferences without confusing inference with instruction

**Mechanism.** Automate-me mines recurring patterns within the active workspace, cross-checks them across time slices, asks about intent, and edits a concise personal mode. It preserves explicit existing preferences and avoids overfitting a single conversation.

**T3 application.** Store explicit user priorities and quality examples separately from proposed inferred preferences. The pitboss can suggest a correction to its brief rather than silently changing cross-company policy.

**Tips and limits.** The source workflow is skill authoring, not an implemented durable preference database. A repeated behavior does not grant new authority.

**Disposition:** Later. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/automate-me/SKILL.md).

### PS-065 — Reflect, then route lessons to the strongest mechanism

**Mechanism.** Reflect uses judgment, tooling, and divergent lenses, synthesizes accepted/rejected/backlog items, and checks whether a lint or runtime mechanism would enforce the lesson better. Accepted shared-skill edits wait for explicit approval in this source.

**T3 application.** Record recurring corrections as pitboss improvement tasks. Prefer typed constraints, repeatable checks, and templates where they solve the pattern; leave subjective judgment as reviewable preferences.

**Tips and limits.** External backlog creation in the source is not permission for this session. Keep autonomy updates, shared leadership, and org-wide policy changes under the user’s approval rules.

**Disposition:** Later. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/reflect/SKILL.md).

### PS-066 — Evaluate skill changes without leaking the test

**Mechanism.** Eval hides candidate/model identities and grading language, gives organic task prompts, uses a common private rubric, inspects actual transcripts for instruction-following, and compares artifacts rather than model self-report.

**T3 application.** Before broadening cheap-worker autonomy, compare brief variants and verification recipes on representative tasks. Track accepted outcomes, failure escapes, escalation rate, and total cost.

**Tips and limits.** Blind review reduces some biases, not all. Use held-out tasks and baseline comparisons; do not declare a routing policy good from a single favorable task.

**Disposition:** Later. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/eval.md).

### PS-067 — Plain explanations and documentation modes

**Mechanism.** Technical writing separates tutorial, how-to, reference, and explanation, then emphasizes unambiguous instructions and consistent names. Unslop removes unsupported claims and canned prose; no-comments challenges narration that code already expresses.

**T3 application.** Use the concept catalog as reference, the MVP as an implementation proposal, and the pitboss conversation as a concise decision interface. Keep evidence links near claims.

**Tips and limits.** Do not adopt every stylistic ban or delete durable rationale. T3’s existing documentation conventions take precedence.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/technical-writing/SKILL.md).

### PS-068 — Benny separates triage from reproduction

**Mechanism.** Benny is a dormant automation pack. Triage reads a report, traces likely ownership, classifies it, checks existing fixes, deduplicates, optionally creates a tracker item, and posts one verdict. A second workflow waits for the trusted triage contract before reproducing.

**T3 application.** Ingest personal, Jira, and Linear tasks through source adapters. Store source identity and provenance, then create a local work proposal or assignment under policy. Keep signal ingestion separate from execution.

**Tips and limits.** These are configured automation instructions, not an always-running service or a general multi-tracker reconciliation engine. Do not claim it already solves federation.

**Disposition:** Later. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/automations/benny/skills/triage-issue-reports/SKILL.md).

### PS-069 — Immutable source coordinates and trusted result markers

**Mechanism.** Benny freezes channel and root-thread coordinates, validates them before sending, verifies replies stay in-thread, and accepts triage markers only from configured identity. Delegated workers are denied Slack writes by its instructions.

**T3 application.** A T3 external source key includes connector/account/project/item identity. Correlated updates must target that exact source. Server-scoped tools should enforce worker write restrictions rather than rely on prompt compliance.

**Tips and limits.** A message with the right text is not necessarily authoritative. Thread URLs, imported content, and tracker descriptions remain external data.

**Disposition:** Later. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/automations/benny/skills/reproduce-and-fix-issues/SKILL.md).

### PS-070 — Respect existing owners and fix artifacts

**Mechanism.** Before preparing a fix, Benny checks whether someone is already explicitly working on it or an existing PR/commit addresses it. It can verify that existing artifact instead of producing a duplicate. Reproduction names correct and broken end states and repeats the real path independently.

**T3 application.** The pitboss reconciles tracker ownership with active T3 assignments before starting work. It can assign verification of an existing fix rather than a competing implementation.

**Tips and limits.** Two tickets with similar titles are not automatically duplicates. Ambiguous matches become proposed links; do not silently merge company task histories.

**Disposition:** Later. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/automations/benny/skills/reproduce-and-fix-issues/SKILL.md).

### PS-071 — Bounded automated fixes and maintained configuration

**Mechanism.** Benny keeps user configuration outside copied source-managed files, preserves local edits on refresh, checks integrations and control capabilities, and tests routing with a harmless report. Reproduction can qualify a small draft fix only after evidence and scope gates.

**T3 application.** Use connector-specific policy and capabilities. A home-server or company scope can allow observation, local fixes, or selected write-back independently. Test source routing and idempotency before enabling automation.

**Tips and limits.** The pack’s publication and PR defaults are not T3 authorization. Setup templates are not proof that a configured live automation works.

**Disposition:** Later. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/automations/benny/skills/setup-benny/SKILL.md).

### PS-072 — Webhook UI wakes a bot through a server-side boundary

**Mechanism.** The Grok-specific UI recipe keeps the sender key on a local server, sends a small JSON body to a routine, treats payload text as untrusted data, probes with a harmless action, and optionally logs failed payloads for later draining.

**T3 application.** T3 already has authenticated UI/server messaging, so pitboss controls should issue typed commands there. Reuse the principle of a durable command behind a lightweight wake signal.

**Tips and limits.** Reject copying the bespoke HTTP/Tailscale installation recipe into T3. HTTP 200 means a routine woke, not that requested work completed; failed-event logs need deduplication and acknowledgment.

**Disposition:** Selective. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/make-bot-ui/SKILL.md).

### PS-073 — Cloud machines and worktrees solve different problems

**Mechanism.** The supplied Part 1 advocates cloud agents for independent computers, reproducible images, and high parallelism, while criticizing local worktree resource costs. Current pstack playbooks explicitly use isolated worktrees and reserve local workers for machine-bound verification, transcripts, simulators, or credentials.

**T3 application.** Place tasks by OS, tooling, access, compute, and available verification. A home server, desktop, or cloud environment can each run a pitboss and workers. A remote worker still needs its own checkout and state.

**Tips and limits.** Reject the idea that cloud execution replaces source isolation. Nothing here requires a particular cloud vendor or permanent central leader.

**Disposition:** Selective. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/README.md).

### PS-074 — Gardening as a bounded portfolio activity

**Mechanism.** The articles describe a maintainer continuously noticing repeated smells, tightening foundations, adding checks, and keeping verification useful while others ship features. This is a proactive role rather than a named universal scheduler mechanism.

**T3 application.** Allocate an explicit share of pitboss capacity to repeated defects, harness friction, and measured performance regressions across tools and the game. Prefer fixes that remove future supervision.

**Tips and limits.** Do not optimize PR count or spawn unlimited speculative refactors. The posts’ productivity multipliers and PR counts are author reports, not benchmarks established here.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/README.md).

### PS-075 — Readme-driven design works backward from a consumer

**Mechanism.** Part 2 begins shared-package design with a tutorial or usage sketch, making the desired developer experience concrete before implementation. Architecture sketches then make types, call sites, and tradeoffs reviewable, with prototypes resolving observable questions.

**T3 application.** Describe electing, assigning, pausing, recovering, and proposing shared leadership from the user’s perspective before implementing storage details. For MCP/CLI, sketch what a cheap worker actually calls.

**Tips and limits.** A readable tutorial is a target, not empirical proof. Keep reference catalogs separate from how-to instructions and implement only the agreed MVP slice.

**Disposition:** MVP. [Pinned source](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/technical-writing/SKILL.md).

## What is implemented and what is a behavioral instruction

| Area                    | Actual source mechanism                                                         | What T3 must add or deliberately change                                                                      |
| ----------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Orchestration lifecycle | Harness Task calls driven by an agent following a playbook                      | Durable server dispatch, wakeup, recovery, and provider capability negotiation                               |
| Work records            | Locally locked TSV/JSON files; unit state accepts nonempty strings              | Typed transitions, stable task/attempt identities, event history, scoped authorization                       |
| Message queue           | File pointers; destructive directory drain before caller processes rows         | At-least-once delivery, acknowledgment, idempotent processing, and durable consumption cursors               |
| Acceptance              | PR+SHA row replacement, a parsed verdict enum, evidence string                  | Authenticated provenance, immutable evidence history, criterion versions, policy-enforced acceptance         |
| Verifier precedence     | Playbook says verifier overrides worker                                         | Store does not enforce this distinction; T3 must define authoritative acceptance roles                       |
| Leadership              | Hierarchical coordinator/track/worker workflow                                  | Peer environment pitbosses with no global boss; explicit user-approved shared coordination                   |
| Ownership               | One-writer instructions plus a local store lock                                 | Assignment generations and actual workspace ownership resolution before replacement writes                   |
| Worker questions        | Playbook frames briefs around workers being unable to ask coordinator questions | Explicit `needs-input`/question messages, a reply path, and bounded escalation are useful for cheaper models |
| Boss takeover           | Coordinator must delegate code changes                                          | Pitboss can take over via a dedicated execution attempt while keeping management responsive                  |
| Standing orders         | Prompt/file instructions repeated on starts and resumes                         | Server-owned approved policy, context versions, and command authorization; do not rely only on text          |
| Human gates             | File-backed question/options/default/answer                                     | No default or elapsed timer grants approval; shared-leader changes require an explicit user decision         |
| Plans                   | Syntax/phrase/checkbox validator                                                | Validate task contracts and actual receipts; reject hardcoded model/lane counts as universal requirements    |
| Source reconciliation   | Benny source coordinates, tracker adapter instructions, ownership/dedupe gates  | Durable account-scoped mappings, read/write receipts, conflicts, freshness, and multi-tracker reconciliation |
| Recurrence              | Cursor loops and external automation routines                                   | Server event/scheduled wakeups that survive closing a T3 client                                              |

These distinctions matter for cheaper workers. A weak model can follow a small CLI recipe, but should not be the implementation of reliability. T3 must enforce the protocol even when the worker forgets a step, returns a stale result, or misreads its brief.

## Complete skill and principle inventory

Each entry links to the pinned source. Related concept IDs are the compact crosswalk; several principles deliberately share a concept when their implementation implications overlap. These names are source vocabulary, not a proposal to expose 47 new T3 commands.

| Skill or principle                                                                                                                                                                                              | Related concepts                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [architect](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/architect/SKILL.md)                                                                                   | PS-049, PS-050                                 |
| [arena](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/arena/SKILL.md)                                                                                           | PS-050                                         |
| [automate-me](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/automate-me/SKILL.md)                                                                               | PS-064                                         |
| [blast-radius](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/blast-radius/SKILL.md)                                                                             | PS-053                                         |
| [bro](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/bro/SKILL.md)                                                                                               | PS-003                                         |
| [create-verification-skill](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/create-verification-skill/SKILL.md)                                                   | PS-010, PS-012, PS-013, PS-014, PS-015, PS-016 |
| [figure-it-out](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/figure-it-out/SKILL.md)                                                                           | PS-063                                         |
| [how](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/how/SKILL.md)                                                                                               | PS-004                                         |
| [interrogate](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/interrogate/SKILL.md)                                                                               | PS-052                                         |
| [maintain-verification-skill](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/maintain-verification-skill/SKILL.md)                                               | PS-017                                         |
| [make-bot-ui](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/make-bot-ui/SKILL.md)                                                                               | PS-072                                         |
| [no-comments](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/no-comments/SKILL.md)                                                                               | PS-067                                         |
| [poteto-mode](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/SKILL.md)                                                                               | PS-001, PS-002, PS-009                         |
| [principle-attack-the-premise](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-attack-the-premise/SKILL.md)                                             | PS-059                                         |
| [principle-boundary-discipline](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-boundary-discipline/SKILL.md)                                           | PS-055                                         |
| [principle-build-the-lever](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-build-the-lever/SKILL.md)                                                   | PS-011                                         |
| [principle-encode-lessons-in-structure](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-encode-lessons-in-structure/SKILL.md)                           | PS-065                                         |
| [principle-exhaust-the-design-space](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-exhaust-the-design-space/SKILL.md)                                 | PS-049, PS-050                                 |
| [principle-experience-first](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-experience-first/SKILL.md)                                                 | PS-075                                         |
| [principle-fix-root-causes](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-fix-root-causes/SKILL.md)                                                   | PS-059, PS-060                                 |
| [principle-foundational-thinking](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-foundational-thinking/SKILL.md)                                       | PS-054                                         |
| [principle-guard-the-context-window](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-guard-the-context-window/SKILL.md)                                 | PS-008                                         |
| [principle-laziness-protocol](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-laziness-protocol/SKILL.md)                                               | PS-058                                         |
| [principle-make-operations-idempotent](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-make-operations-idempotent/SKILL.md)                             | PS-056                                         |
| [principle-migrate-callers-then-delete-legacy-apis](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-migrate-callers-then-delete-legacy-apis/SKILL.md)   | PS-058                                         |
| [principle-minimize-reader-load](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-minimize-reader-load/SKILL.md)                                         | PS-058                                         |
| [principle-model-the-domain](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-model-the-domain/SKILL.md)                                                 | PS-054                                         |
| [principle-never-block-on-the-human](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-never-block-on-the-human/SKILL.md)                                 | PS-032, PS-048                                 |
| [principle-outcome-oriented-execution](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-outcome-oriented-execution/SKILL.md)                             | PS-058                                         |
| [principle-prove-it-works](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-prove-it-works/SKILL.md)                                                     | PS-013, PS-018, PS-019                         |
| [principle-redesign-from-first-principles](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-redesign-from-first-principles/SKILL.md)                     | PS-049, PS-059                                 |
| [principle-separate-before-serializing-shared-state](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-separate-before-serializing-shared-state/SKILL.md) | PS-057                                         |
| [principle-sequence-verifiable-units](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-sequence-verifiable-units/SKILL.md)                               | PS-024, PS-047, PS-060                         |
| [principle-subtract-before-you-add](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-subtract-before-you-add/SKILL.md)                                   | PS-058                                         |
| [principle-test-behavior-not-implementation](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-test-behavior-not-implementation/SKILL.md)                 | PS-060                                         |
| [principle-type-system-discipline](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/principle-type-system-discipline/SKILL.md)                                     | PS-055                                         |
| [recall](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/recall/SKILL.md)                                                                                         | PS-006                                         |
| [reflect](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/reflect/SKILL.md)                                                                                       | PS-065                                         |
| [setup-pstack](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/setup-pstack/SKILL.md)                                                                             | PS-002                                         |
| [show-me-your-work](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/show-me-your-work/SKILL.md)                                                                   | PS-039                                         |
| [swarm](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/swarm/SKILL.md)                                                                                           | PS-051                                         |
| [tdd](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/tdd/SKILL.md)                                                                                               | PS-060                                         |
| [teach](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/teach/SKILL.md)                                                                                           | PS-007                                         |
| [technical-writing](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/technical-writing/SKILL.md)                                                                   | PS-067, PS-075                                 |
| [typescript-best-practices](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/typescript-best-practices/SKILL.md)                                                   | PS-055                                         |
| [unslop](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/unslop/SKILL.md)                                                                                         | PS-067                                         |
| [why](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/why/SKILL.md)                                                                                               | PS-005                                         |

## Complete playbook inventory

| Playbook                                                                                                                                                      | Related concepts                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [authoring-a-skill](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/authoring-a-skill.md) | PS-065, PS-066                                                                                                                                                         |
| [autonomous-run](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/autonomous-run.md)       | PS-048                                                                                                                                                                 |
| [autopilot-full](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/autopilot-full.md)       | PS-040, PS-042, PS-043                                                                                                                                                 |
| [autopilot-stack](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/autopilot-stack.md)     | PS-040, PS-041, PS-043                                                                                                                                                 |
| [babysit](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/babysit.md)                     | PS-044, PS-045                                                                                                                                                         |
| [bug-fix](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/bug-fix.md)                     | PS-013, PS-059, PS-060                                                                                                                                                 |
| [eval](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/eval.md)                           | PS-066                                                                                                                                                                 |
| [feature](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/feature.md)                     | PS-022, PS-054                                                                                                                                                         |
| [hillclimb](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/hillclimb.md)                 | PS-020                                                                                                                                                                 |
| [investigation](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/investigation.md)         | PS-004, PS-005                                                                                                                                                         |
| [multi-phase-plan](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/multi-phase-plan.md)   | PS-046                                                                                                                                                                 |
| [opening-a-pr](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/opening-a-pr.md)           | PS-040, PS-067                                                                                                                                                         |
| [orchestrate](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/orchestrate.md)             | PS-009, PS-018, PS-021, PS-022, PS-023, PS-024, PS-025, PS-026, PS-027, PS-028, PS-029, PS-030, PS-031, PS-032, PS-033, PS-034, PS-035, PS-036, PS-038, PS-041, PS-047 |
| [pause-safely](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/pause-safely.md)           | PS-037                                                                                                                                                                 |
| [perf-issue](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/perf-issue.md)               | PS-020, PS-062                                                                                                                                                         |
| [prototype](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/prototype.md)                 | PS-049, PS-050                                                                                                                                                         |
| [refactoring](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/refactoring.md)             | PS-058, PS-061                                                                                                                                                         |
| [runtime-forensics](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/runtime-forensics.md) | PS-062                                                                                                                                                                 |
| [session-pickup](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/session-pickup.md)       | PS-006, PS-037                                                                                                                                                         |
| [shipping](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/shipping.md)                   | PS-042, PS-043                                                                                                                                                         |
| [trace-forensics](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/trace-forensics.md)     | PS-062                                                                                                                                                                 |
| [visual-parity](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/visual-parity.md)         | PS-061                                                                                                                                                                 |
| [worktree-cleanup](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/playbooks/worktree-cleanup.md)   | PS-016, PS-073                                                                                                                                                         |

## Helper, agent, automation, and reference inventory

The [machine-readable manifest](pstack-source-manifest.json) lists every tracked path, byte count, SHA-256, file class, and inspection level. No source bodies are copied into these notes. The following groups explain how to revisit implementation detail.

- **[Orchestration CLI](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/scripts/orch/orch.ts).** Command parsing, compact/JSON rendering, usage/error handling, and store selection. The companion `store.ts` implements actual persistence; `orch.test.ts` contains focused tests, inventoried but not executed. See PS-027–PS-031.
- **[Dependency bootstrap](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/scripts/bootstrap.ts).** Checks the package/lock inputs and installs frozen Bun dependencies when the helper needs them. `package.json` and `bun.lock` pin its dependency setup. This was inspected, not run; importing helpers may have installation side effects.
- **[PR watcher](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/scripts/watch-pr/policy.ts).** `cli.ts` handles invocation; `github.ts` reads forge facts; `policy.ts` classifies and drives decisions; `render.ts` formats results; `types.ts` and `types.compile.ts` express the interface; CLI/GitHub/policy tests and fakes support it. The shell launcher resolves execution. Source/schema inspection is not a successful live watch.
- **[Plan validator](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/scripts/check-plan.mjs).** Reads Markdown, checks section ordering and prescribed evidence blocks, enforces stylistic restrictions, and requires a specific ten-lane live verification shape. Reuse the principle of machine validation, not its opinionated literal template.
- **[Worktree auditor](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/poteto-mode/scripts/worktree-audit.sh).** The cleanup playbook describes size/age/dirty state/PR/transcript classification and explicitly says its suggested safe bucket is not permission. This script was inventoried, not audited line by line or run. Never use it to delete an active T3 workspace.
- **[Decision-log helper](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/show-me-your-work/scripts/log.sh).** Formats an append-only TSV row, creates its header, removes tab/newline/CR separators, and prefixes formula-like cells for spreadsheet safety. It does not authenticate evidence or implement a multi-host audit log.
- **[Agent wrappers](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/agents/poteto-agent.md).** The wrapper loads the mode for delegates. `comment-sicko.md` applies an aggressively narrow comment-retention rubric and reports code that needs redesign. Its persona and broad deletion bias are not necessary pitboss architecture; retain useful rationale under T3 conventions.
- **[Benny pack](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/automations/benny/README.md).** Three dormant operational skills: setup-benny, triage-issue-reports, reproduce-and-fix-issues. References provide routing, control-adapter, feature-map, and verify-existing-fix shapes. YAML and prompt templates are setup inputs, not installed automations. FOR_AGENTS explains entry and copying; user-owned settings remain outside source-managed files.
- **[Architecture and review references](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/architect/references/design-red-flags.md).** Architect includes red flags, rationale, and runner prompt; how includes explorer/explainer prompts; interrogate includes quality lens, rubric, lead judgment, and reviewer prompt; reflect includes judgment/tooling/divergent/synthesis prompts. These were inventoried with related workflow inspection, not all audited line by line.
- **[Historical evidence references](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/why/references/source-playbook.md).** Why includes epistemics, investigator/synthesizer prompts, and source recipes for code history, Linear, Notion, Slack, Datadog, Sentry, Databricks, and incidents. They illustrate evidence categories; they are not hard dependencies or proof that an account integration exists.
- **[Verification reference examples](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/skills/create-verification-skill/references/feature-map-example/README.md).** A small index and create-note/search pages demonstrate map shape. The separate Atlas example is documented in earlier notes at its own pinned commit; its intentionally missing CLI remains a limitation.
- **[Guide and packaging](https://github.com/cursor/plugins/blob/7366ac128bdf95f45e6734f412b49a4031800169/pstack/docs/guide/README.md).** Ten guide chapters cover setup, mode routing, understanding, design, implementation/cleanup, verification/shipping, overnight runs, principles, customization, and pitfalls. They and guide images were inventoried as orientation material, not independently validated demonstrations. Manifest metadata declares version 0.15.1 and MIT licensing. README, LICENSE, logo, and ignore files are included in the path manifest.

## Article-to-current-source differences and unresolved tensions

1. **More orchestration than the articles imply.** The pinned source has a working local bookkeeping CLI, a standing-program workflow, ownership/topology guidance, exact-head evidence, and recovery recipes. Earlier comparisons should no longer describe pstack as only prompting and verification advice.
2. **Cloud and worktrees coexist.** Part 1 argues against local worktrees as a scaling strategy; current workflows use isolated worktrees/branches and local capability exceptions. Treat compute placement and writable-state isolation as separate choices.
3. **Verification has several rigor levels.** Orchestrate explicitly allows cheap worker self-verification and spot-checks. Shipping/autopilot insist on independent verification for their delivery lanes. The plan validator hardcodes ten Grok lanes. These are different workflow policies, not one universal rule to import.
4. **Evidence reuse differs by playbook.** Orchestrate invalidates on new SHA; shipping/autopilot can retain a code verdict for an unchanged patch ID while rerunning current checks. T3 should start with strict revision-specific acceptance and only add qualified reuse when justified.
5. **Feature-map scope and cadence evolved.** The current generator starts with three to five features and suggests a cadence only if asked. The article discusses broad feature catalogs and daily maintenance. A small proven map is a better pilot fit.
6. **Autonomy rules vary.** Mode defaults encourage external reversible actions; reflect requires approval for accepted shared-skill edits; autopilot requires an explicit go and preserves operator-owned items; orchestrate parks gates with defaults. None overrides this user’s leadership-approval requirement, tool permissions, or T3’s publication rules.
7. **Dr Eggbot is an article reference, not a bundled source entry here.** No Dr Eggbot implementation appears in this inventoried subtree. Do not claim the bot was installed or audited. The x.ai links and external Cursor-team-kit/built-in skills are dependencies or references, not fully covered by this catalog.
8. **Model and harness specifics are replaceable.** Cursor Task environments, loop/goal commands, transcript layout, model slugs, Graphite, and Grok routine tools cannot simply be assumed available in every T3 provider. Preserve their intent at typed capability boundaries.
9. **Leaderless federation is a T3 requirement.** The source’s hierarchical program management helps within an approved scope. It supplies neither peer consensus nor a right to consolidate leadership automatically.

## Completeness and iteration checklist

For a new iteration, start from concept IDs attached to the concrete problem. Read the pinned implementation where enforcement matters. If updating the upstream snapshot, diff the manifest and revisit changed concepts instead of assuming current main matches this record. Record new evidence when a helper or workflow is actually executed.

Still not established by this research: production reliability or claimed throughput; behavior of external built-in skills and Cursor-team-kit controls; a configured Benny deployment; the full Grok Bot/Dr Eggbot runtime; statistical merit of particular model routing; multi-host replication or consensus; and end-to-end execution of any pstack helper. These are explicit gaps, not reasons to hide useful patterns.

Verified inventory counts (computed from the pinned checkout):

```json
{
  "tracked_files": 158,
  "top_level_skills": 47,
  "principle_skills": 23,
  "playbooks": 23,
  "agents": 2,
  "dormant_automation_skills": 3,
  "concepts": 75
}
```
