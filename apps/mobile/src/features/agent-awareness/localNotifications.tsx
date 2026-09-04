import { useAtomValue } from "@effect/atom-react";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { AsyncResult } from "effect/unstable/reactivity";

import { useThreadShells } from "../../state/entities";
import { mobilePreferencesAtom } from "../../state/preferences";
import {
  indexNotificationThreads,
  localAgentNotificationEvents,
  type LocalAgentNotificationEvent,
} from "./localNotificationEvents";

export const ANDROID_AGENT_NOTIFICATION_CHANNEL = "agent-activity";

export async function ensureAndroidAgentNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_AGENT_NOTIFICATION_CHANNEL, {
    name: "Agent activity",
    description: "Task completions and requests that need your attention",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
  });
}

function notificationContent(event: LocalAgentNotificationEvent) {
  const presentation =
    event.kind === "approval"
      ? { title: "Approval required", body: `${event.threadTitle} needs your approval.` }
      : event.kind === "input"
        ? { title: "Input required", body: `${event.threadTitle} needs your response.` }
        : event.kind === "failure"
          ? { title: "Task failed", body: `${event.threadTitle} stopped with an error.` }
          : { title: "Task completed", body: event.threadTitle };
  return {
    ...presentation,
    data: {
      environmentId: event.environmentId,
      threadId: event.threadId,
      deepLink: `/threads/${encodeURIComponent(event.environmentId)}/${encodeURIComponent(event.threadId)}`,
    },
    sound: "default" as const,
  };
}

async function presentLocalAgentNotification(event: LocalAgentNotificationEvent): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: notificationContent(event),
    trigger:
      Platform.OS === "android"
        ? {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 1,
            channelId: ANDROID_AGENT_NOTIFICATION_CHANNEL,
          }
        : null,
  });
}

export function LocalAgentNotificationsCoordinator() {
  const threads = useThreadShells();
  const preferences = useAtomValue(mobilePreferencesAtom);
  const previousThreads = useRef(indexNotificationThreads(threads));

  useEffect(() => {
    void ensureAndroidAgentNotificationChannel().catch((error: unknown) => {
      console.warn("Could not create the Android agent notification channel.", error);
    });
  }, []);

  useEffect(() => {
    const events = localAgentNotificationEvents({
      previous: previousThreads.current,
      current: threads,
    });
    previousThreads.current = indexNotificationThreads(threads);

    const enabled =
      Platform.OS === "android" &&
      AsyncResult.isSuccess(preferences) &&
      preferences.value.notificationsEnabled === true;
    if (!enabled || AppState.currentState === "active") return;

    for (const event of events) {
      void presentLocalAgentNotification(event).catch((error: unknown) => {
        console.warn("Could not present an Android agent notification.", error);
      });
    }
  }, [preferences, threads]);

  return null;
}
