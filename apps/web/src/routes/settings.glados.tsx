import { createFileRoute } from "@tanstack/react-router";

import { GladosSettingsPanel } from "../components/glados/GladosSettings";

export const Route = createFileRoute("/settings/glados")({
  component: GladosSettingsPanel,
});
