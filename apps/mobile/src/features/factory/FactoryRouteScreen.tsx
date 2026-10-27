import { useAtomValue } from "@effect/atom-react";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import type { EnvironmentId, FactoryCard } from "@t3tools/contracts";
import * as LocalAuthentication from "expo-local-authentication";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { useEnvironments } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsScreen } from "../settings/components/SettingsScreen";

export function FactoryPin() {
  const navigation = useNavigation();
  return (
    <View className="px-4 py-2">
      <Button label="Factory" onPress={() => navigation.navigate("Factory", {})} />
    </View>
  );
}

export function FactoryRouteScreen({
  route,
}: StaticScreenProps<{ readonly environmentId?: EnvironmentId; readonly cardId?: string }>) {
  const { environments } = useEnvironments();
  const [selected, setSelected] = useState<EnvironmentId | null>(null);
  const requested = selected ?? route.params.environmentId;
  const environment = requested
    ? environments.find((e) => e.environmentId === requested)
    : environments[0];
  return (
    <SettingsScreen title="Factory">
      <View className="flex-row flex-wrap gap-2 px-4 py-3">
        {environments.map((e) => (
          <Button
            key={e.environmentId}
            label={e.label}
            tone={environment?.environmentId === e.environmentId ? "primary" : "secondary"}
            onPress={() => setSelected(e.environmentId)}
          />
        ))}
      </View>
      {environment ? (
        <FactoryInbox
          key={environment.environmentId}
          environmentId={environment.environmentId}
          cardId={route.params.cardId}
        />
      ) : (
        <Text className="p-5 text-foreground-muted">
          Connect this environment before opening its Factory.
        </Text>
      )}
    </SettingsScreen>
  );
}

function FactoryInbox({
  environmentId,
  cardId,
}: {
  readonly environmentId: EnvironmentId;
  readonly cardId?: string;
}) {
  const query = useEnvironmentQuery(serverEnvironment.factoryBoard({ environmentId, input: {} }));
  const [selected, setSelected] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const cards =
    query.data?.cards
      .filter((c) => c.state === "open")
      .sort(
        (a, b) => Number(b.body.blocking) - Number(a.body.blocking) || a.createdAt - b.createdAt,
      ) ?? [];
  const card = cards.find((c) => c.id === (selected ?? cardId));
  return (
    <ScreenScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-4 px-4 py-4"
      contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
    >
      {query.error && (
        <Text accessibilityRole="alert" className="text-danger">
          {query.error}
        </Text>
      )}
      {!query.data ? (
        <Text className="text-foreground-muted">Loading Factory…</Text>
      ) : (
        <>
          <Text className="font-t3-bold text-lg">
            {cards.length} need you · {cards.filter((c) => c.body.blocking).length} blocking
          </Text>
          {cardId && !query.data.cards.some((c) => c.id === cardId) && (
            <Text className="text-foreground-muted">
              This decision is unavailable. The inbox below shows current decisions.
            </Text>
          )}
          {card ? (
            <>
              <Button label="Back to decisions" onPress={() => setSelected("")} />
              <MobileCard
                key={`${card.id}:${card.revision}`}
                environmentId={environmentId}
                card={card}
              />
            </>
          ) : (
            <>
              {!cards.length && (
                <Text className="text-foreground-muted">No decisions need your answer.</Text>
              )}
              {cards.map((c) => (
                <View
                  key={c.id}
                  className="gap-2 rounded-xl border border-border-subtle bg-card p-4"
                >
                  <Text className="text-foreground-muted">
                    {c.ownerId} · {c.body.urgency}
                    {c.body.blocking ? " · blocking" : ""}
                  </Text>
                  <Button label={c.body.title} onPress={() => setSelected(c.id)} />
                </View>
              ))}
              <Text className="font-t3-bold text-lg">Fleet</Text>
              {query.data.agents
                .filter((a) => a.lifecycle !== "closed")
                .map((a) => (
                  <View
                    key={a.id}
                    className="gap-1 rounded-xl border border-border-subtle bg-card p-4"
                  >
                    <Text className="font-t3-medium">
                      {a.id} · {a.role}
                    </Text>
                    <Text className="text-foreground-muted">
                      {a.lifecycle} · {a.next}
                    </Text>
                    {a.needs && <Text>Needs: {a.needs}</Text>}
                  </View>
                ))}
              <Text className="font-t3-bold text-lg">Triggers</Text>
              {query.data.triggers.map((t) => (
                <Text key={t.id} className="text-foreground-muted">
                  {t.id} · {t.shadow ? "shadow" : "live"} · {t.failing ? "failing" : "healthy"}
                </Text>
              ))}
            </>
          )}
        </>
      )}
    </ScreenScrollView>
  );
}

