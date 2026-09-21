import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old settings URL; its content moved to /settings/agents. */
export const Route = createFileRoute("/settings/providers")({
  beforeLoad: ({ location }) => {
    throw redirect({ to: "/settings/agents", search: true, hash: location.hash, replace: true });
  },
});
