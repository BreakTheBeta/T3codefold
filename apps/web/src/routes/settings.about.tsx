import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old Fold settings URL; its content lives at /settings/general again. */
export const Route = createFileRoute("/settings/about")({
  beforeLoad: ({ location }) => {
    throw redirect({ to: "/settings/general", search: {}, hash: location.hash, replace: true });
  },
});
