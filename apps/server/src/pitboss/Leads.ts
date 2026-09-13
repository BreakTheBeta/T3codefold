import {
  isPitbossLeadActive,
  type PitbossSnapshot,
  type PitbossTask,
  type ThreadId,
} from "@t3tools/contracts";

export function activeLeads(state: PitbossSnapshot) {
  return (state.leads ?? []).filter((lead) => isPitbossLeadActive(state.role, lead));
}

export function taskLead(state: PitbossSnapshot, task: PitbossTask) {
  return activeLeads(state).find(
    (lead) => lead.id === task.leadId && lead.projectId === task.projectId,
  );
}

/** Route old messages through current ownership so a handoff cannot strand an obligation. */
export function inboxFor(state: PitbossSnapshot, leadId?: string) {
  return state.messages.filter((message) => {
    const task = state.tasks.find((task) => task.id === message.taskId);
    const messageLead = state.leads?.find(
      (lead) => lead.id === message.recipientLeadId || lead.threadId === message.threadId,
    );
    if (
      (task && !state.role?.brief.projectIds.includes(task.projectId)) ||
      (messageLead && !state.role?.brief.projectIds.includes(messageLead.projectId))
    )
      return false;
    const owner = task
      ? taskLead(state, task)?.id
      : activeLeads(state).find((lead) => lead.id === message.recipientLeadId)?.id;
    return owner === leadId;
  });
}

export function leadView(state: PitbossSnapshot, threadId: ThreadId): PitbossSnapshot | undefined {
  const lead = activeLeads(state).find((lead) => lead.threadId === threadId);
  if (!lead) return;
  return {
    ...state,
    verificationRecipes: (state.verificationRecipes ?? []).filter(
      (recipe) => recipe.projectId === lead.projectId,
    ),
    role: state.role
      ? {
          ...state.role,
          brief: {
            ...state.role.brief,
            priorities: lead.charter,
            projectIds: [lead.projectId],
            managedPeerIds: [],
          },
        }
      : null,
    leads: [lead],
    tasks: state.tasks.filter(
      (task) => task.leadId === lead.id && task.projectId === lead.projectId,
    ),
    messages: inboxFor(state, lead.id),
    sourceAuthorities: [],
  };
}
