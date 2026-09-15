# Cursor Projects and orchestration concepts

Cursor's most useful contribution to GLaDOS is a way to turn repeated agent work into an improving operating system for a body of work. The opportunity is to preserve reusable knowledge, keep coordination responsive, and spend verification effort where it changes outcomes. Increasing worker count is downstream of those capabilities.

This catalog distinguishes documented product behavior, reported research, and proposed T3 adaptations. Sources were checked on September 11, 2026. Projects launched in beta on September 10; the newest product announcement matters more for product claims than January's widely circulated swarm experiment. Cursor's internal Projects implementation and prompts were not available for inspection. The research harness, Cloud Agents runtime, Router, and Projects are related publications, not proven to be one identical implementation.

## Projects: what is actually public

Projects introduces a coordinator for an enduring body of work. It delegates implementation, retains shared files across participating machines, and responds to subscriptions. Its cloud execution can enlist local agents for machine-specific testing. The announcement describes feature development, migrations, and ongoing maintenance; its productivity numbers are internal reports, not controlled evidence of quality or a concurrency guarantee. [1]

The release notes independently confirm the product's beta rollout and coordinator-centered interaction. They do not disclose the coordinator prompt, task-store schema, memory conflict algorithm, worker fencing, or failover rules. [2]

A Cursor Project is closer to a durable initiative than T3's environment-local project directory. For T3, an initiative could be “maintain the game,” “upgrade the home server,” or “migrate the UI.” Treating those initiatives as distinct portfolios under an environment's GLaDOS would prevent one long conversation from becoming the sole container for unrelated obligations. This is a T3 design proposal, not another elected leader or a change to the existing project identity.

## Earlier research and what changed

These CU-001–015 entries record the evolution behind the product story. They do not establish that Projects ships the identical harness.

## January: coordination experiments

