# Verify the outcome, choose the right environment

**Design and implementation boundary for PR #19, grounded in the registered projects inspected on 2026-09-13.** The implementation supports task-selected profiles for code commits, files and host observations. Project-specific commands and qualitative reviews still determine whether those mechanisms adequately prove an outcome.

## What the current portfolio tells us

The local T3 project API lists `t3code`, `VibeMinion`, `dynoGen`, `housing`, `t3pebble`, `kartpad`, `tinygrad`, `uni`, and `server`. Project names are handles, not reliable descriptions: VibeMinion's README identifies Muster; housing's README identifies Quietside, a property-comparison application. Home-server work is a separate user requirement, not something inferred from the housing name. Tinygrad, uni and the server entry were listed but not inspected deeply enough to assign them workflows.

| Work                                  | Evidence appropriate to the outcome                                                                                             | Constraint the design must preserve                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| T3codefold, the running control plane | Focused regression checks, relevant client interaction, remote behavior, upstream compatibility review                          | Test in disposable state. A successful check does not authorize replacing the instance coordinating the work.                                        |
| VibeMinion / Muster                   | Engine scenarios, multiplayer journeys, visual or audio evidence when affected, lead gameplay review                            | Fixtures, multiple services and isolated databases may be needed. Engine correctness alone does not prove the game feels good.                       |
| dynoGen                               | Input program and configuration, reproducible audio renders, technical measurements, comparative listening and owner preference | Passing tests or an audio score cannot establish musical taste. Preserve seeds, model versions and reference provenance where relevant.              |
| housing / Quietside                   | Application checks for code; dated sources, explicit unknowns and traceable comparisons for property research                   | Code revision does not identify changing property data. Research completion does not mean a recommendation was accepted or a transaction authorized. |
| P3 / t3pebble and KartPad             | Target build and protocol checks, then emulator or device evidence appropriate to the change                                    | A Linux build or screenshot cannot stand in for a Pebble or Apple-device observation. Missing capabilities remain visible.                           |
| Home-server operations                | Named host/service, observed before/after state, health over an agreed interval, recovery plan and result                       | Inspection, mutation and recovery have distinct scopes. A checkout cannot isolate effects on a running service.                                      |
| Miscellaneous exploration             | Question, sources or experiment inputs, findings, limitations, reusable artifact when useful                                    | No Git repository or predetermined positive answer is required. A supported negative result can satisfy the task.                                    |

These examples come from project README descriptions and the user's requested scope, not execution of those projects' verification suites. Do not copy machine paths, credentials or personal research data into shared project profiles.

## A task chooses an evidence profile

An **evidence profile** is the versioned agreement about what establishes completion for a kind of task. A project offers defaults and may offer several profiles; software work, research and operations can coexist in one project. Profile selection and changes must be recorded on the assignment rather than inferred later from its title.

The agreement identifies the outcome and acceptance criteria; the subject being checked; required environment capabilities; readiness and cleanup; reproducible checks and artifacts; qualitative review; evidence freshness; and authorized effects. A lead may choose among approved profiles within the existing brief. It cannot downgrade required proof after failure. Changing the agreement invalidates affected acceptance, while preserving the original evidence.

Subject identity depends on the work: `commit:<full SHA>`, `sha256:<file digest>`, or `observation:<approved target>`. An artifact is one file, such as an audio render or a JSON research packet containing dated sources, inputs and unknowns. The runner copies and hashes that file, rejects mismatches and detects changes to both the source and checked copy during execution. A profile can retain the file as an attachment. It does not automatically crawl sources or prove their truth.

Observation receipts identify the target, environment, start/end times and optional configuration-file digest. A mandatory lifetime starts at execution start; acceptance checks expiry. Checks must observe any required before/after state or health interval themselves. An old service pass cannot certify current health. Profile changes invalidate the relevant acceptance; changing the task's selection advances its criteria version.

For ad hoc filesystem work, first name the bounded workspace or target and expected result. Being able to access the machine does not make the whole filesystem the task's scope.

## Context, delegation and placement

GLaDOS's durable brief holds cross-project priorities, limits and decision preferences. A project lead retains its project's decisions, selected profiles and unresolved questions. Workers receive only the relevant goal, acceptance contract, approved tools, target environment, constraints and prior evidence. Learning updates should distinguish reusable accepted rules from drafts and one-off results, following the [Hermes knowledge boundary](hermes-media-team.md) and [pstack verification principles](pstack.md).

Use a direct worker for bounded work. Add a project lead when sustained context, several workers or integrated review warrants it. GLaDOS remains the user's communication point and receives a concise outcome, proof, coverage gaps and decisions needed from the user.

Select execution placement from connected environment capabilities: available providers and models, tools, hardware and accessible targets. A capable model cannot compensate for missing target hardware. Do not transfer credentials or private project context merely because another environment is connected. If the target goes offline, preserve local ownership and the pending evidence requirement; report blocked or inconclusive work. Peer environments remain independent, and changes to shared coordinating leadership require user approval. The existing PR does not implement cross-environment verification dispatch or capability negotiation.

## Implemented boundary and remaining limits

PR #19 stores multiple versioned profiles per project and a durable profile selection per task. The selected profile is snapshotted when verification is requested. Old recipes without an ID remain the project default, preserving compatibility. If a project has approved profiles but no applicable default, assignment requires profile selection. Users can explicitly select reported evidence for a task; the UI labels it accordingly, and it is not a captured pass.

Web and desktop support creating, editing, selecting and disabling profiles. Mobile supports selecting approved profiles, requesting checks and inspecting results; profile editing remains in web/desktop. Commands remain provider-neutral through the existing work API. Leads can select before assigning, but only users can change a task's proof requirements after an attempt or choose reported evidence.

Code checks use a detached commit checkout. Artifact checks copy a single file up to 100 MiB from the retained worker workspace (or project root) into a temporary workspace; approve self-contained commands or tools available on the host. A research packet or render can carry reproducibility metadata, but a multi-file dataset is not automatically snapshotted. Required output files are retained, up to five files of 100 MiB each. Binary files are downloadable; the UI does not provide a listening evaluator.

Observations execute in the project workspace. Their profiles require an environment, target, effect policy and freshness. A mismatched host returns inconclusive before any recipe command runs. The effect policy is passed to approved commands and retained in the profile; it is not a sandbox or a shell-command analyzer. Approval of commands with host effects is explicit, and a successful verification does not grant deployment authority. Readiness is the capability check: missing tools, hardware or services must fail it. There is no automatic capability negotiation or remote verification dispatch.

The runtime serializes checks, preserves receipts and logs, and does not repeat a started command after restart. Pause prevents new checks, not effects of a command already running. Expired evidence cannot be accepted again, but an accepted task is a historical result; its status is not a live health monitor. Live configuration or source changes after the captured interval require another check when the task calls for current state.

The focused tests exercise independent profiles in one project, user-only proof changes after attempts, digest mismatch and mutation, a supported negative research fixture, binary artifact retention, wrong-environment blocking, missing readiness, healthy/unhealthy observation fixtures and expiry at acceptance. These use isolated fixtures, not deployment or musical-quality claims about the user's live projects. Further work should add portfolio-specific commands and human-calibrated review, then capability-aware placement or richer input bundles only when needed.
