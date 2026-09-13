# Captured verification: design and proposal

GLaDOS should deliver outcomes that users can inspect without reopening every worker conversation. Today, a lead can report checks, but T3 does not capture their execution. This proposal adds server receipts while preserving the distinction between mechanical verification and engineering judgment.

Users approve a versioned project recipe containing readiness, verification, cleanup, timeout, and artifact requirements. Leads request verification of the committed candidate through the existing work API. The environment creates a disposable checkout, executes approved commands, captures output, and preserves artifacts through authenticated attachment storage.

Receipts identify the candidate, criteria version, recipe version, exit results, and coverage limitations. Failed readiness, unavailable artifacts, timeouts, and interrupted execution remain inconclusive. Candidate or recipe changes invalidate acceptance. Agents cannot edit approved recipes or submit fabricated captured receipts.

The lead reviews the integrated outcome and reports to GLaDOS. Its delivery card presents captured results, review evidence, artifacts, and unresolved concerns together. Human acceptance remains distinct from publishing or deployment.

Implementation stays inside Fold’s work subsystem, with one runtime registration and shared contracts. Initial verification is serialized per environment. Tests exercise integration failure, missing dependencies, stale evidence, and restart recovery. Success means fewer human interventions per accepted outcome, without claiming that passing checks establish quality.
