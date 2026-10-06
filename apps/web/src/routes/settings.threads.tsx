import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old Fold settings URL; its content lives at /settings/archived again. */
export const Route = createFileRoute("/settings/threads")({
  beforeLoad: ({ location }) => {
    throw redirect({ to: "/settings/archived", search: {}, hash: location.hash, replace: true });
  },
});
