import { useServerConfigs } from "../../state/entities";
import { useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  CommandId,
  type EnvironmentId,
  type ModelSelection,
  type PitbossAction,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import { AppText as Text } from "../../components/AppText";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { uuidv4 } from "../../lib/uuid";

export function PitbossWork(props: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  projectId: ProjectId;
  modelSelection: ModelSelection;
}) {
  const query = useEnvironmentQuery(
    serverEnvironment.pitbossLive({ environmentId: props.environmentId, input: {} }),
  );
  const mutate = useAtomCommand(serverEnvironment.pitbossCommand, "GLaDOS work");
  const navigation = useNavigation();
  const serverConfigs = useServerConfigs();
  const [visible, setVisible] = useState(false);
  const [priorities, setPriorities] = useState("");
  const [title, setTitle] = useState("");
  const [criteria, setCriteria] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = query.data;
  const role = state?.role;
  const isBoss = role?.threadId === props.threadId;
  if (!state) return null;
  const command = async (action: PitbossAction) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await mutate({
      environmentId: props.environmentId,
      input: { commandId: CommandId.make(uuidv4()), expectedRevision: state.revision, action },
    });
    setBusy(false);
    if (result._tag === "Failure")
      setError(
        "The action could not be applied. Refresh work and inspect the current state before retrying.",
      );
  };
  const button = (label: string, action: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy || disabled}
      onPress={action}
      className="rounded-lg bg-primary/10 px-3 py-2"
    >
      <Text className="text-sm text-primary">{label}</Text>
    </Pressable>
  );
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setPriorities(role?.brief.priorities ?? "");
          setVisible(true);
        }}
        className="flex-row items-center justify-between border-b border-primary/20 bg-primary/5 px-4 py-2"
      >
        <Text className="font-semibold text-primary">♛ {isBoss ? "GLaDOS" : "GLaDOS work"}</Text>
        <Text className="text-xs text-muted-foreground">
          {isBoss
            ? role.paused
              ? "Paused"
              : `${state.tasks.filter((task) => task.status === "active").length} working`
            : "Manage"}
        </Text>
      </Pressable>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setVisible(false)}
      >
        <View className="flex-1 bg-background pt-6">
          <View className="flex-row items-center justify-between px-4 pb-3">
            <Text className="text-xl font-semibold">GLaDOS work</Text>
            {button("Back to chat", () => setVisible(false))}
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            {(error || query.error) && (
              <Text accessibilityRole="alert" className="text-red-500">
                {error ?? query.error}
              </Text>
            )}
            {(state.leads ?? []).map((lead) => {
              const active = lead.status === "active" && lead.parentGeneration === role?.generation;
              return (
                <View key={lead.id} className="gap-2 rounded-xl border border-border p-3">
                  <Text className="font-semibold">
                    {lead.id} · {active ? "Managing" : "Dormant"}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    {lead.model.model} · up to {lead.maxWorkers} shared workers
                  </Text>
                  <Text className="text-sm">{lead.charter}</Text>
                  <Text className="text-sm">
                    Context v{lead.contextRevision}: {lead.context || "Not recorded yet"}
                  </Text>
                  {button(
                    active ? "Return to GLaDOS" : "Reactivate lead",
                    () =>
                      void command({
                        type: "lead-status",
                        leadId: lead.id,
                        status: active ? "dormant" : "active",
                      }),
                  )}
                </View>
              );
            })}
            <Text className="text-sm text-muted-foreground">Your priorities</Text>
            <TextInput
              accessibilityLabel="GLaDOS priorities"
              multiline
              value={priorities}
              onChangeText={setPriorities}
              className="rounded-xl border border-border p-3 text-foreground"
              placeholder="What should GLaDOS work on?"
            />
            {role && (
              <View className="gap-1 rounded-xl border border-border p-3">
                <Text className="text-sm font-semibold">Worker configurations</Text>
                {[
                  role.brief.workerModel,
                  ...(role.brief.alternateWorkerModel ? [role.brief.alternateWorkerModel] : []),
                ].map((model, index) => (
                  <Text
                    key={index === 0 ? "default" : "alternative"}
                    className="text-sm text-muted-foreground"
                  >
                    {index === 0 ? "Default" : "Alternative"}: {model.instanceId} · {model.model}
                    {model.options?.map((option) => ` · ${option.id}: ${option.value}`).join("")}
                  </Text>
                ))}
                {role.brief.modelGuidance && (
                  <Text className="text-sm text-muted-foreground">{role.brief.modelGuidance}</Text>
                )}
                <Text className="text-xs text-muted-foreground">
                  {role.brief.projectIds.length} projects ·{" "}
                  {role.brief.managedPeerIds === undefined
                    ? "All configured peers"
                    : `${role.brief.managedPeerIds.length} permitted peers`}
                  . Edit models, thinking levels, guidance and scope on web or desktop.
                </Text>
              </View>
            )}
            {isBoss ? (
              <View className="flex-row flex-wrap gap-2">
                {button(
                  "Save priorities",
                  () => void command({ type: "brief", brief: { ...role.brief, priorities } }),
                )}
                {button(
                  role.paused ? "Resume" : "Pause new work",
                  () => void command({ type: "pause", paused: !role.paused }),
                )}
                {button("Dismiss role", () => void command({ type: "dismiss" }))}
              </View>
            ) : (
              button(
                role ? "Move GLaDOS to this thread" : "Activate GLaDOS",
                () =>
                  void command({
                    type: "elect",
                    threadId: props.threadId,
                    projectId: props.projectId,
                    brief: {
                      priorities,
                      quality: "Prove the requested behavior and preserve unrelated work.",
                      projectIds: [props.projectId],
                      maxWorkers: 10,
                      maxAttempts: 3,
                      workerModel: props.modelSelection,
                      managedPeerIds: [],
                    },
                  }),
              )
            )}
            {role &&
              !isBoss &&
              button("Open elected GLaDOS", () => {
                setVisible(false);
                navigation.navigate("Thread", {
                  environmentId: props.environmentId,
                  threadId: role.threadId,
                });
              })}
            {isBoss && (
              <>
                <MobilePitbossPeers environmentId={props.environmentId} />
                <Text className="mt-3 font-semibold">Add an outcome</Text>
                <TextInput
                  accessibilityLabel="Task title"
                  value={title}
                  onChangeText={setTitle}
                  className="rounded-xl border border-border p-3 text-foreground"
                  placeholder="What should get done?"
                />
                <TextInput
                  accessibilityLabel="Acceptance criteria"
                  value={criteria}
                  onChangeText={setCriteria}
                  multiline
                  className="rounded-xl border border-border p-3 text-foreground"
                  placeholder="How will we prove it works?"
                />
                {button("Add work", () => {
                  if (title.trim() && criteria.trim())
                    void command({
                      type: "create",
                      taskId: uuidv4(),
                      projectId: props.projectId,
                      title,
                      outcome: title,
                      criteria,
                      verifyCommand: "",
                      priority: 50,
                      dependencies: [],
                      workspaceStrategy: { type: "worktree", baseRef: "HEAD" },
                    });
                })}
                {state.messages
                  .filter((message) => !message.acknowledged)
                  .slice(-10)
                  .map((message) => (
                    <View
                      key={message.id}
                      className="gap-2 rounded-xl border border-primary/30 p-3"
                    >
                      <Text className="font-semibold">{message.kind}</Text>
                      <Text>{message.text}</Text>
                      {button(
                        "Acknowledge",
                        () => void command({ type: "acknowledge", messageId: message.id }),
                      )}
                    </View>
                  ))}
                <Text className="mt-3 font-semibold">Work and evidence</Text>
                {state.tasks.length === 0 && (
                  <Text className="text-muted-foreground">
                    Add work or describe your priorities in chat. Assigned workers and verified
                    outcomes will appear here.
                  </Text>
                )}
                {state.tasks.map((task) => (
                  <View key={task.id} className="gap-2 rounded-xl border border-border p-4">
                    <Text className="font-semibold">{task.title}</Text>
                    <Text className="text-xs text-primary">
                      {task.status} · criteria v{task.criteriaVersion}
                    </Text>
                    <Text className="text-sm">{task.criteria}</Text>
                    {task.source && (
                      <Text className="text-xs text-muted-foreground">
                        {task.source.kind} · {task.source.key} · Source: {task.source.status} · T3
                        work: {task.status}
                      </Text>
                    )}
                    <Text className="text-xs text-muted-foreground">{task.note}</Text>
                    {task.attempts.map((attempt) => (
                      <View key={attempt.id}>
                        {button(
                          serverConfigs.has(task.homeEnvironmentId ?? props.environmentId)
                            ? `Worker ${attempt.generation} · ${attempt.state}`
                            : "Connect task home first",
                          () => {
                            setVisible(false);
                            navigation.navigate("Thread", {
                              environmentId: task.homeEnvironmentId ?? props.environmentId,
                              threadId: attempt.threadId,
                            });
                          },
                          !serverConfigs.has(task.homeEnvironmentId ?? props.environmentId),
                        )}
                      </View>
                    ))}
                    {task.evidence.map((evidence) => (
                      <View key={evidence.id} className="gap-1 rounded-lg bg-muted p-3">
                        <Text className="text-sm">
                          {evidence.verdict} · {evidence.provenance.replaceAll("_", " ")}
                        </Text>
                        <Text className="text-sm">{evidence.summary}</Text>
                        <Text className="text-xs">{evidence.candidate}</Text>
                        {task.status === "verifying" &&
                          evidence.verdict === "pass" &&
                          button(
                            "Accept inspected evidence",
                            () =>
                              void command({
                                type: "accept",
                                taskId: task.id,
                                evidenceId: evidence.id,
                                note: "User inspected and accepted evidence.",
                              }),
                          )}
                      </View>
                    ))}
                    {task.status === "queued" &&
                      button(
                        "Assign worker",
                        () => void command({ type: "assign", taskId: task.id }),
                      )}
                    {["active", "verifying"].includes(task.status) &&
                      button(
                        "Stop for rework",
                        () =>
                          void command({
                            type: "rework",
                            taskId: task.id,
                            note: "User requested rework; preserve artifacts.",
                          }),
                      )}
                    {["blocked", "cancelled", "done"].includes(task.status) &&
                      button("Reopen", () => void command({ type: "reopen", taskId: task.id }))}
                    {!["done", "cancelled"].includes(task.status) &&
                      button(
                        "Cancel task",
                        () =>
                          void command({
                            type: "cancel",
                            taskId: task.id,
                            note: "Cancelled by user",
                          }),
                      )}
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

export function PitbossPins({
  environments,
}: {
  environments: readonly { environmentId: EnvironmentId; label: string }[];
}) {
  return (
    <View>
      {environments.map((environment) => (
        <PitbossPin key={environment.environmentId} {...environment} />
      ))}
    </View>
  );
}
function PitbossPin({ environmentId, label }: { environmentId: EnvironmentId; label: string }) {
  const query = useEnvironmentQuery(serverEnvironment.pitbossLive({ environmentId, input: {} }));
  const navigation = useNavigation();
  const role = query.data?.role;
  if (!role) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open GLaDOS in ${label}`}
      onPress={() => navigation.navigate("Thread", { environmentId, threadId: role.threadId })}
      className="mx-3 my-2 flex-row items-center justify-between rounded-2xl border border-primary/30 bg-primary/5 p-4"
    >
      <View>
        <Text className="font-semibold text-primary">♛ GLaDOS</Text>
        <Text className="text-xs text-muted-foreground">{label}</Text>
      </View>
      <Text className="text-xs text-muted-foreground">
        {query.error ? "Offline" : role.paused ? "Paused" : "Open work"}
      </Text>
    </Pressable>
  );
}

function MobilePitbossPeers({ environmentId }: { environmentId: EnvironmentId }) {
  const query = useEnvironmentQuery(serverEnvironment.pitbossPeers({ environmentId, input: {} }));
  const mutate = useAtomCommand(
    serverEnvironment.pitbossPeerCommand,
    "approve shared coordination",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <View className="gap-3">
      <Text className="font-semibold">Connected GLaDOS peers</Text>
      {(error || query.error) && <Text accessibilityRole="alert">{error ?? query.error}</Text>}
      {query.data?.peers.length === 0 && (
        <Text className="text-xs text-muted-foreground">
          Connect shared tracker scopes from the web or desktop work panel. Each environment retains
          its own GLaDOS.
        </Text>
      )}
      {query.data?.peers.map((peer) => (
        <View key={peer.config.id} className="gap-2 rounded-xl border border-border p-3">
          <Text>
            {peer.config.id} · {peer.error ?? "Paired"} · {peer.pendingMessages ?? 0} messages
            pending
          </Text>
          {peer.view.proposals.map((proposal) => (
            <View key={proposal.id} className="gap-2">
              <Text className="text-sm">
                Coordinator:{" "}
                {proposal.coordinator === query.data?.environmentId
                  ? "this environment"
                  : peer.config.id}
              </Text>
              <Text className="text-xs">
                Task home: {proposal.homeEnvironmentId ?? proposal.coordinator}
              </Text>
              <Text className="text-xs">
                {proposal.participants.every((id) => peer.view.approvals[id] === proposal.id)
                  ? "Approved by both environments"
                  : "Awaiting approvals"}
              </Text>
              {query.data &&
                peer.view.rejections?.[query.data.environmentId]?.includes(proposal.id) && (
                  <Text className="text-xs text-muted-foreground">Declined locally</Text>
                )}
              {query.data &&
                !peer.view.rejections?.[query.data.environmentId]?.includes(proposal.id) && (
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy || !peer.config.enabled}
                    className="rounded-lg bg-primary/10 p-3"
                    onPress={() => {
                      setBusy(true);
                      void mutate({
                        environmentId,
                        input: { type: "decline", peerId: peer.config.id, proposalId: proposal.id },
                      }).then((result) => {
                        setBusy(false);
                        if (result._tag === "Failure")
                          setError(
                            "Decision could not be applied. Resolve active workers and refresh.",
                          );
                        query.refresh();
                      });
                    }}
                  >
                    <Text>
                      {peer.view.approvals[query.data.environmentId] === proposal.id
                        ? "Withdraw approval"
                        : "Decline"}
                    </Text>
                  </Pressable>
                )}
              {query.data && peer.view.approvals[query.data.environmentId] !== proposal.id && (
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  className="rounded-lg bg-primary/10 p-3"
                  onPress={() => {
                    setBusy(true);
                    void mutate({
                      environmentId,
                      input: { type: "approve", peerId: peer.config.id, proposalId: proposal.id },
                    }).then((result) => {
                      setBusy(false);
                      if (result._tag === "Failure")
                        setError(
                          "Approval could not be applied. Resolve active workers and refresh.",
                        );
                      query.refresh();
                    });
                  }}
                >
                  <Text>Approve coordination change</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ))}
      <Pressable accessibilityRole="button" onPress={query.refresh}>
        <Text className="text-sm text-primary">Refresh peers</Text>
      </Pressable>
    </View>
  );
}
