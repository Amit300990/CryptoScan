import { Platform } from "react-native";

export type PushToken = string | null;

/**
 * Push notification scaffold.
 *
 * expo-notifications is not yet installed. This module exports no-op stubs so
 * the rest of the app can import and call these functions safely. When
 * expo-notifications is added as a dependency, replace this file with a full
 * implementation.
 *
 * To enable: `pnpm --filter @workspace/crypto-mobile add expo-notifications`
 * then replace the stubs below with real calls to the Notifications API.
 */

export async function registerForPushNotificationsAsync(): Promise<PushToken> {
  if (Platform.OS === "web") {
    return null;
  }
  return null;
}

export function scheduleCriticalFindingNotification(_findingTitle: string): void {
  if (Platform.OS === "web") return;
}
