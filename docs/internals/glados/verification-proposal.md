# Outcome verification: design and proposal

GLaDOS coordinates outcomes across software, games, music, research, household tasks, and server operations. It remains your communication point, assigning bounded work directly or delegating sustained context and judgment to project leads.

Verification follows the task, rather than assuming every project produces a code commit. Each assignment selects an approved evidence profile: candidate identity, execution environment, prerequisites, checks, artifacts, qualitative review, freshness, and permitted effects. Projects supply defaults; leads choose within your approved scope.

T3codefold needs regression and client evidence. Muster needs gameplay and multiplayer checks. DynoGen needs reproducible renders and listening review. Housing needs source provenance and freshness alongside application checks. Server operations need observations of the intended host and recovery conditions. Explorations may conclude with findings or a negative result.

GLaDOS receives the outcome, evidence, limitations, and decisions requiring you. Environment capabilities constrain placement; unavailable hardware or services mean blocked or inconclusive work. Connected coordinators retain ownership; shared leadership changes require your approval.

This PR implements commit, artifact, and observation runners with task selection, receipts and review. Commands remain approved host operations; readiness checks establish capabilities. GLaDOS cannot silently change attempted tasks’ proof requirements. Cross-environment dispatch remains manual. Extensions preserve provider neutrality and Fold’s narrow integration with upstream T3.
