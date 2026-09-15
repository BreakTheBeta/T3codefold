# Project leadership and context ownership

This reference records the project-lead design and its first implementation boundary. It preserves the maintainer’s choice: GLaDOS is the single conversational point of contact and chooses a direct worker or a project lead according to the work. The execution plan belongs outside this reference library.

## Choose ownership according to the work

A direct worker owns one bounded result. A project lead owns a project’s continuing understanding and decisions: what we are trying to achieve, how the parts should fit, why important choices were made, which evidence we trust, and what remains unresolved. Delegating a project means delegating these decisions within a charter, not merely forwarding a list of tasks.

GLaDOS should use a direct worker for a self-contained fix, investigation or experiment. Introduce or reuse a project lead when related work repeatedly needs orientation, shared design decisions, dependencies, several workers or a combined review. One hard task does not automatically need a lead. Record a short reason for introducing the lead so we can evaluate whether the added coordination helped.

Start with one reusable lead per environment-local project and one level below GLaDOS. Allow direct assignments alongside it when their scope is independent. Every task has one management owner; GLaDOS intervenes through an explicit reassignment instead of silently competing with the lead. A lead can become dormant without losing its thread or project record. New relevant work can reactivate it within the current brief.

## What the sources support

| Source                                | Lesson used here                                                                                            | Boundary                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Gas City GC-001, GC-013, GC-028–032   | Separate configured responsibility, context affinity, durable identity and active execution                 | A persistent role does not need a continuously running model                                      |
| Gas City GC-037–049                   | Route durable work, persist messages before wake, retrieve current instructions, restore context at startup | Delivery is not processing or successful work                                                     |
| pstack PS-021–025, PS-032–039         | Proportionate subcoordination, complete briefs, upstream context, bounded retries and durable decisions     | Do not add a mandatory management stage to every task                                             |
| Cursor CU-005–006, CU-010–016, CU-028 | Divide decision ownership, maintain current memory and preserve the coordinator’s attention                 | Local hierarchy does not establish global authority                                               |
| Hermes HM-001, HM-004–013             | Explicit role contracts, intent-preserving handoffs, combined review and selective memory                   | Accepted knowledge differs from draft observations; acceptance differs from permission to publish |