Source: Wilson Lin, [Scaling long-running autonomous coding](https://cursor.com/blog/scaling-agents), **2026-01-14**. The following three entries summarize reported experiments; the adaptation sentences are proposals.

- **CU-001 — Give work an accountable owner.** Equal-status agents coordinating through a locked file stalled and avoided difficult work; optimistic concurrency improved mechanics but not responsibility. **GLaDOS proposal:** keep claims transactional in T3 and require an owner for each unresolved outcome.
- **CU-002 — Match models to roles.** Planner and coding aptitude differed; historical model rankings were experiment-specific. **GLaDOS proposal:** evaluate the configured model pairs on actual tasks instead of hardcoding brand rankings or equating coding benchmarks with planning skill.
- **CU-003 — Reassess completion and drift.** An earlier design used a judge and fresh cycles; overly long agents and missing completion-triggered wakeups remained problems. **GLaDOS proposal:** separate worker-stop receipts from outcome verification, and test bounded recovery when a coordinator stops responding.

The article described research intended to inform future capabilities. Its throughput claims are not production-reliability evidence.

## February: why one omnipotent executor failed

Source: Wilson Lin, [Towards self-driving codebases](https://cursor.com/blog/self-driving-codebases), **2026-02-05**. Reported lessons:

- **CU-004 — Limit coordinator duties.** One continuous executor mixed planning, coding, review and merging, then stalled or claimed premature success. **Proposal:** GLaDOS delegates implementation and audits outcomes; server machinery handles delivery and admission.
- **CU-005 — Grow ownership recursively.** Noncoding planners delegated narrower scopes to subplanners. Isolated workers returned handoffs with findings, concerns and deviations that reawakened planners. **Proposal:** add structured findings and changed assumptions to task results.
- **CU-006 — Rewrite working memory.** Freshness used rewritten scratchpads, summarization and alignment reminders. **Proposal:** replace stale brief summaries with versioned current decisions; retain the audit log separately.
- **CU-007 — Separate experiments from release.** A central integrator bottlenecked throughput; research tolerated temporary breakage and proposed a clean release branch. **Proposal:** keep exploratory candidates isolated; acceptance still requires verified evidence.
- **CU-008 — Specify operational intent.** Missing performance expectations, resource controls and dependency philosophy caused problems; disk and compilation became constraints. **Proposal:** put measurable latency and dependency rules in task criteria, with runtime limits enforced outside prompts.

Experimental browser; one large VM.

## July: stronger planning, cheaper execution, institutional memory

Source: [Agent swarms and the new model economics](https://cursor.com/blog/agent-swarm-model-economics), **2026-07-20**. Research, with proposed adaptations:

- **CU-009 — Reduce ambiguity before cheap execution.** Frontier planning with cheaper workers reduced costs. **Proposal:** compare total verified-outcome cost, including retries and review.
- **CU-010 — Partition design decisions.** Delegated subtrees must not independently decide the same question. **Proposal:** include decision ownership in assignment context.
- **CU-011 — Reconcile decisions, not just files.** Shared design documents had compile-checked references and a reconciler. **Proposal:** invalidate dependent tasks when an approved interface decision changes.
- **CU-012 — Neutral merge assistance.** Neutral agents resolved conflicts. **Proposal:** request conflict-specific help without a universal gate.
- **CU-013 — Address structural contention.** Agents flagged oversized files; commits paused while another decomposed them. **Proposal:** track hotspots before increasing concurrency.
- **CU-014 — Vary review context.** Different models and transcript/code visibility found different problems. **Proposal:** test independent, artifact-only verification against self-review.
- **CU-015 — Curate successor memory.** An agent-owned Field Guide injected its line-limited index at startup. **Proposal:** add bounded, scoped lessons with provenance and expiration.

Also: custom VCS, compiler-visible breakage, held-out SQLite tests. Benchmark success is not general reliability.

## New product and infrastructure concepts

Each CU entry is a stable concept reference. “Proposed proof” is a test we should require before adopting it, not a test already performed.

### CU-016 — Keep the coordinator available

**Documented:** Projects' coordinator delegates coding to other agents. [1]

**T3 proposal:** Keep the elected thread focused on decisions and communication. A requested takeover should create a stronger execution attempt with its own context, leaving the elected thread available. Measure the delay between a new user instruction and acknowledgement while workers are busy. Avoid foreground waits that occupy the only conversational control path.

**Proposed proof:** Start a slow implementation and deliver a priority reversal; the coordinator acknowledges it without waiting for the implementation to finish. Cancellation must still be confirmed by the runtime before replacing its writer.

### CU-017 — Memory is a maintained work product

**Documented:** Project agents contribute research, artifacts, testing instructions, and learned preferences to shared files synchronized across local and cloud machines. [1]

**T3 proposal:** Introduce scoped knowledge records separate from task status: claim, applicability, source evidence, validated revision, author, and supersession. Require a task result to suggest reusable discoveries, without making every suggestion authoritative. A user correction can update a preference explicitly; an external bug report cannot grant permissions.

**Proposed proof:** Worker A discovers the correct verification command. A fresh worker B receives it after a coordinator restart. A contradictory discovery is visible as a conflict, not silently overwritten.

### CU-018 — Subscriptions generate candidates

**Documented:** Projects can react to schedules, Slack, and PR events. [1]

**T3 proposal:** Store subscription scope, trigger identity, deduplication key, recipe version, concurrency allocation, and permitted action. Convert an event into a candidate task before dispatch. Keep authorization separate from the triggering text. Coalesce repeated pushes and suppress events generated by the automation itself where appropriate.

**Proposed proof:** Replaying the same webhook creates one obligation; a burst of pushes yields work for the latest relevant revision without losing an unresolved failure.

### CU-019 — Retain responsibility after delivery

**Documented:** Cursor describes Projects continuing with monitoring and bug reports after a feature ships. [1]

**T3 proposal:** Give an initiative an explicit lifecycle and maintenance allocation. “Feature accepted” should end its implementation task but may leave an authorized monitoring subscription. Show the distinction in the UI so completed work does not conceal perpetual activity.

**Proposed proof:** A post-release regression links to the original decision and verification evidence without reviving or rewriting the original completed task.

### CU-020 — Calibrate autonomy from observed corrections

**Documented:** Cursor's migration example reduces close review as the approach proves itself; its gardening example converts repeated mistakes into lint rules. [1]

**T3 proposal:** Track intervention reasons and regression escapes per recipe. Suggest wider autonomy after repeated success, but preserve the user's explicit approval requirement for leadership and permission changes. Promote recurring corrections into executable checks only after validating that the rule has useful precision.

**Proposed proof:** A linter rejects the known mistake and accepts legitimate counterexamples. A history of success does not silently widen authority.

### CU-021 — Durable execution is distinct from durable chat

**Author report:** Cursor replaced an early work-stealing loop with Temporal, then moved from indefinite workflows to shorter task workflows and more explicit timeout/retry activities. [3]

**T3 proposal:** Preserve T3's existing event and receipt architecture. Audit each boundary—launch, tool execution, result persistence, acceptance—for idempotency and recovery before considering another workflow engine. Long-lived GLaDOS identity should not require one immortal process or one endlessly expanding execution record.

**Proposed proof:** Crash after a tool effect succeeds but before its receipt persists; recovery must reconcile the existing effect rather than duplicate it.

### CU-022 — Separate conversation, reasoning, and machine lifecycles

**Author report:** Cursor separates these components; subagents can outlive parents, and retried partial output can be rewound in the client stream. [3]

**T3 proposal:** Keep distinct attempt, provider session, worker machine, conversation, and artifact identities. A disconnected UI must not imply cancellation; a replacement process must not imply new ownership. The UI should distinguish replayed/replaced output from an agent changing its conclusion.

**Proposed proof:** Restore a run after a machine interruption without losing its artifacts or displaying two final answers for one attempt.

### CU-023 — Repair the environment before blaming the model

**Author report:** Cursor identifies incomplete development environments as a recurring cause of subtly worse results, and describes moving workflow policy toward tools as models improve. [3]

**T3 proposal:** Before assigning expensive recovery, distinguish missing dependencies, credentials, stale fixtures, unavailable services, implementation failure, and unclear requirements. Reuse the pstack verification CLI as an environment diagnostic. Grant environment repair its own scope; failure to access production is not permission to broaden access.

**Proposed proof:** Deliberately remove a test dependency. The system reports an environment blocker, restores only authorized setup, and does not record a model-quality failure or false verification pass.

### CU-024 — Route execution by capabilities

**Documented:** Self-Hosted Machines keeps Cursor's planning/inference in its cloud while an outbound-connected worker executes tools locally. Pools serve requests, and idle machines can be retained or hibernated. [4]

**T3 proposal:** Model hardware, operating system, toolchain, reachable services, available provider instances, and verification capabilities separately from leadership. A Mac can be the verification destination without becoming the coordinator. Record the selected destination and why it is eligible.

**Proposed proof:** Route an iOS build to an eligible Mac and reject a Linux-only destination. An unavailable destination leaves the task waiting with an explanation rather than inventing local capability.

### CU-025 — A placement claim does not prove a writer stopped

**Documented API:** Cursor exposes atomic pending-request claims associated with stable worker IDs. Its release endpoint explicitly drops routing affinity without interrupting an existing connected worker's turn. [5]

**T3 proposal:** Keep placement reservations and write authority separate. An executor replacement requires a confirmed stop or a fence the destination enforces. Never use a UI disappearance, expired routing claim, or network timeout as proof that the old writer cannot act.

**Proposed proof:** Release placement while a worker remains alive. A competing writer must be rejected until the old writer's authority is resolved.

### CU-026 — Observe demand instead of polling models

**Documented API:** Cursor provides pending-request listing and an SSE watch alongside worker/pool endpoints. [5]

**T3 proposal:** Let deterministic infrastructure queue work, report demand, and enforce capacity. Give GLaDOS actionable events and decisions rather than asking it to poll for idle capacity. Add bounded queue age and blocked-reason visibility before elastic machine creation.

**Proposed proof:** Two schedulers receive one queued request simultaneously; only one assignment is admitted. Reconnecting the event stream does not lose or duplicate the obligation.

### CU-027 — Automation memory needs scope and correction

**Documented:** Cursor Automations keeps editable persistent named memories outside the worker filesystem, enabled by default. The docs explicitly warn that untrusted inputs can poison future memory. [6]

**T3 proposal:** Separate observed claims, tentative lessons, verified recipes, and user-authorized preferences. Track provenance and make deletion/supersession effective in future context packets. Do not synchronize company-specific knowledge to unrelated personal or employer environments merely because they share a coordinator UI.

**Proposed proof:** A malicious tracker item asking to change standing permissions remains an untrusted observation. Removing a bad memory prevents it from being injected into a new worker.

### CU-028 — Specialize where intermediate output is expensive

**Documented:** Cursor's subagents begin without the parent's conversation. Explore, Bash, and Browser isolate noisy operations; the parent receives results rather than all intermediate output. [7]

**T3 proposal:** Select subagent boundaries by context cost and task independence, not titles such as “CTO.” Pass a sufficient brief with evidence pointers; return conclusions, uncertainty, artifacts, and outstanding obligations. An independent verifier should not simply receive the implementer's confident conclusion as its rubric.

**Proposed proof:** A noisy browser investigation returns bounded findings with retrievable evidence. A missing prerequisite causes a question, not guessed context.

### CU-029 — Learn routing from outcomes, with switching cost

**Author report:** Cursor Router first estimates whether an economical model suffices, then uses task/domain characteristics to select among stronger models under an average-cost target. Its signals include subsequent user corrections and actual token costs, including cache effects. Reported evaluations include held-out and live traffic. [8]

**T3 proposal:** Begin with the user's one or two configured worker choices and an explicit routing explanation. Record task class, model/options, environment, verified outcome, intervention, elapsed time, and observed usage. Only derive stronger routing policy when there is enough local evidence. Unknown subscription costs remain unknown rather than fabricated API spend.

**Proposed proof:** Compare accepted outcomes per total cost, including failed attempts and review, across representative tasks. Do not equate “the user stopped replying” with correctness. Never assume per-turn model switching is supported by every T3 provider.

### CU-030 — Evaluate the verifier and the reward signal

**Author report:** Cursor found substantial answer retrieval in historical coding benchmarks and evaluated stricter history/network controls. It distinguishes benchmark contamination controls from normal productive tool use. [9]

**T3 proposal:** Keep hidden or independently maintained checks for critical recipes. Include false-pass cases, tampered tests, stale artifacts, and unsupported claims. Production debugging may legitimately use history and online documentation; a blanket restriction would confuse useful tool use with evaluation leakage.

**Proposed proof:** A worker that changes the test to accept broken behavior does not receive acceptance. Run the original or independently owned check against the exact proposed candidate.

## Where the defensible advantage may come from

The following is analysis for T3, not disclosure of Cursor's private internals.

**Reusable knowledge reduces repeated setup costs.** GLaDOS currently recovers a brief and task summaries; that restores obligations but not necessarily the discovery that made the last task easy. A maintained knowledge layer could reduce the cost of every subsequent worker, including cheaper models. Its benefit should be measured by fewer setup failures and corrections, not by the number of memory files created.

**Responsiveness requires reserved capacity.** Merely telling a coordinator not to code does not guarantee it is reachable: a long tool call, huge inbox, or model outage can still occupy it. Keep intake and cancellation infrastructure independent, cap management-turn work, and reserve some execution capacity for verification and recovery. “Ten workers” should not mean ten implementers and no way to check or repair their output.

**The unit of optimization is an accepted change.** Cheaper inference can increase retries, review burden, merge conflicts, and machine time. Conversely, a more expensive planner can reduce the amount of worker work required. Measure the whole path from candidate selection to accepted result, and include user attention. This is a more useful target than PR count or tokens per individual call.

**Architecture and integration are coordination problems too.** Independent workers can each produce locally reasonable code that disagrees on types, interfaces, or user behavior. The GLaDOS adaptation should distinguish design decisions, filesystem ownership, and final integration. More workers are beneficial only when the work can be split without multiplying those disagreements.

**A subscription is an ongoing obligation.** It needs an owner, a budget, a pause mechanism, an event cursor, and a rule for when no action is appropriate. A gardening system that creates cosmetic churn on every PR can be worse than no gardener. Measure the precision of its interventions and give each recurring recipe explicit exit or escalation conditions.

**Environment federation remains our own requirement.** Cursor's documented cloud control plane is not evidence for leaderless coordination between independent T3 servers. Preserve one elected GLaDOS per environment and explicit approval for shared coordination. Sharing a tested recipe is a data exchange; transferring task ownership, credentials, or permission is a different operation.

## Concrete implications for GLaDOS

These are design options, not an implementation plan or an authorized backlog.

| Current constraint                             | Candidate adaptation                                                         | Evidence that would justify adoption                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Brief survives but learned techniques are lost | Scoped knowledge records with provenance, validity and supersession          | Fresh workers reuse a proven recipe after restart; stale recipes are rejected  |
| Acceptance relies on agent reports             | Verification runs captured by T3 against immutable candidates                | A fabricated pass and modified-test trick both fail admission                  |
| Ten workers can create ten conflicting changes | Workspace admission for every assignment plus explicit integration ownership | Shared checkout collision rejected; integration tested against current base    |
| Coordinator can become the bottleneck          | Async execution attempts and bounded management turns                        | Priority changes acknowledged while slow workers continue                      |
| Automatic work is mostly backlog-driven        | Durable subscriptions producing deduplicated candidates                      | Replay and event storms do not duplicate work or bypass limits                 |
| “Cheap” is an unmeasured label                 | Per-environment routing observations and task-specific guidance              | Improvement in accepted outcomes per measured spend and intervention           |
| Offline task homes cannot move                 | Explicit handoff proposal with artifacts and writer fencing                  | Delayed old worker cannot mutate after an approved transfer                    |
| Long-lived backlog reaches a hard cap          | Archived tasks, paged history and bounded context retrieval                  | Thousands of historical tasks do not expand ordinary prompts or block new work |

A useful first experiment is one small initiative with a real recurring failure: for example, keep the GLaDOS settings consistent with native T3 controls. Record the UI conventions and browser recipe, reproduce a known inconsistency, dispatch one bounded fix, verify the exact result, and retain the validated lesson. Then repeat with a fresh economical worker. That tests learning, context transfer and verification without needing a fleet.

## Public reception check

On September 11, 2026, URL-restricted HN Algolia story searches returned zero results for both `cursor.com/blog/projects` and `cursor.com/changelog/projects`; an exact-title search for “Cursor Projects” also returned zero. A broader Cursor search over September 8 onward found related submissions but not this announcement. The [Cursor-domain submission listing](https://news.ycombinator.com/from?site=cursor.com) likewise did not list Projects. This is a time-bounded negative finding, not proof no deleted, differently titled, differently linked, or not-yet-indexed submission exists.

The product was announced one day earlier. Ordinary submission timing and incomplete indexing are plausible explanations; the public evidence does not establish the cause. The same domain listing showed the July swarm article with 278 points and 143 comments, so there is no basis here to infer a blanket restriction on Cursor or agent orchestration. Reader fatigue, deliberate withholding, and moderation are unverified hypotheses and should not be treated as findings. Absence of discussion does not establish either novelty or lack of value.

## What is still unknown

- Projects' coordinator prompt, model policy, thinking defaults, scheduling rules, and maximum practical concurrency.
- Whether Projects uses the exact planner tree, judges, Field Guide, or reconcilers from the research experiments cataloged below.
- Shared-file conflict resolution, indexing, memory promotion, deletion propagation, retention and cross-project access semantics.
- Whether a completed worker result has server-captured verification provenance or primarily agent-generated evidence.
- Projects-specific crash recovery, reassignment fencing, branch integration and subscription delivery guarantees.
- Independent measurements of the productivity claims, including task selection, cost, review effort and regressions.

The public product posts and docs inspected here do not settle these questions. A future hands-on product trial could test observable behavior, but would still not reveal private implementation details. “Thousands of subagents” must not be converted into a tested concurrency guarantee for T3.

## Sources

1. Alexi Robbins and Fredrika Lindh, Cursor. [Introducing Projects](https://cursor.com/blog/projects). September 10, 2026. Product announcement; reported internal outcomes.
2. Cursor. [Cursor Projects](https://cursor.com/changelog/projects). September 10, 2026. Release notes; corroborates beta behavior, not independent evidence.
3. Josh Ma, Cursor. [What we've learned building cloud agents](https://cursor.com/blog/cloud-agent-lessons). June 2, 2026. Infrastructure account; not inspected private implementation.
4. Jack Pertschuk, Cursor. [Run cloud agents on machines you manage](https://cursor.com/blog/self-hosted-machines). September 2, 2026. See also [Self-Hosted Machines documentation](https://cursor.com/docs/cloud-agent/self-hosted), accessed September 11, 2026: local execution still returns tool content and artifacts to Cursor; it is not fully local inference.
5. Cursor. [Cloud Agents API: workers, pools and claims](https://cursor.com/docs/cloud-agent/api/endpoints#claim-a-pending-request). Undated living reference, accessed September 11, 2026. Routing claims are explicitly distinct from process termination.
6. Cursor. [Automations: memories](https://cursor.com/docs/cloud-agent/automations#memories). Undated living reference, accessed September 11, 2026. Related [Automations announcement](https://cursor.com/blog/automations), March 5, 2026, describes cross-tool workflows including task deduplication as an agent workflow, not a general consistency protocol.
7. Cursor. [Subagents](https://cursor.com/docs/subagents). Undated living reference, accessed September 11, 2026. Public subagent behavior must not be assumed to specify all Projects internals.
8. Connor O'Keefe and Yuri Volkov, Cursor. [How Cursor Router chooses the right model for the task](https://cursor.com/blog/how-cursor-router-works). August 6, 2026. Routing methodology and results are author reports; current model rankings are not enduring configuration advice.
9. Naman Jain, Cursor. [Reward hacking is swamping model intelligence gains](https://cursor.com/blog/reward-hacking-coding-benchmarks). June 25, 2026. Benchmark-specific study; no reproduced benchmark in this catalog.
