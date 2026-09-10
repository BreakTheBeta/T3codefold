# GLaDOS scope and iteration constraints

This catalog is retained in the repository at the maintainer's request so future GLaDOS iterations can draw on the source research. It is a design reference, not executable agent instructions or an automatically authorized backlog. Catalog dispositions were recorded during initial design; “MVP” there describes a proposed invariant, not proof it shipped.

## Product constraints

- An elected, pinned thread per environment retains the user's priorities, quality expectations, and limits. Proactive work stays within those agreements.
- Environments are independent by default. There is no mandatory global leader. A shared coordinator change requires explicit approval at both participating environments; silence or an offline peer never grants authority.
- T3 owns durable task identity, attempts, messages, context and acceptance. Providers remain interchangeable. A task, a conversation, and an execution attempt are distinct identities.
- Cheap workers receive bounded assignments and meaningful verification. A stronger worker can resume a stopped candidate without discarding its history. Model price is not evidence of correctness.
- Personal work, exploration, home-server operations, game development and tool improvement need different evidence. External tracker workflow and T3 acceptance remain distinct.

## Implemented pilot and remaining ideas

The pilot includes durable brief/task state, context injection, bounded assignment and retained-worktree takeover, worker evidence plus independent agent verification, and a shared MCP/CLI work contract. Web/desktop and mobile expose the role and work controls. Read-only task adapters cover Vikunja, Jira and Linear.

Two peers may coordinate a shared tracker scope with durable commands, task observations, messages and application receipts. Work executes at its fixed task home. Coordinator changes preserve that home and require resolved workers. This is a deliberately small peer protocol, not general multi-party consensus or automatic failover.

Live experiments exercised a local execute/verify/accept loop, remote assignment and acceptance with browsers closed, deliberately failed Luna work resumed by Sol in the same worktree, and restart preservation. Vikunja was tested live; Jira/Linear used fixtures. Mobile was typechecked, not exercised in an emulator. These small sandbox experiments do not establish sustained performance on large projects.

Revisit these gaps when the corresponding need is observed:

| Need                                     | Candidate iteration                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| More than two peers or movable execution | Separate authority, task-home migration and execution placement; require explicit reconciliation and fencing       |
| Long-running or high-volume backlog      | Paged projections, task-history retrieval, evidence retention and durable wait subscriptions                       |
| Stronger verification provenance         | Server-captured artifacts, verifier maintenance, known failing checks and criteria/candidate binding               |
| Predictable resource usage               | Time/money budgets and measured escalation policies; existing limits are not a process sandbox or global spend cap |
| Richer recurring work                    | Versioned recipes, triggers, gardening budgets and useful-work measurements                                        |
| External tracker mutation                | Field ownership, checkpointed sync, idempotent writeback and explicit conflict handling                            |
| Broader provider confidence              | Real provider/native-client matrices and fault-injection exercises                                                 |

Use the [crosswalk](crosswalk.md) to select concepts and their stable GC/PS IDs. Add a concrete outcome and a failure-capable check before extending the protocol. Historical throughput claims from the supplied pstack articles remain author reports, not validation of this implementation.
