import type { ReactNode } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { KeyboardAvoidingView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";

/**
 * The frame both pull request sheets share: a close button and title, scrolling content, and an
 * action row that rides above the keyboard. Android hosts these as full-screen modals, so the
 * action row sticks to the keyboard there instead of sitting in the sheet's flow.
 */
export function PullRequestSheetScaffold(props: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer: ReactNode;
}) {
  const isAndroid = Platform.OS === "android";
  const insets = useSafeAreaInsets();
  const footer = (
    <View
      className="flex-row items-center justify-end gap-3 border-t border-border bg-sheet px-5 pt-2"
      style={{ paddingBottom: isAndroid ? Math.max(insets.bottom, 10) : 8 }}
    >
      {props.footer}
    </View>
  );

  return (
    <View className="flex-1 bg-sheet">
      <KeyboardAvoidingView automaticOffset behavior="padding" className="flex-1">
        <View className="flex-1" style={{ paddingTop: isAndroid ? insets.top + 8 : 8 }}>
          <View className="flex-row items-center justify-between px-5 py-2">
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              className="h-12 w-12 items-center justify-center rounded-full bg-subtle"
              onPress={props.onClose}
            >
              <SymbolView
                name="xmark"
                size={18}
                tintColorClassName="accent-icon"
                type="monochrome"
              />
            </Pressable>
            <Text className="text-lg font-t3-bold text-foreground">{props.title}</Text>
            <View className="h-12 w-12" />
          </View>
          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: isAndroid ? 96 : 16,
              gap: 16,
            }}
          >
            {props.children}
          </ScrollView>
        </View>
        {isAndroid ? null : footer}
      </KeyboardAvoidingView>
      {isAndroid ? (
        <KeyboardStickyView
          className="absolute inset-x-0 bottom-0"
          offset={{ closed: 0, opened: 0 }}
        >
          {footer}
        </KeyboardStickyView>
      ) : null}
    </View>
  );
}
