import { useNavigate } from "@tanstack/react-router";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";

/** Sidebar entry for an environment without GLaDOS; setup lives in GLaDOS settings. */
export function CreateHome({
  environmentId,
  label,
}: {
  environmentId: EnvironmentId;
  label: string;
}) {
  const query = useEnvironmentQuery(serverEnvironment.pitbossLive({ environmentId, input: {} }));
  const navigate = useNavigate();
  if (!query.data || query.data.role) return null;
  return (
    <button
      type="button"
      onClick={() => void navigate({ to: "/settings/glados", search: { machine: environmentId } })}
      className="mx-2 my-1 rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
    >
      GLaDOS <span className="text-xs text-muted-foreground">· Set up · {label}</span>
    </button>
  );
}
