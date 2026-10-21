import { View } from "react-native";

import { AppText as Text } from "./ui/AppText";
import { MOBILE_APP_NAME } from "../lib/mobileBranding";
import { useAndroidControlSizing } from "./ui/useAndroidControlSizing";

/** Fold's Android header title: the app name as plain header text, without the wordmark. */
export function FoldAndroidBrandTitle(props: {
  readonly allowFontScaling?: boolean | undefined;
  readonly accessibilityLabel?: string | undefined;
}) {
  const { scale } = useAndroidControlSizing();
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={props.accessibilityLabel ?? `${MOBILE_APP_NAME}, Threads`}
      style={{ minWidth: 0, maxWidth: "100%", flexShrink: 1, overflow: "hidden" }}
    >
      <Text
        allowFontScaling={props.allowFontScaling}
        numberOfLines={1}
        ellipsizeMode="tail"
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        className="font-t3-medium text-header-foreground"
        style={{
          fontSize: 18 * scale,
          lineHeight: 24 * scale,
          letterSpacing: -0.3 * scale,
          flexShrink: 1,
        }}
      >
        {MOBILE_APP_NAME}
      </Text>
    </View>
  );
}
