import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old settings URL; its content moved to /settings/git. */
export const Route = createFileRoute("/settings/storage")({
  beforeLoad: ({ location }) => {
    if (location.hash === "storage-artifacts") {
      throw redirect({ to: "/settings/about", search: true, hash: location.hash, replace: true });
    }
    throw redirect({
      to: "/settings/git",
      search: true,
      hash: location.hash || "storage-worktrees",
      replace: true,
    });
  },
});
