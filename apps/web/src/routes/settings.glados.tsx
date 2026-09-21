import { createFileRoute } from "@tanstack/react-router";

import { GladosSettingsPanel } from "../components/pitboss/GladosSettings";

export const Route = createFileRoute("/settings/glados")({
  component: GladosSettingsPanel,
});
