# From source concepts to the T3 GLaDOS

This is the decision index for the [Gas City](gas-city.md), [pstack](pstack.md), [Cursor](cursor-projects.md), and [Hermes media-team](hermes-media-team.md) catalogs. IDs refer to stable entries there. The [current scope](scope.md) chooses a small implementation of these lessons; this library retains the rest for later iteration.

## Find a concept by the problem you are solving

| Problem                                             | Gas City                   | pstack                             | T3 adaptation                                                                                 |
| --------------------------------------------------- | -------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| The manager forgets its job after compaction        | GC-002, GC-047–050         | PS-006, PS-008–009, PS-036         | Durable role/brief plus a current, scoped context packet every ordinary management turn       |
| A cheap worker does not understand the task         | GC-013, GC-047, GC-052     | PS-003–006, PS-022–023             | One outcome, exact scope, relevant upstream evidence, criteria and runnable verification      |
| A manager spends all its context implementing       | GC-001, GC-029             | PS-021–022                         | Delegate execution; takeover is a separately tracked attempt with inherited artifacts         |
| A message was sent but nothing happened             | GC-037, GC-039–044         | PS-026, PS-028–030                 | Persist message/dispatch intent, deduplicate delivery, distinguish receipt from action        |
| A crash creates duplicate agents                    | GC-011, GC-032–038, GC-056 | PS-029, PS-033–036, PS-056         | Stable operation identities, atomic ownership and recoverable launch correlation              |
| A disconnected agent comes back late                | GC-034–035, GC-057         | PS-033, PS-035–036                 | Preserve old evidence; reject stale authority; inspect actual writer state before replacement |
| The dashboard says done but there is no proof       | GC-003–005, GC-014–017     | PS-010–020, PS-031                 | Separate execution from acceptance, bind evidence to candidate/criteria, retain artifacts     |
| Tests could not run                                 | GC-015–016                 | PS-012, PS-017–019, PS-034         | Inconclusive/blocked verification and bounded infrastructure retries                          |
| Workers make changes to the checks to pass          | GC-004, GC-014             | PS-017, PS-020, PS-031             | Version the acceptance recipe independently; changing criteria invalidates prior acceptance   |
| Multiple workers clobber one checkout               | GC-023–026, GC-031–035     | PS-025, PS-040–041, PS-057, PS-073 | One writer per workspace; explicit workspace strategy and resource admission                  |
| Backlog polling wastes model calls                  | GC-028, GC-044–046         | PS-026–028, PS-038                 | Server evaluates readiness and coalesces wakes; models decide when there is useful work       |
| Three task trackers disagree                        | GC-002, GC-008, GC-067     | PS-005, PS-068–071                 | Namespaced source records; source status, T3 execution and acceptance remain separate         |
| An agent keeps asking the same question             | GC-044, GC-049             | PS-009, PS-032, PS-064–065         | Durable decision and constraint records; approval applies to the exact proposal               |
| The first architecture sounds good but fails in use | GC-010, GC-068             | PS-049–055, PS-059, PS-075         | Prototype the uncertain behavior and test the load-bearing invariant                          |
| Volume increases but useful work does not           | GC-030–031, GC-058, GC-064 | PS-024–025, PS-033–034, PS-047–048 | Measure accepted outcomes, supervision effort and recovery cost before increasing fan-out     |
| Evidence vanishes with a cloud VM                   | GC-005, GC-024, GC-065     | PS-016, PS-031, PS-036             | Publish artifacts durably before workspace cleanup; show missing evidence explicitly          |
| Verification tools decay                            | GC-045–046                 | PS-011–017, PS-065–066, PS-074     | Authorized, bounded gardening; verify the verifier and retain a known failing case            |

## What each source actually contributes

**T3 already supplies the provider execution and user interaction foundation.** Its durable threads, run orchestration, receipts, outbox, adapters and clients are the host for the new work domain. The MVP adds outcome/assignment authority above runs. Durable peer delivery and session-scoped work tools implement the initial boundary; see [current scope](scope.md) for remaining constraints.

