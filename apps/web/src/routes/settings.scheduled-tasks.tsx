import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old settings URL; its content moved to /settings/tools. */
export const Route = createFileRoute("/settings/scheduled-tasks")({
  beforeLoad: ({ location }) => {
    throw redirect({
      to: "/settings/tools",
      search: true,
      hash: location.hash || "scheduled-tasks",
      replace: true,
    });
  },
});
