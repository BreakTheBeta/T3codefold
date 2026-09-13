# Verify the outcome, choose the right environment

**Design proposal, grounded in the registered projects inspected on 2026-09-13.** PR #19 implements only the committed-candidate runner described below. This page explains why later runners must support different evidence and execution requirements; it does not assert that those runners exist.

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

An **evidence profile** is the proposed versioned agreement about what establishes completion for a kind of task. A project offers defaults and may offer several profiles; software work, research and operations can coexist in one project. Profile selection and changes must be recorded on the assignment rather than inferred later from its title.

The agreement identifies the outcome and acceptance criteria; the subject being checked; required environment capabilities; readiness and cleanup; reproducible checks and artifacts; qualitative review; evidence freshness; and authorized effects. A lead may choose among approved profiles within the existing brief. It cannot downgrade required proof after failure. Changing the agreement invalidates affected acceptance, while preserving the original evidence.

Subject identity depends on the work: a code commit, a content-hashed artifact with its input manifest, a dated research packet with source references, or a host/service observation with configuration identity and observation interval. These are proposed variants, not strings to smuggle through today's `commit:` field. Dynamic observations can expire; an old passing service check cannot certify current health.

For ad hoc filesystem work, first name the bounded workspace or target and expected result. Being able to access the machine does not make the whole filesystem the task's scope.

## Context, delegation and placement

GLaDOS's durable brief holds cross-project priorities, limits and decision preferences. A project lead retains its project's decisions, selected profiles and unresolved questions. Workers receive only the relevant goal, acceptance contract, approved tools, target environment, constraints and prior evidence. Learning updates should distinguish reusable accepted rules from drafts and one-off results, following the [Hermes knowledge boundary](hermes-media-team.md) and [pstack verification principles](pstack.md).

Use a direct worker for bounded work. Add a project lead when sustained context, several workers or integrated review warrants it. GLaDOS remains the user's communication point and receives a concise outcome, proof, coverage gaps and decisions needed from the user.

Select execution placement from connected environment capabilities: available providers and models, tools, hardware and accessible targets. A capable model cannot compensate for missing target hardware. Do not transfer credentials or private project context merely because another environment is connected. If the target goes offline, preserve local ownership and the pending evidence requirement; report blocked or inconclusive work. Peer environments remain independent, and changes to shared coordinating leadership require user approval. The existing PR does not implement cross-environment verification dispatch or capability negotiation.

## Current boundary and next extension

PR #19 stores one optional recipe per project and captures commands against a full commit SHA in a disposable clone on the task's environment. It retains receipts, logs and bounded file attachments, separately from lead review. It is useful for suitable software checks, but not a universal proof mechanism for this portfolio.

In particular, enabling that recipe gates every task in the project. **Do not enable a blanket code recipe in a mixed research/operations project expecting per-task selection.** Per-task profiles, non-Git subjects, freshness expiry and operational effect scopes are not implemented. Existing reported evidence remains available where captured verification is not enabled; that is reported evidence, not a server-attested alternative runner.

The next implementation should select and snapshot an approved profile on each task, first retaining the existing commit runner. Add another runner only with a real portfolio example and a failure-capable test. An artifact/research receipt needs content and source identity; a service receipt needs an explicit observation boundary and effect policy. Keep these behind the Fold work service, reusing T3's provider-neutral tools and durable state instead of extending each provider adapter.

Acceptance examples for those extensions: mixed code and research tasks in one project select different proof; missing audio hardware cannot produce a listening pass; changed research inputs invalidate their result; stale service observations cannot accept a current repair; host interruption does not blindly repeat a mutation; a useful negative experiment can complete. These are proposed gates, not tests claimed by PR #19.
