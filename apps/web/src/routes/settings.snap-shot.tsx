import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old settings URL; its content moved to /settings/tools. */
export const Route = createFileRoute("/settings/snap-shot")({
  beforeLoad: ({ location }) => {
    throw redirect({
      to: "/settings/tools",
      search: true,
      hash: location.hash || "snap-shot",
      replace: true,
    });
  },
});
