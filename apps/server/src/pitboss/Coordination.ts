import { PitbossError } from "@t3tools/contracts";

export interface CoordinationProposal {
  readonly id: string;
  readonly scope: string;
  readonly coordinator: string;
  readonly participants: readonly [string, string];
}
export interface CoordinationView {
  readonly proposals: ReadonlyArray<CoordinationProposal>;
  readonly versions: Readonly<Record<string, number>>;
  readonly approvals: Readonly<Record<string, string>>;
}
export const emptyCoordination: CoordinationView = { proposals: [], approvals: {}, versions: {} };

/** A peer reports only its own approval. Connectivity never elects a replacement. */
export function reconcileCoordination(
  local: CoordinationView,
  peer: CoordinationView,
  sender: string,
): CoordinationView {
  if ((peer.versions[sender] ?? 0) <= (local.versions[sender] ?? -1)) return local;
  const proposals = [...local.proposals];
  for (const proposal of peer.proposals) {
    if (
      !proposal.participants.includes(sender) ||
      !proposal.participants.includes(proposal.coordinator)
    ) {
      throw new PitbossError({
        code: "forbidden",
        message: "The proposal does not belong to these participants.",
      });
    }
    const previous = proposals.find((entry) => entry.id === proposal.id);
    if (
      previous &&
      (previous.scope !== proposal.scope ||
        previous.coordinator !== proposal.coordinator ||
        previous.participants.some((entry, index) => entry !== proposal.participants[index]))
    ) {
      throw new PitbossError({
        code: "conflict",
        message: "A proposal ID cannot be reused with different terms.",
      });
    }
    if (!previous) proposals.push(proposal);
  }
  const approvals = { ...local.approvals };
  const selected = peer.approvals[sender];
  if (selected === undefined) delete approvals[sender];
  else {
    if (
      !proposals.some(
        (proposal) => proposal.id === selected && proposal.participants.includes(sender),
      )
    ) {
      throw new PitbossError({
        code: "invalid",
        message: "The peer approved an unknown proposal.",
      });
    }
    approvals[sender] = selected;
  }
  return {
    proposals,
    approvals,
    versions: { ...local.versions, [sender]: peer.versions[sender] ?? 0 },
  };
}

export function agreedCoordinator(view: CoordinationView, scope: string): string | null {
  const approved = view.proposals.filter(
    (proposal) =>
      proposal.scope === scope &&
      proposal.participants.every((participant) => view.approvals[participant] === proposal.id),
  );
  return approved.length === 1 ? approved[0]!.coordinator : null;
}

export function approveCoordination(
  view: CoordinationView,
  proposalId: string,
  self: string,
  hasWriters: boolean,
): CoordinationView {
  const proposal = view.proposals.find((entry) => entry.id === proposalId);
  if (!proposal || !proposal.participants.includes(self))
    throw new PitbossError({
      code: "invalid",
      message: "Choose a proposal involving this environment.",
    });
  if (hasWriters)
    throw new PitbossError({
      code: "conflict",
      message: "Stop and reconcile existing writers before changing shared coordination.",
    });
  return {
    ...view,
    approvals: { ...view.approvals, [self]: proposalId },
    versions: { ...view.versions, [self]: (view.versions[self] ?? 0) + 1 },
  };
}
