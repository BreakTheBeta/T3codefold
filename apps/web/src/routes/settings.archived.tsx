import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old settings URL; its content moved to /settings/threads. */
export const Route = createFileRoute("/settings/archived")({
  beforeLoad: ({ location }) => {
    throw redirect({
      to: "/settings/threads",
      search: true,
      hash: location.hash || "archive",
      replace: true,
    });
  },
});
