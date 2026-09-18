import { VoiceWorkspaceProvider } from "./features/voice-input/VoiceWorkspaceProvider";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { StatusBar, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createStaticNavigation } from "@react-navigation/native";

import { RegistryContext } from "@effect/atom-react";
import { ThreadArrangementHost } from "./features/threads/ThreadArrangementSheet";
import { ConfirmDialogHost } from "./components/ConfirmDialogHost";
import { CloudAuthProvider } from "./features/cloud/CloudAuthProvider";
import { prepareNativeShowcaseCapture } from "./features/showcase/nativeShowcaseScene";
import { IncomingShareProvider } from "./features/sharing/IncomingShareProvider";
import {
  AppearancePreferencesProvider,
  useAppearancePreferences,
} from "./features/settings/appearance/AppearancePreferencesProvider";
import { RootStack } from "./Stack";
import { appAtomRegistry } from "./state/atom-registry";
import { OverlayPortalHost } from "./components/OverlayPortal";
import { shouldHandleAppLink } from "./lib/appLinking";
import { useMobileNavigationTheme } from "./lib/useMobileNavigationTheme";
import { LocalAgentNotificationsCoordinator } from "./features/agent-awareness/localNotifications";

import { SubscriptionUsageCoordinator } from "./widgets/SubscriptionUsageCoordinator";

import "../global.css";

if (process.env.EXPO_PUBLIC_SHOWCASE === "1") {
  prepareNativeShowcaseCapture();
}

void SplashScreen.preventAutoHideAsync().catch(() => {
  // The native module can be unavailable in non-native test environments.
});

const appLinking = {
  prefixes: [Linking.createURL("/"), "t3code://", "t3code-dev://", "t3code-preview://"],
  // Keep the compact thread list available beneath a directly opened thread.
  config: { initialRouteName: "Home" },
  filter: shouldHandleAppLink,
};

const Navigation = createStaticNavigation(RootStack);

function SplashScreenCoordinator({ navigationReady }: { readonly navigationReady: boolean }) {
  const { isReady } = useAppearancePreferences();

  useEffect(() => {
    if (isReady && navigationReady) void SplashScreen.hide();
  }, [isReady, navigationReady]);

  return null;
}

export default function App() {
  return (
    <RegistryContext.Provider value={appAtomRegistry}>
      <CloudAuthProvider>
        <AppearancePreferencesProvider>
          <AppContent />
        </AppearancePreferencesProvider>
      </CloudAuthProvider>
    </RegistryContext.Provider>
  );
}

function AppContent() {
  const { themeAppearance } = useAppearancePreferences();
  const navigationTheme = useMobileNavigationTheme();
  const [navigationReady, setNavigationReady] = useState(false);

  return (
    <>
      <SplashScreenCoordinator navigationReady={navigationReady} />
      <SubscriptionUsageCoordinator />
      <GestureHandlerRootView
        className="flex-1"
        style={{ backgroundColor: navigationTheme.colors.background }}
      >
        <KeyboardProvider statusBarTranslucent>
          <SafeAreaProvider>
            <StatusBar
              barStyle={themeAppearance === "dark" ? "light-content" : "dark-content"}
              translucent
            />
            {/* The navigation theme drives the NATIVE header appearance: native-stack
                forwards `dark` as the nav bar's overrideUserInterfaceStyle. Without
                this, React Navigation defaults to its light theme and every native
                header (glass buttons, title, materials) is forced light even when
                the system is in dark mode. */}
            <View style={{ flex: 1 }}>
              <VoiceWorkspaceProvider>
                <IncomingShareProvider>
                  <LocalAgentNotificationsCoordinator />
                  <Navigation
                    linking={appLinking}
                    theme={navigationTheme}
                    onReady={() => setNavigationReady(true)}
                  />
                </IncomingShareProvider>
              </VoiceWorkspaceProvider>
              <ConfirmDialogHost />
              <ThreadArrangementHost />
            </View>
            {/* Anchored-menu overlays render here — in-window, so the
                keyboard stays up while a dropdown is open. */}
            <OverlayPortalHost />
          </SafeAreaProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </>
  );
}