**Gas City provides a broad operational toolbox.** Persistent work identity, routing and claims, mail versus nudges, durable waits, lifecycle reconciliation, workflow materialization, lease identity, retry classification and configuration provenance are particularly relevant. Several guarantees are conditional: close validation is advisory unless enforcement is enabled, some claim fences fail open on store trouble, review synthesis is agent-driven, and remote/local command parity is incomplete. Adopt the invariant with a clearly enforced T3 boundary, not the stronger guarantee implied by a name.

**Pstack contributes both engineering method and concrete local orchestration records.** The current source goes beyond the supplied posts: its `orch` CLI tracks units, gates, inbox pointers and revision-specific verification; the agent still runs the Task dispatch loop. Its narrow briefs, standing orders, current-state retrieval, proportional self-verification, prototypes and maintained app controls are useful immediately. File-store writes and destructive inbox drains are not a distributed work protocol.

**Leaderless federation is a T3 requirement we are designing.** Neither catalog proves that its source implements peer T3 environments that can propose a shared coordinator under user approval. Local ownership, shared coordination authority and worker execution are different roles. The MVP preserves one task home while allowing each peer its own local responsibilities; approval changes management scope without moving the task ledger or granting credentials.

## Decisions and deliberate divergences

| Source idea or tension                              | Decision for T3                                                                          | Reason                                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Gas City beads; pstack TSV/JSON                     | Use T3's existing persistence and event model                                            | One authoritative work domain, with no second database to reconcile locally           |
| Gas City notification queues; pstack inbox drain    | Persist inbox/outbox with idempotent effects and explicit processing acknowledgment      | Reading a notification must not lose an unfinished obligation                         |
| Rich Gas City formulas                              | Versioned small task recipes and ordinary dependency edges first                         | Enough structure for repeated work without a general workflow compiler                |
| Gas City configurable roles and model overrides     | Explicit capability/model profiles with bounded escalation                               | An automatic expensive-to-cheap hierarchy was not established by the source           |
| Pstack coordinator never authors code               | Keep management responsive; allow pitboss takeover through a distinct execution attempt  | The user explicitly requested takeover, with preservation of prior work               |
| Pstack cloud-worker briefs cannot rely on questions | Provide a durable question/report operation                                              | Less capable workers should escalate uncertainty before producing avoidable failures  |
| Verbatim standing orders versus bounded context     | Include all applicable hard constraints and a concise task packet; fetch detail by scope | Never drop relevant restrictions to hit a token target; rescope oversized assignments |
| Separate verifier versus self-check                 | Cheap workers run meaningful checks; stronger/independent review depends on the task     | Verification quality depends on evidence, not the number of agents                    |
| New SHA reverify versus patch-identity reuse        | MVP requires evidence for the exact candidate revision/state                             | Easier to audit; selective reuse can come later with dependency/environment reasoning |
| Worktrees versus cloud machines                     | Treat workspace isolation and runtime placement as separate choices                      | A cloud worker still needs controlled branches, resources and artifact retention      |
| Human gate with a suggested default                 | Record suggestions but require explicit approval for leadership changes                  | A timeout is not the user's answer                                                    |
| Automatic lifecycle restart                         | Restart local execution infrastructure where authorized; never infer new leadership      | Process recovery and authority transfer solve different problems                      |
| Daily maintenance recommendation                    | A bounded recurring task only under agreed priorities and capacity                       | Tool improvement must not silently consume all useful-work capacity                   |
| PR and throughput counts                            | Report accepted outcomes, evidence, intervention count, latency and observed cost        | PR volume cannot establish quality or usefulness                                      |

## Keep for later, with a trigger for revisiting

