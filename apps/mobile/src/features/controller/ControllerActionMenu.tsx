import type { MenuAction } from "@react-native-menu/menu";
import { useRef, useState } from "react";
import type { ScrollViewInstance } from "react-native";
import { NavigationRow } from "../../components/ui/NavigationRow";
import { ControllerConsole } from "./ControllerConsole";
import { ScreenContent } from "../../components/ui/ScreenContent";
import {
  isMenuActionEnabled,
  menuActionKey,
  resolveMenuPath,
} from "../../components/ui/menuActionItems";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { Sheet } from "../../components/ui/Sheet";

export function ControllerActionMenu(props: {
  readonly title: string;
  readonly actions: readonly MenuAction[];
  readonly onSelect: (id: string) => void;
  readonly onClose: () => void;
}) {
  const menuScroll = useRef<ScrollViewInstance>(null);
  const [path, setPath] = useState<readonly string[]>([]);
  const level = resolveMenuPath(props.actions, path);
  const activePath = path.slice(0, level.owners.length);
  if (activePath.length !== path.length) setPath(activePath);
  const parent = level.owners.at(-1);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const back = () => {
    if (activePath.length) {
      setReturnTo(activePath.at(-1) ?? null);
      setPath(activePath.slice(0, -1));
    } else props.onClose();
  };
  return (
    <Sheet title={parent?.title ?? props.title} onClose={props.onClose} onControllerBack={back}>
      <ControllerConsole
        key={JSON.stringify(activePath)}
        scopeKey="menu-level"
        initialRegion="content"
        onBack={back}
      >
        <ScreenContent>
          <ScreenScrollView ref={menuScroll} contentContainerClassName="gap-2 p-4">
            {level.actions.map((action, index) => (
              <NavigationRow
                key={menuActionKey(action, index)}
                controllerKey={menuActionKey(action, index)}
                title={action.title}
                onLayout={(event) => {
                  if (
                    isMenuActionEnabled(action) &&
                    (returnTo !== null
                      ? menuActionKey(action, index) === returnTo
                      : action.state === "on")
                  )
                    menuScroll.current?.scrollTo({
                      y: Math.max(0, event.nativeEvent.layout.y - 48),
                      animated: false,
                    });
                }}
                subtitle={action.subtitle}
                accessibilityRole="menuitem"
                trailing={action.subactions?.length ? undefined : null}
                accessibilityState={{
                  selected:
                    returnTo !== null
                      ? menuActionKey(action, index) === returnTo
                      : action.state === "on",
                }}
                disabled={!isMenuActionEnabled(action)}
                titleClassName={
                  action.attributes?.destructive ? "text-danger-foreground" : undefined
                }
                onPress={() => {
                  if (!isMenuActionEnabled(action)) return;
                  setReturnTo(null);
                  if (action.subactions?.length)
                    setPath([...activePath, menuActionKey(action, index)]);
                  else if (action.id !== undefined) {
                    props.onClose();
                    props.onSelect(action.id);
                  }
                }}
              />
            ))}
          </ScreenScrollView>
        </ScreenContent>
      </ControllerConsole>
    </Sheet>
  );
}
