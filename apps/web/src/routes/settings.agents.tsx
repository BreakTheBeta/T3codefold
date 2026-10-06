import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old Fold settings URL; its content lives at /settings/providers again. */
export const Route = createFileRoute("/settings/agents")({
  beforeLoad: ({ location }) => {
    throw redirect({ to: "/settings/providers", search: true, hash: location.hash, replace: true });
  },
});