- **Formula compiler, expansion manifests, convoys:** revisit when real multi-step work repeatedly needs manual dependency/materialization handling (GC-007, GC-009, GC-012; PS-023).
- **Elastic pools and warm runtime reuse:** revisit when startup or idle capacity is a measured constraint, after ownership/recovery pass (GC-025, GC-029–031, GC-053; PS-025).
- **Architecture arenas and swarms:** use selectively for a substantive uncertainty with a measurable rubric; broader automation follows successful single-task loops (GC-017; PS-049–052).
- **Computed merge frontiers and dedicated stack ownership:** add when the user actually wants multi-PR integration managed; repository permissions and PR policy still apply (PS-040–047).
- **Automatic tracker write-back:** add after read-only reconciliation is trustworthy, with field authority, mutation idempotency/read-back, permission and conflict handling (GC-055, GC-067; PS-068–071).
- **Broader event/routine discovery:** add when there are useful recurring tasks and explicit source/priority limits (GC-045–046; PS-068–074).
- **Sophisticated context-pressure handoff:** add per-provider support when the shared turn packet is insufficient; do not assume universal compaction hooks (GC-048–050; PS-008–009, PS-036–037).
- **Independent emergency spool, richer exports and retention tiers:** add when observed substrate faults or long-running evidence volume justify them; keep initial health failures visible and artifacts durable (GC-060–065; PS-016, PS-039).

These are preserved options, not an automatically activated backlog. Start each iteration with a concrete failure or user outcome, choose the matching concept, and specify the proof before expanding the system.

## Cursor additions and changed lessons

The [Cursor catalog](cursor-projects.md) separates public Projects behavior from experimental swarm architectures. Its CU IDs add choices to this library; they do not declare those mechanisms implemented in GLaDOS.

| Constraint                                   | Cursor concepts                | Relationship to existing ideas | T3 decision to evaluate                                                            |
| -------------------------------------------- | ------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------- |
| Coordinator loses responsiveness             | CU-004–005, CU-016             | GC-001, GC-029; PS-021–022     | Keep takeover in a separate execution attempt; measure acknowledgement latency     |
| Repeated discovery is forgotten              | CU-006, CU-015, CU-017, CU-027 | GC-047–050; PS-006, PS-008–009 | Curate scoped, versioned knowledge with provenance and supersession                |
| Recurring work produces churn                | CU-018–020                     | GC-045–046; PS-065–066         | Deduplicate event-created candidates and budget gardening separately               |
| Workers choose incompatible designs          | CU-010–013                     | GC-010, GC-068; PS-049–055     | Track interface decision ownership; reconcile conflicts selectively                |
| Cheap model savings disappear in rework      | CU-002, CU-009, CU-029         | GC-013, GC-052; PS-022–023     | Measure whole verified-outcome cost per environment and recipe                     |
| Claimed verification gives false confidence  | CU-014, CU-030                 | GC-021–023; PS-010–020         | Independent checks and server-captured candidate evidence before stronger autonomy |
| Process recovery becomes accidental takeover | CU-021–022, CU-024–026         | GC-032–038, GC-056–057         | Separate placement claims, execution identity and approved leadership              |

Two distinctions matter. Cursor's January/February research found a central integration bottleneck; July describes targeted neutral conflict resolution. These placements are not equivalent, so neither “always add an integrator” nor “never add an integrator” follows. Similarly, hierarchical planning inside one initiative does not contradict independent environment authority: it does not grant a planner permission to elect itself fleet leader.

## Editorial workflows and non-code outcomes

The [Hermes media-team catalog](hermes-media-team.md) extends the same architecture to work with subjective quality and several destinations. HM-001–005 sharpen decision ownership, candidate rejection and explicit handoff repair. HM-006–008 add combined-output review and self-contained approval packets. HM-009–011 turn feedback into proposed knowledge before it becomes shared policy. HM-012 separates acceptance from publication, HM-013–014 keep staffing proportional, and HM-015–016 distinguish enforced completion contracts from infrastructure retries and editorial revisions.

For GLaDOS, the useful addition is not a fixed six-bot roster or a mandatory Obsidian dependency. It is a versioned result packet, a review of the combined outcome, and an inspectable route for lessons to become approved rules. The author-supplied growth figures are not validation of these mechanisms. Official Hermes sources and narrow implementation inspection are recorded separately in that catalog.
