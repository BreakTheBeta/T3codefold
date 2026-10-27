import { MonitorIcon } from "lucide-react";

import { sidebarMachineScopeKey } from "../../sidebarProjectGrouping";
import { useEnvironmentIdentities } from "../../state/environments";
import { useThreadSelectionStore } from "../../threadSelectionStore";
import { useUiStateStore } from "../../uiStateStore";
import {
  Combobox,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxTrigger,
} from "../ui/combobox";
import { SidebarHeaderIconButton } from "./SidebarThreadHeader";

export function SidebarMachineFilter() {
  const environments = useEnvironmentIdentities();
  const scopeKey = useUiStateStore((store) => store.sidebarProjectScopeKey);
  const setScopeKey = useUiStateStore((store) => store.setSidebarProjectScopeKey);
  const clearSelection = useThreadSelectionStore((store) => store.clearSelection);
  const items = [
    { value: "all", label: "All machines" },
    ...environments.map((environment) => ({
      value: sidebarMachineScopeKey(environment.environmentId),
      label: environment.label,
    })),
  ];
  const selected = items.find((item) => item.value === scopeKey) ?? items[0]!;
  return (
    <Combobox
      items={items}
      value={selected}
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      onValueChange={(item) => {
        if (!item) return;
        clearSelection();
        setScopeKey(item.value === "all" ? null : item.value);
      }}
    >
      <ComboboxTrigger
        render={
          <SidebarHeaderIconButton
            label={
              selected.value === "all"
                ? "Filter threads by machine"
                : `Filter threads by machine: ${selected.label}`
            }
          />
        }
      >
        <MonitorIcon className="size-4" />
      </ComboboxTrigger>
      <ComboboxPopup align="start">
        <ComboboxList>
          {(item: (typeof items)[number]) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}
