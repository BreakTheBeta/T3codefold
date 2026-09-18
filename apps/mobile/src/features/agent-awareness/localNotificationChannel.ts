import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

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