The optional Gas City Gastown pack gives useful but partial analogies. Its [Mayor](https://github.com/gastownhall/gascity-packs/blob/33d3a430a67d1782ad364556cb566bdb01d0afe3/gastown/agents/mayor/prompt.template.md) delegates to preserve coordination context. Its [crew prompt](https://github.com/gastownhall/gascity-packs/blob/33d3a430a67d1782ad364556cb566bdb01d0afe3/gastown/assets/prompts/crew.template.md) describes persistent identity and workspace, but crew is a worker reporting to the human, not this proposed project lead. Its [Witness](https://github.com/gastownhall/gascity-packs/blob/33d3a430a67d1782ad364556cb566bdb01d0afe3/gastown/agents/witness/prompt.template.md) monitors worker health while the controller owns processes; it is not the project architect. These are configuration examples at the inspected revision, not an exact hierarchy to copy or proof of automatic price-based model routing.

## Delegate a charter and retain a project record

The charter names the outcome, project and task scope, decisions the lead may make, decisions it must escalate, quality expectations, model choices and worker allocation. Effective authority is always bounded by the current GLaDOS brief and environment permissions. A lead can refine implementation tasks and choose workers within that charter; it cannot change portfolio priorities, grant itself environments, weaken agreed acceptance or create another management tier.

The durable project record has three distinct parts:

- Current understanding: goals, relevant entry points, constraints, verified procedures, artifact references and open questions.
- Decisions: the choice, concise reason, owner, scope, supporting source, revision and any superseding decision. This records explainable rationale, not hidden model reasoning.
- Proposed learning: worker discoveries and possible preferences awaiting validation or approval. Rejected experiments remain traceable without becoming default instructions.

Leads may maintain project facts and make local design decisions within their charter. A change to the user’s taste, permanent quality standards or authority remains a proposal through GLaDOS. References identify their project and source revision; shared management does not make one employer’s private context available to another.

Tasks capture the relevant charter and decision revisions at dispatch. A consequential decision change creates a visible reconciliation obligation for affected work. The lead explicitly keeps, amends or replaces those assignments; existing writers do not silently receive a new interpretation of success. Preserve the original evidence and require review against current criteria.

## Inject different context at each level

Use T3’s existing provider-turn context boundary for every supported provider, start and resume. Record which versions were delivered. Do not require a particular provider’s compaction hook.

| Recipient    | Routine context                                                                                                                        | Retrieve on demand                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| GLaDOS       | User brief, portfolio priorities, current leads, concise project outcomes, pending decisions, blockers and available capacity          | Project decisions, task evidence and lead history                  |
| Project lead | Charter, effective limits, current project record, changed decisions, owned tasks, relevant inbox and worker capabilities              | Scoped source material, detailed evidence and historical decisions |
| Worker       | One outcome, acceptance and verification, relevant design decisions, upstream accepted artifacts, workspace and escalation destination | Additional context for its assignment                              |

Hard constraints must survive summarization. If the applicable constraints cannot fit, narrow the assignment. Bounded indexes and scoped retrieval prevent the project record from becoming another enormous prompt. Retained conversation history is useful evidence but must be checked against current records.

## Report through GLaDOS and wake only for obligations

Workers report to their task’s current management owner. Leads handle ordinary questions and repairs and report milestones, blockers, changed assumptions, combined evidence and decisions needed to GLaDOS. GLaDOS translates those into the user’s portfolio view. Inspecting a lead thread is optional; it must not become necessary to answer routine approvals.

Persist report identities and task/project references before waking the recipient. Coalesce changes into an idle-boundary turn. Reading a message does not consume it; acknowledgement follows a handled obligation. Reassignment changes routing without duplicating unresolved reports, and stale managers cannot mutate work after their authority is revoked. A lead waiting for input should sleep until that input changes instead of repeatedly asking whether work is ready.

A project report should say what outcome changed, which exact artifacts support it, what remains incomplete, and what decision is needed. A list of completed workers is insufficient. Use an ordinary dependency-linked review task to inspect the combined deliverable where tasks interact. GLaDOS receives that review with the project report. This does not claim the current worker-reported verification has become independent or server-executed proof.

## Capacity, recovery and federation

Retain the shared default of ten execution workers across GLaDOS and all leads in the environment. Per-lead allocations are ceilings within that allowance, never fresh pools of ten. For the first implementation, bound automatic project-lead turns to one active turn per environment, separately from worker slots, and leave the user-facing GLaDOS turn available. This avoids ten running workers preventing their lead from processing results. Show coordination activity separately; these limits are not a process sandbox or a dollar budget.

On restart, restore responsibility and pending obligations, then reconcile actual runs before launching replacements. Making a lead dormant requires handing its unresolved obligations back to GLaDOS; it does not kill workers or discard knowledge. Revocation fences management commands immediately, while stopping an executing writer still requires a confirmed runtime transition. Pause means stop new dispatch unless an explicit stop action says otherwise.

Each environment retains its own GLaDOS and local project leads. This local delegation introduces no global boss. The first lead implementation should own only local tasks; existing approved peer work remains mediated by the environment GLaDOS and the fixed task home. Losing a peer never grants takeover. Delegating shared cross-environment project authority requires a separate design and the existing explicit user approval boundary.

## Additions selected for the next iteration

The essential additions are durable project understanding, explicit decision ownership, one management owner per task, scoped context retrieval, targeted durable reports, bounded coordinator activity, reversible lead lifecycle and combined-outcome review. Native clients should make the hierarchy inspectable while preserving GLaDOS as the front door.

Defer recursive lead trees, mandatory specialist rosters, autonomous policy learning, a new knowledge database, cloud provisioning, a general workflow compiler, automatic tracker writes and broader federation. These solve other constraints and are not prerequisites for proving useful project leadership.

The decisive experiment is a small direct task followed by related work that warrants a lead. That lead retains a design decision, delegates bounded workers, rejects an incomplete handoff, reviews their combined output, survives a restart, and hands one coherent result to GLaDOS. Then a fresh worker must use the retained decision without the user explaining it again.

## First implementation boundary

The first implementation adds local lead creation and dormancy, generation-scoped management, task reassignment, versioned project context, owner-routed messages, shared worker admission, one automatic lead turn at a time and native client inspection. The project context is a bounded current document retained through journal history; structured decision dependencies, granular retrieval and automatic stale-decision invalidation remain future work. Leads must explicitly amend task criteria when a decision changes.

Result reports reference accepted tasks and their evidence at report time. They are historical reports, not continuously revalidated certificates. Combined application verification remains the lead’s responsibility: the server enforces task acceptance prerequisites but does not itself execute the verification commands. The review operation lets a manager record its own observation of a stopped retained candidate, labelled coordinator_review; it does not impersonate the worker or claim server-captured proof. Worker report/submit commands tolerate unrelated portfolio revision changes while still enforcing current assignment and criterion identity. Automatic wake suppression is scoped to relevant inputs during a server process lifetime; a restart may repeat an unresolved management turn. Task and launch identities remain durable and retries must not create duplicate writers.

Model and thinking selections use the existing T3 model contract. The agent chooses a lead model through the work API; the client shows its saved configuration. An editable lead-specific model picker and richer decision UI remain follow-ups. Worker configurations continue using the native brief editor.

## Preserve upstream integration boundaries

GLaDOS policy and persistence belong in the fork's dedicated work subsystem. Core T3 integration should remain confined to service registration, role-context injection, existing thread launch and lifecycle observations, and client entry points. Keep provider-specific behavior in the existing adapters. Do not spread lead policy into provider implementations or replace upstream thread machinery to add an orchestration feature.

Upstream integration needs both a merge comparison against the fork baseline and behavioral gates at those service boundaries. A clean textual merge is insufficient: wrapped missing-thread errors, deferred launch, pause, restart and ownership changes must preserve their meaning. Failed launch effects remain visible to GLaDOS; reactivating a lead retries creation only when its thread is absent. Unknown projection errors are not evidence that a writer has stopped.