function MobileCard({
  environmentId,
  card,
}: {
  readonly environmentId: EnvironmentId;
  readonly card: FactoryCard;
}) {
  const [option, setOption] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = useAtomValue(serverEnvironment.factoryAnswerCard.permissionAtom(environmentId));
  const answer = useAtomCommand(serverEnvironment.factoryAnswerCard, "Answer Factory decision");
  const payload = useEnvironmentQuery(
    card.body.action
      ? serverEnvironment.factoryPayload({
          environmentId,
          input: { sha256: card.body.action.payloadSha256 },
        })
      : null,
  );
  const send = async () => {
    if (busy || !allowed || (!option && !note.trim())) return;
    setBusy(true);
    setError(null);
    try {
      if (card.body.action) {
        if (!payload.data) return;
        if (
          !(await LocalAuthentication.hasHardwareAsync()) ||
          !(await LocalAuthentication.isEnrolledAsync())
        ) {
          setError("Enrol biometrics to answer an outward-action card here, or answer on desktop.");
          return;
        }
        const auth = await LocalAuthentication.authenticateAsync({
          promptMessage: "Confirm Factory decision",
          disableDeviceFallback: true,
          biometricsSecurityLevel: "strong",
        });
        if (!auth.success) {
          setError("Biometric confirmation was not completed. Nothing was sent.");
          return;
        }
      }
      await answer({
        environmentId,
        input: {
          cardId: card.id,
          revision: card.revision,
          ...(option === "default" ? { yourCall: true } : option ? { optionId: option } : {}),
          ...(note.trim() ? { note } : {}),
        },
      });
    } catch {
      setError("The decision could not be sent. Reload it before trying again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="gap-4">
      <Text className="font-t3-bold text-xl">{card.body.title}</Text>
      <Text className="text-foreground-muted">
        {card.ownerId} · revision {card.revision}
      </Text>
      <Text>Doing: {card.body.context.doing}</Text>
      <Text>Why you: {card.body.context.whyNotMe}</Text>
      <Text>Waiting: {card.body.context.costOfWaiting}</Text>
      {card.body.action && (
        <View className="gap-2 rounded-xl border border-border-subtle bg-card p-4">
          <Text className="font-t3-medium">Exact approved action</Text>
          <Text selectable className="text-xs text-foreground-muted">
            SHA-256 {card.body.action.payloadSha256}
          </Text>
          <Text selectable>
            {payload.data
              ? JSON.stringify(payload.data.envelope, null, 2)
              : (payload.error ?? "Loading action…")}
          </Text>
        </View>
      )}
      {card.body.options.map((o) => (
        <View key={o.id} className="gap-2 rounded-xl border border-border-subtle bg-card p-4">
          <Button
            label={`${option === o.id ? "Selected: " : ""}${o.id} · ${o.label}${o.recommended ? " · recommended" : ""}`}
            tone={option === o.id ? "primary" : "secondary"}
            disabled={!allowed || busy}
            onPress={() => setOption(o.id)}
          />
          <Text>Next: {o.nextStep}</Text>
          <Text className="text-foreground-muted">
            {o.cost} · {o.reversibility}
          </Text>
          <Text>{o.consequences}</Text>
        </View>
      ))}
      <Text>{card.body.rationale}</Text>
      {card.body.caveats.map((c, i) => (
        <Text key={i} className="text-foreground-muted">
          {c}
        </Text>
      ))}
      <Button
        label="Your call: take the recommendation"
        tone={option === "default" ? "primary" : "secondary"}
        disabled={!allowed || busy}
        onPress={() => setOption("default")}
      />
      <Button
        label="Write my own direction"
        tone="text"
        disabled={!allowed || busy}
        onPress={() => setOption(null)}
      />
      <TextInput
        accessibilityLabel="Decision note"
        multiline
        value={note}
        onChangeText={setNote}
        placeholder="Add a note or your own direction"
        className="min-h-24 rounded-xl border border-border-subtle bg-card p-4 text-foreground"
      />
      {error && (
        <Text accessibilityRole="alert" className="text-danger">
          {error}
        </Text>
      )}
      <Text className="text-foreground-muted">
        Your choice is staged until Send.
        {card.body.action ? " Biometric confirmation is required." : ""}
      </Text>
      <Button
        label="Send"
        tone="primary"
        loading={busy}
        disabled={!allowed || (!option && !note.trim()) || (!!card.body.action && !payload.data)}
        onPress={() => void send()}
      />
    </View>
  );
}
