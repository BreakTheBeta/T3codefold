import { ControllerScope, ControllerTargetLifecycle } from "./controllerScope";
import { use, useEffect, useId, useState, useEffectEvent } from "react";
import { Platform, Pressable, View, type PressableProps } from "react-native";
import { controllerTargets } from "./controllerTargets";

export function ControllerPressable({
  controllerKey = "",
  onActivate,
  onDictate,
  onAdjust,
  footer,
  reply,
  thread,
  scopeBoundary,
  touchPassthrough = false,
  ...props
}: PressableProps & {
  readonly controllerKey?: string;
  readonly onActivate: () => void;
  readonly onDictate?: () => boolean | void;
  readonly onAdjust?: (direction: -1 | 1) => void;
  readonly footer?: boolean;
  readonly reply?: boolean;
  readonly thread?: boolean;
  readonly scopeBoundary?: boolean;
  readonly touchPassthrough?: boolean;
}) {
  const scope = use(ControllerScope);
  const lifecycleBoundary = use(ControllerTargetLifecycle);
  const effectiveBoundary = scopeBoundary ?? lifecycleBoundary;
  const id = `t3-controller:${onAdjust ? "adjustable:" : footer ? "footer:" : reply ? "reply:" : thread ? "thread:" : ""}${useId()}:${scope}:${controllerKey}`;
  const [focused, setFocused] = useState(false);
  const activate = useEffectEvent(() => {
    if (!props.disabled) onActivate();
  });
  const dictate = useEffectEvent(() => {
    return props.disabled ? false : onDictate?.();
  });
  const hasDictation = onDictate !== undefined;
  const adjust = useEffectEvent((direction: -1 | 1) => {
    if (!props.disabled) onAdjust?.(direction);
  });
  const hasAdjustment = onAdjust !== undefined;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers this native focus target's semantic action for controller events
  useEffect(() => {
    if (Platform.OS !== "android" || props.disabled) return;
    return controllerTargets.register(
      id,
      {
        activate,
        reply,
        ...(hasDictation ? { dictate } : {}),
        ...(hasAdjustment ? { adjust } : {}),
      },
      scope,
      effectiveBoundary,
    );
  }, [id, props.disabled, hasDictation, hasAdjustment, reply, scope, effectiveBoundary]);
  // Native controls own their drags; Pressability would cancel those gestures.
  if (touchPassthrough) {
    return (
      <View
        {...props}
        nativeID={props.disabled ? undefined : id}
        focusable={!props.disabled}
        accessibilityLabel={props.accessibilityLabel}
        style={typeof props.style === "function" ? props.style({ pressed: false }) : props.style}
      >
        {typeof props.children === "function" ? props.children({ pressed: false }) : props.children}
      </View>
    );
  }
  return (
    <Pressable
      {...props}
      nativeID={props.disabled ? undefined : id}
      focusable={!props.disabled}
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        props.onBlur?.(event);
      }}
      style={(state) => [
        typeof props.style === "function" ? props.style(state) : props.style,
        focused && { borderWidth: 3, borderColor: "#ffdf00" },
      ]}
    />
  );
}
