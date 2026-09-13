# Keep captured verification separate from review judgment

GLaDOS previously accepted agent-reported evidence without an execution receipt. We will capture checks in Fold's work subsystem, binding each result to an immutable candidate commit, acceptance-criteria version and user-approved project recipe; provider adapters remain unaware of verification policy. A lead's review remains a distinct judgment because executing a recipe cannot establish its adequacy or product quality.

Recipes are approved host commands. A disposable clone isolates candidate files, not host permissions or network access. Agents can request execution but cannot rewrite recipes or manufacture captured receipts. Readiness failures, timeouts, missing artifacts and interrupted runs remain inconclusive. Restart never automatically repeats a run marked started, because the previous command may have produced external side effects.

Evidence and artifacts survive checkout cleanup. Recipe changes invalidate prior acceptance. The first runner is local to the task's environment, serializes verification, and uses existing process and authenticated attachment services. This deliberately avoids a new provider protocol, distributed execution service or generic workflow engine, keeping upstream integration confined to runtime registration and client entry points.
