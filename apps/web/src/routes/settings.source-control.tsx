import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old settings URL; its content moved to /settings/git. */
export const Route = createFileRoute("/settings/source-control")({
  beforeLoad: ({ location }) => {
    throw redirect({ to: "/settings/git", search: true, hash: location.hash, replace: true });
  },
});
